"use server";

/**
 * Round D：進口落地成本 GL 過帳（與 commitAllocation 分離的明確過帳動作）。
 *
 *   postLandedCostGlAction     批次結算後逐車過帳：
 *                              - 每台車一筆 VEHICLE_IMPORT_LANDED_COST
 *                                Dr 存貨1210102(該車可入庫落地成本) + Dr 留抵1190401(該車進口營業稅進項)
 *                                / Cr GR/IR-車輛2170106(合計，待補正式發票)
 *                                逐車過帳是因 1210102 必填 VEHICLE/VIN/MODEL/MODEL_YEAR 維度。
 *                              - 逐車 postCostEvent('landed_cost')→ 餵 deliverVehicle 的 COGS
 *   reverseLandedCostGlAction  沖銷：逐筆反向分錄 + 逐車補相反 landed_cost 事件
 *
 * 增量資本化：只認落地成本（關稅+貨物稅+進口費用+車型攤提），基本車價走 VEHICLE_INVENTORY_RECEIPT，
 * 不雙重計數。進口營業稅(is_inventoriable=false)走進項分離(留抵)、不入存貨。
 * 冪等：以 import_shipments.gl_posted 守門；entry_ids 存 metadata.gl_landed 供沖銷。
 * 天條：UI 只 import 本 actions。
 */

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { postCostEvent } from "@/domain/costing";
import { instantiateTransaction, TX_TYPES } from "@/domain/transactions";

export type GlResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) return { error: "請先登入" };
  if (!isAdmin) return { error: "需要 admin 權限" };
  return { userId };
}

type ShipmentGlRow = {
  id: string;
  brand_id: string;
  shipment_no: string;
  status: string;
  gl_posted: boolean;
  metadata: Record<string, unknown>;
};

type VehicleLanded = {
  id: string;
  vin: string | null;
  model_id: string | null;
  model_year: string | null;
  subsidiary_id: string | null;
  organization_id: string | null;
  inventoriable: number; // 該車可入庫落地成本（不含基本車價、不含進項稅）
  import_vat: number; // 該車進口營業稅進項
};

async function loadShipmentAndVehicles(
  sb: ReturnType<typeof createServiceClient>,
  shipmentId: string,
): Promise<{ shipment: ShipmentGlRow; vehicles: VehicleLanded[] } | null> {
  const { data: s } = await sb
    .from("import_shipments")
    .select("id, brand_id, shipment_no, status, gl_posted, metadata")
    .eq("id", shipmentId)
    .maybeSingle();
  if (!s) return null;

  const { data: vData } = await sb
    .from("new_car_inventory")
    .select(
      "id, vin, year, vehicle_model_id, subsidiary_id, organization_id, customs_duty, commodity_tax, import_fees, model_amortized_cost",
    )
    .eq("shipment_id", shipmentId);

  // 逐車進口營業稅進項（from import_cost_allocations，commit 後）
  const { data: aData } = await sb
    .from("import_cost_allocations")
    .select("vehicle_id, allocated_amount")
    .eq("cost_type", "import_vat")
    .in(
      "vehicle_id",
      ((vData ?? []) as Array<{ id: string }>).map((v) => v.id),
    );
  const vatByVehicle = new Map<string, number>();
  for (const a of (aData ?? []) as Array<{ vehicle_id: string; allocated_amount: number | null }>) {
    vatByVehicle.set(a.vehicle_id, (vatByVehicle.get(a.vehicle_id) ?? 0) + Number(a.allocated_amount ?? 0));
  }

  const vehicles: VehicleLanded[] = ((vData ?? []) as Array<Record<string, unknown>>).map((v) => ({
    id: v.id as string,
    vin: (v.vin as string) ?? null,
    model_id: (v.vehicle_model_id as string) ?? null,
    model_year: v.year != null ? String(v.year) : null,
    subsidiary_id: (v.subsidiary_id as string) ?? null,
    organization_id: (v.organization_id as string) ?? null,
    inventoriable: round2(
      Number(v.customs_duty ?? 0) +
        Number(v.commodity_tax ?? 0) +
        Number(v.import_fees ?? 0) +
        Number(v.model_amortized_cost ?? 0),
    ),
    import_vat: round2(vatByVehicle.get(v.id as string) ?? 0),
  }));
  return { shipment: { ...(s as ShipmentGlRow), metadata: (s.metadata as Record<string, unknown>) ?? {} }, vehicles };
}

