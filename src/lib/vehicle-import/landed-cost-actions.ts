"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  allocateCostPool,
  aggregateByVehicle,
  type PoolLineInput,
  type AllocationVehicle,
} from "@/domain/import-landed-cost.constants";
import { computeImportTaxes } from "@/domain/import-tax.constants";
import { resolveTariffRates } from "@/domain/hs-code-tariffs";

export type LandedCostResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) return { error: "請先登入" };
  if (!isAdmin) return { error: "需要 admin 權限" };
  return { userId };
}

type ShipmentRowLite = { id: string; brand_id: string; status: string };

async function loadShipment(
  sb: ReturnType<typeof createServiceClient>,
  shipmentId: string,
): Promise<ShipmentRowLite | null> {
  const { data } = await sb
    .from("import_shipments")
    .select("id, brand_id, status")
    .eq("id", shipmentId)
    .maybeSingle();
  return (data as ShipmentRowLite) ?? null;
}

export type PoolLineInputDto = {
  cost_type: string;
  amount: number;
  allocation_basis: "direct" | "cif" | "weight" | "qty" | "model_amort";
  is_inventoriable: boolean;
  target_vehicle_id?: string | null;
  payee?: string | null;
  invoice_no?: string | null;
  occurred_at?: string | null;
};

export async function addPoolLineAction(
  shipmentId: string,
  input: PoolLineInputDto,
): Promise<LandedCostResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  if (!input.cost_type) return { ok: false, error: "費用類型必填" };
  if (!Number.isFinite(input.amount) || input.amount <= 0)
    return { ok: false, error: "金額需為正數" };
  if (input.allocation_basis === "direct" && !input.target_vehicle_id)
    return { ok: false, error: "「直接歸屬」需指定車輛" };

  const sb = createServiceClient();
  const shipment = await loadShipment(sb, shipmentId);
  if (!shipment) return { ok: false, error: "找不到批次" };

  const { data, error } = await sb
    .from("import_cost_pool_lines")
    .insert({
      brand_id: shipment.brand_id,
      shipment_id: shipmentId,
      cost_type: input.cost_type,
      amount: input.amount,
      allocation_basis: input.allocation_basis,
      is_inventoriable: input.is_inventoriable,
      target_vehicle_id: input.target_vehicle_id ?? null,
      payee: input.payee?.trim() || null,
      invoice_no: input.invoice_no?.trim() || null,
      occurred_at: input.occurred_at || null,
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `新增費用失敗：${error.message}` };
  revalidatePath(`/vehicle-import/shipments/${shipmentId}`, "page");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function deletePoolLineAction(
  shipmentId: string,
  lineId: string,
): Promise<LandedCostResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const { error } = await sb.from("import_cost_pool_lines").delete().eq("id", lineId);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(`/vehicle-import/shipments/${shipmentId}`, "page");
  return { ok: true, data: { id: lineId } };
}

/**
 * 套稅則自動帶稅：對批次內每台「有 CIF + HS Code」的車，查稅則算稅（疊加），
 * 建立 direct 費用明細（關稅 / 貨物稅 / 推貿 / 進口營業稅[進項]）。
 * 冪等：先刪掉本批次既有的自動稅 line（metadata.auto_tax=true）再重建。
 */