/** 解析批次的 subsidiary_id + store_id（缺則退回品牌預設法人 + 其下一個 store） */
async function resolveScopeDims(
  sb: ReturnType<typeof createServiceClient>,
  brandId: string,
  vehicles: VehicleLanded[],
): Promise<{ subsidiary_id: string | null; store_id: string | null }> {
  let subsidiaryId = vehicles.find((v) => v.subsidiary_id)?.subsidiary_id ?? null;
  let storeId = vehicles.find((v) => v.organization_id)?.organization_id ?? null;
  if (storeId && !subsidiaryId) {
    const { data: org } = await sb
      .from("organizations")
      .select("subsidiary_id")
      .eq("id", storeId)
      .maybeSingle();
    subsidiaryId = (org?.subsidiary_id as string) ?? null;
  }
  if (!subsidiaryId) {
    const { data: brandRow } = await sb
      .from("brands")
      .select("default_subsidiary_id")
      .eq("id", brandId)
      .maybeSingle();
    subsidiaryId = (brandRow?.default_subsidiary_id as string) ?? null;
  }
  if (subsidiaryId && !storeId) {
    const { data: store } = await sb
      .from("organizations")
      .select("id")
      .eq("subsidiary_id", subsidiaryId)
      .eq("is_active", true)
      .order("level", { ascending: false })
      .limit(1)
      .maybeSingle();
    storeId = (store?.id as string) ?? null;
  }
  return { subsidiary_id: subsidiaryId, store_id: storeId };
}

export async function postLandedCostGlAction(
  shipmentId: string,
): Promise<GlResult<{ entries: number; func_landed: number; func_import_vat: number }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();

  const loaded = await loadShipmentAndVehicles(sb, shipmentId);
  if (!loaded) return { ok: false, error: "找不到批次" };
  const { shipment, vehicles } = loaded;
  if (shipment.gl_posted) return { ok: false, error: "此批次落地成本已過帳，請勿重複（重結算請先沖銷）" };
  if (shipment.status !== "settled")
    return { ok: false, error: "請先在工作台 commit 分攤（批次需為已結算）再過帳" };

  const postable = vehicles.filter((v) => v.inventoriable > 0 || v.import_vat > 0);
  if (postable.length === 0) return { ok: false, error: "落地成本與進項稅皆為 0，無需過帳" };

  const dims = await resolveScopeDims(sb, shipment.brand_id, vehicles);
  if (!dims.subsidiary_id) return { ok: false, error: "無法解析法人（SUBSIDIARY），無法過帳" };

  const entryIds: string[] = [];
  let totalLanded = 0;
  let totalVat = 0;

  for (const v of postable) {
    if (!v.model_id || !v.model_year) {
      // 1210102 必填 MODEL/MODEL_YEAR；缺則無法過帳該車（先擋、回報而非靜默跳過）
      return {
        ok: false,
        error: `車 ${v.vin ?? v.id} 缺車型/年份維度（MODEL/MODEL_YEAR），無法過帳。已過帳 ${entryIds.length} 筆，請沖銷後補資料重試。`,
      };
    }
    const gl = await instantiateTransaction(
      TX_TYPES.VEHICLE_IMPORT_LANDED_COST,
      {
        vehicle_id: v.id,
        vin: v.vin,
        model_id: v.model_id,
        model_year: v.model_year,
        store_id: dims.store_id,
        subsidiary_id: dims.subsidiary_id,
        func_landed: v.inventoriable,
        func_import_vat: v.import_vat,
        shipment_no: shipment.shipment_no,
      },
      { autoPost: true, userId: gate.userId },
    );
    if (!gl.ok) {
      return {
        ok: false,
        error: `車 ${v.vin ?? v.id} GL 過帳失敗：${gl.error}。已過帳 ${entryIds.length} 筆，請沖銷後重試。`,
      };
    }
    entryIds.push(gl.data.entry_id);
    totalLanded += v.inventoriable;
    totalVat += v.import_vat;

    // 逐車成本事件（landed_cost）— 冪等用 net 判斷：只補足「目標 - 現有淨額」的差額。
    // 處理 fresh(net 0→補全額) / 重跑(net=target→不動) / 沖銷後重貼(net 0→補全額) 三種情境。
    if (v.inventoriable > 0) {
      const { data: prior } = await sb
        .from("inventory_cost_ledger")
        .select("amount_delta")
        .eq("vehicle_id", v.id)
        .eq("event_type", "landed_cost")
        .eq("source_table", "import_shipments")
        .eq("source_id", shipmentId);
      const net = round2(
        ((prior ?? []) as Array<{ amount_delta: number | null }>).reduce((s, r) => s + Number(r.amount_delta ?? 0), 0),
      );
      const delta = round2(v.inventoriable - net);
      if (delta > 0.01) {
        const ev = await postCostEvent({
          subjectType: "vehicle",
          eventType: "landed_cost",
          brandId: shipment.brand_id,
          vehicleId: v.id,
          amountIn: delta,
          subsidiaryId: dims.subsidiary_id ?? undefined,
          sourceTable: "import_shipments",
          sourceId: shipmentId,
          userId: gate.userId,
          notes: `進口落地成本資本化 ${shipment.shipment_no}`,
        });
        if (!ev.ok) {
          return {
            ok: false,
            error: `車 ${v.vin ?? v.id} 成本事件失敗：${ev.error}。已過帳 ${entryIds.length} 筆，請沖銷後重試。`,
          };
        }
      }
    }
  }

  // 全部成功 → 標記 gl_posted + 存 entry_ids 供沖銷
  await sb
    .from("import_shipments")
    .update({
      gl_posted: true,
      gl_posted_at: new Date().toISOString(),
      journal_entry_id: entryIds[0] ?? null,
      metadata: { ...shipment.metadata, gl_landed: { entry_ids: entryIds, posted_at: new Date().toISOString() } },
      updated_at: new Date().toISOString(),
    })
    .eq("id", shipmentId);

  revalidatePath(`/vehicle-import/shipments/${shipmentId}`, "page");
  revalidatePath("/vehicle-import/cost-cards", "page");
  return {
    ok: true,
    data: { entries: entryIds.length, func_landed: round2(totalLanded), func_import_vat: round2(totalVat) },
  };
}