export async function autoAddTaxLinesAction(
  shipmentId: string,
): Promise<LandedCostResult<{ created: number; skipped: string[] }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const shipment = await loadShipment(sb, shipmentId);
  if (!shipment) return { ok: false, error: "找不到批次" };

  const { data: vData } = await sb
    .from("new_car_inventory")
    .select("id, vin, cif_value, hs_code")
    .eq("shipment_id", shipmentId);
  const vehicles = (vData ?? []) as Array<{
    id: string;
    vin: string | null;
    cif_value: number | null;
    hs_code: string | null;
  }>;
  if (vehicles.length === 0) return { ok: false, error: "批次內沒有車輛" };

  const year = new Date(Date.now() + 8 * 3600 * 1000).getUTCFullYear();
  const skipped: string[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const v of vehicles) {
    const cif = Number(v.cif_value ?? 0);
    if (!v.hs_code || cif <= 0) {
      skipped.push(v.vin ?? v.id);
      continue;
    }
    const rates = await resolveTariffRates(v.hs_code, year);
    if (!rates) {
      skipped.push(`${v.vin ?? v.id}（無稅則 ${v.hs_code}）`);
      continue;
    }
    const tax = computeImportTaxes(cif, rates);
    const base = {
      brand_id: shipment.brand_id,
      shipment_id: shipmentId,
      allocation_basis: "direct",
      target_vehicle_id: v.id,
      occurred_at: null,
      created_by: gate.userId,
      metadata: { auto_tax: true },
    };
    rows.push(
      { ...base, cost_type: "customs", amount: tax.customs, is_inventoriable: true },
      { ...base, cost_type: "commodity_tax", amount: tax.commodityTax, is_inventoriable: true },
      { ...base, cost_type: "trade_fee", amount: tax.tradeFee, is_inventoriable: true },
      { ...base, cost_type: "import_vat", amount: tax.importVat, is_inventoriable: false },
    );
  }

  // 冪等：刪舊自動稅 line
  await sb
    .from("import_cost_pool_lines")
    .delete()
    .eq("shipment_id", shipmentId)
    .contains("metadata", { auto_tax: true });

  if (rows.length > 0) {
    const { error } = await sb.from("import_cost_pool_lines").insert(rows);
    if (error) return { ok: false, error: `自動帶稅失敗：${error.message}` };
  }
  revalidatePath(`/vehicle-import/shipments/${shipmentId}`, "page");
  return { ok: true, data: { created: rows.length, skipped } };
}

/**
 * Commit 分攤：把費用池依各 line 的分攤基礎攤到每台車，寫 import_cost_allocations（audit），
 * 並把 inventoriable 部分回寫 new_car_inventory 成本欄（冪等：每次重算覆蓋）。
 * 進口營業稅（is_inventoriable=false）不入成本欄（走 GL 進項，Round D）。
 */