/** 反向沖銷單一已過帳分錄（借貸對調、entry_no-REV、標記 reversed） */
async function reverseEntry(
  sb: ReturnType<typeof createServiceClient>,
  entryId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: orig } = await sb
    .from("journal_entries")
    .select("id, tenant_id, entry_no, description, status")
    .eq("id", entryId)
    .maybeSingle();
  if (!orig) return { ok: false, error: `找不到分錄 ${entryId}` };
  if (orig.status === "reversed") return { ok: true }; // 已沖銷，視為成功（冪等）
  if (orig.status !== "posted") return { ok: false, error: `分錄 ${orig.entry_no} 非 posted（${orig.status}）` };

  const { data: lines } = await sb
    .from("journal_entry_lines")
    .select("line_no, coa_id, debit, credit, dimensions, description")
    .eq("entry_id", entryId)
    .order("line_no");
  if (!lines?.length) return { ok: false, error: `分錄 ${orig.entry_no} 無行` };

  const { data: rev, error: revErr } = await sb
    .from("journal_entries")
    .insert({
      tenant_id: orig.tenant_id,
      entry_no: `${orig.entry_no}-REV`,
      entry_date: new Date().toISOString().slice(0, 10),
      description: `沖銷 ${orig.entry_no}：${orig.description ?? ""}`.trim(),
      status: "draft",
      reversed_by_entry_id: orig.id,
      created_by: userId,
    })
    .select("id")
    .single();
  if (revErr) return { ok: false, error: `建沖銷分錄失敗：${revErr.message}` };

  const { error: lErr } = await sb.from("journal_entry_lines").insert(
    lines.map((l) => ({
      entry_id: rev.id,
      line_no: l.line_no,
      coa_id: l.coa_id,
      debit: l.credit,
      credit: l.debit,
      dimensions: l.dimensions,
      description: l.description,
    })),
  );
  if (lErr) {
    await sb.from("journal_entries").delete().eq("id", rev.id);
    return { ok: false, error: `寫沖銷行失敗：${lErr.message}` };
  }
  await sb.from("journal_entries").update({ status: "posted", posted_by: userId }).eq("id", rev.id);
  await sb.from("journal_entries").update({ status: "reversed" }).eq("id", orig.id);
  return { ok: true };
}

export async function reverseLandedCostGlAction(
  shipmentId: string,
): Promise<GlResult<{ reversed: number }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();

  const loaded = await loadShipmentAndVehicles(sb, shipmentId);
  if (!loaded) return { ok: false, error: "找不到批次" };
  const { shipment, vehicles } = loaded;
  if (!shipment.gl_posted) return { ok: false, error: "此批次尚未過帳，無分錄可沖銷" };

  const glLanded = (shipment.metadata.gl_landed as { entry_ids?: string[] } | undefined) ?? {};
  const entryIds = glLanded.entry_ids ?? [];

  // 1) 逐筆反向沖銷分錄
  for (const eid of entryIds) {
    const r = await reverseEntry(sb, eid, gate.userId);
    if (!r.ok) return { ok: false, error: `沖銷分錄失敗：${r.error}` };
  }

  // 2) 逐車補相反 landed_cost 事件（退回資本化的落地成本）
  for (const v of vehicles) {
    if (v.inventoriable <= 0) continue;
    const ev = await postCostEvent({
      subjectType: "vehicle",
      eventType: "landed_cost",
      brandId: shipment.brand_id,
      vehicleId: v.id,
      amountIn: -v.inventoriable,
      subsidiaryId: v.subsidiary_id ?? undefined,
      sourceTable: "import_shipments",
      sourceId: shipmentId,
      userId: gate.userId,
      notes: `沖銷進口落地成本 ${shipment.shipment_no}`,
    });
    if (!ev.ok) return { ok: false, error: `沖銷車輛成本事件失敗：${ev.error}` };
  }

  // 3) 清旗標
  const meta = { ...shipment.metadata };
  delete (meta as Record<string, unknown>).gl_landed;
  await sb
    .from("import_shipments")
    .update({ gl_posted: false, journal_entry_id: null, metadata: meta, updated_at: new Date().toISOString() })
    .eq("id", shipmentId);

  revalidatePath(`/vehicle-import/shipments/${shipmentId}`, "page");
  revalidatePath("/vehicle-import/cost-cards", "page");
  return { ok: true, data: { reversed: entryIds.length } };
}