export async function commitAllocationAction(
  shipmentId: string,
): Promise<LandedCostResult<{ vehicles: number; allocated: number }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const shipment = await loadShipment(sb, shipmentId);
  if (!shipment) return { ok: false, error: "找不到批次" };

  const [{ data: vData }, { data: lData }, { data: amortData }] = await Promise.all([
    sb
      .from("new_car_inventory")
      .select("id, vehicle_model_id, cif_value, gross_weight_kg, cost_frozen_at")
      .eq("shipment_id", shipmentId),
    sb
      .from("import_cost_pool_lines")
      .select("id, cost_type, amount, allocation_basis, is_inventoriable, target_vehicle_id, metadata")
      .eq("shipment_id", shipmentId),
    // 車型攤提權重（business_rules model_amortization，本品牌、啟用中）
    sb
      .from("business_rules")
      .select("config")
      .eq("rule_kind", "model_amortization")
      .eq("brand_id", shipment.brand_id)
      .eq("is_active", true),
  ]);

  // model_id → amort_weight（沒設定的車型 weight=1，退化均攤）
  const amortWeightMap = new Map<string, number>();
  for (const r of (amortData ?? []) as Array<{ config: Record<string, unknown> }>) {
    const mid = r.config?.model_id as string;
    const w = Number(r.config?.amort_weight);
    if (mid && Number.isFinite(w)) amortWeightMap.set(mid, w);
  }

  const vehiclesRaw = (vData ?? []) as Array<{
    id: string;
    vehicle_model_id: string | null;
    cif_value: number | null;
    gross_weight_kg: number | null;
    cost_frozen_at: string | null;
  }>;
  const linesRaw = (lData ?? []) as Array<{
    id: string;
    cost_type: string;
    amount: number | null;
    allocation_basis: string;
    is_inventoriable: boolean;
    target_vehicle_id: string | null;
    metadata: Record<string, unknown> | null;
  }>;
  // 補列三道關：未核准的補列（is_post_addition 且 approval_status≠approved）不納入分攤
  const lines = linesRaw.filter((l) => {
    const m = l.metadata ?? {};
    if (m.is_post_addition) return m.approval_status === "approved";
    return true;
  });
  if (vehiclesRaw.length === 0) return { ok: false, error: "批次內沒有車輛" };
  if (lines.length === 0) return { ok: false, error: "費用池是空的（或補列尚未核准），請先登錄費用或自動帶稅" };

  const frozen = vehiclesRaw.filter((v) => v.cost_frozen_at);
  if (frozen.length > 0)
    return { ok: false, error: `有 ${frozen.length} 台車成本已凍結（已售出），不可重結算` };

  const vehicles: AllocationVehicle[] = vehiclesRaw.map((v) => ({
    id: v.id,
    cif_value: Number(v.cif_value ?? 0),
    gross_weight_kg: Number(v.gross_weight_kg ?? 0),
    // 車型攤提權重：有設定用設定值、否則 1（均攤）
    amort_weight: v.vehicle_model_id ? amortWeightMap.get(v.vehicle_model_id) ?? 1 : 1,
  }));
  const poolLines: PoolLineInput[] = lines.map((l) => ({
    id: l.id,
    cost_type: l.cost_type,
    amount: Number(l.amount ?? 0),
    allocation_basis: l.allocation_basis as PoolLineInput["allocation_basis"],
    is_inventoriable: l.is_inventoriable !== false,
    target_vehicle_id: l.target_vehicle_id,
  }));

  const allocLines = allocateCostPool(vehicles, poolLines);

  // 重寫 import_cost_allocations（清本批次「所有」pool line 的舊分攤，含被拒補列，再依核准後的 lines 重建）
  const allLineIds = linesRaw.map((l) => l.id);
  await sb.from("import_cost_allocations").delete().in("pool_line_id", allLineIds);
  if (allocLines.length > 0) {
    const { error: insErr } = await sb.from("import_cost_allocations").insert(
      allocLines.map((a) => ({
        brand_id: shipment.brand_id,
        pool_line_id: a.pool_line_id,
        vehicle_id: a.vehicle_id,
        cost_type: a.cost_type,
        allocated_amount: a.allocated_amount,
        ratio: a.ratio,
      })),
    );
    if (insErr) return { ok: false, error: `寫入分攤明細失敗：${insErr.message}` };
  }

  // 回寫每台車成本欄（冪等覆蓋；inventoriable only）
  const buckets = aggregateByVehicle(allocLines);
  for (const v of vehiclesRaw) {
    const b =
      buckets.get(v.id) ??
      { cost_price: 0, customs_duty: 0, commodity_tax: 0, model_amortized_cost: 0, import_fees: 0 };
    const patch: Record<string, unknown> = {
      customs_duty: b.customs_duty,
      commodity_tax: b.commodity_tax,
      import_fees: b.import_fees,
      model_amortized_cost: b.model_amortized_cost,
      updated_at: new Date().toISOString(),
    };
    // 只有出現 goods 直接費用才覆蓋 cost_price（否則保留進貨價基底）
    if (b.cost_price > 0) patch.cost_price = b.cost_price;
    const { error: upErr } = await sb.from("new_car_inventory").update(patch).eq("id", v.id);
    if (upErr) return { ok: false, error: `回寫車輛成本失敗：${upErr.message}` };
  }

  await sb.from("import_shipments").update({ status: "settled", updated_at: new Date().toISOString() }).eq("id", shipmentId);

  revalidatePath(`/vehicle-import/shipments/${shipmentId}`, "page");
  revalidatePath("/vehicle-import/cost-cards", "page");
  return { ok: true, data: { vehicles: vehiclesRaw.length, allocated: allocLines.length } };
}
