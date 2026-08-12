"use server";

/**
 * 代理商內部供應履約（Russell《補充勘誤：③號文件第二節最終修正方案》2026-08-11）
 *
 * 取代對象：《DealerOS_經銷商層級隔離規則_拍板與實作指令_20260809.md》第二節
 * 舊版「跨經銷商詢問機制」（cross_dealer_part_inquiries 表 + 借用式調撥）整段作廢。
 *
 * 新方案：代理商是特殊供應商，不建新表，沿用既有 purchase_orders / suppliers。
 *   1. 經銷商 A 開 PO，vendor 選「海德生（集團內部供應）」（code = AGENCY_INTERNAL_SUPPLIER_CODE）
 *   2. PO 核准後（見 src/domain/orders.ts 的 approvePurchaseOrder 呼叫本檔 fulfillAgencyInternalPO）：
 *      - 代理商自己倉夠 → 不動作，走既有 GRN 收貨流程即可
 *      - 代理商倉不夠、經銷商 C 有貨 → 自動建立「C → 代理商」的真實內部採購單（買斷，非借用）
 *      - 全網都沒貨 → 記錄在 PO metadata.agency_fulfillment.backordered，不強制成立交易
 *   3. A 全程只看得到「海德生（集團內部供應商）」，看不到 C 的任何蹤跡（不回傳 buyback PO 給 A 的查詢介面）
 *
 * ⚠️ 本檔不寫入庫存數量本身——實際「貨從哪個倉搬到哪個倉」仍走既有 GRN（receiveStock）流程，
 *    由對應倉管人員實際確認到貨後收貨。本檔只負責：判斷來源 + 建立真實的買斷 PO 單據（稽核鏈）。
 *    這是刻意的保守設計：不在使用者沒有確認實際收貨動作的情況下，程式自動生出庫存異動。
 */

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { resolveDealerScope } from "@/lib/scope/dealer-scope";
import { getActiveScope } from "@/lib/scope/active-scope";
import { writeAuditLog } from "@/domain/audit-logs";
import {
  AGENCY_INTERNAL_SUPPLIER_CODE,
  type ActionResult,
  type DealerStockMatch,
  type FulfillmentOutcome,
} from "@/domain/agency-fulfillment.constants";

export type { ActionResult, DealerStockMatch } from "@/domain/agency-fulfillment.constants";

/**
 * 查詢所有經銷商的庫存（僅代理商/集團層級可執行）。
 *
 * 沿用《DealerOS_經銷商層級隔離規則_拍板與實作指令_20260809.md》§2.3 原本設計的同一支函式，
 * 只是呼叫時機改變：原本是代理商人員手動點查詢，現在由 fulfillAgencyInternalPO 在 PO 核准流程
 * 自動呼叫（見 Russell 2026-08-11 補充勘誤第 122 行）。
 */
export async function searchAllDealersStockAction(
  itemId: string,
): Promise<ActionResult<DealerStockMatch[]>> {
  const scope = await getActiveScope();
  const dealerScope = await resolveDealerScope(scope.brand_id);
  if (!dealerScope.isGroupLevel) {
    return { ok: false, error: "僅代理商/集團層級可查詢跨經銷商庫存" };
  }

  const supabase = await createClient();
  const { data: balances, error } = await supabase
    .from("v_stock_balances")
    .select("warehouse_id, warehouse_name, qty_available")
    .eq("item_id", itemId)
    .eq("brand_id", scope.brand_id)
    .gt("qty_available", 0);

  if (error) return { ok: false, error: error.message };
  if (!balances || balances.length === 0) return { ok: true, data: [] };

  const warehouseIds = Array.from(new Set(balances.map((b) => b.warehouse_id)));
  const { data: warehouseRows, error: whErr } = await supabase
    .from("warehouses")
    .select("id, org_id, organizations(id, name)")
    .in("id", warehouseIds);
  if (whErr) return { ok: false, error: whErr.message };

  const orgByWarehouse = new Map(
    (warehouseRows ?? []).map((w) => {
      const org = Array.isArray(w.organizations) ? w.organizations[0] : w.organizations;
      return [w.id, org as { id: string; name: string } | null] as const;
    }),
  );

  const matches = balances
    .map((b) => {
      const org = orgByWarehouse.get(b.warehouse_id);
      if (!org) return null;
      return {
        orgId: org.id,
        orgName: org.name,
        warehouseId: b.warehouse_id,
        warehouseName: b.warehouse_name,
        qtyAvailable: b.qty_available,
      };
    })
    .filter((x): x is DealerStockMatch => x !== null);

  return { ok: true, data: matches };
}

async function getAgencyOrgId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("organizations")
    .select("id")
    .eq("brand_id", brandId)
    .eq("level", 1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function getOrgAvailableStock(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  orgId: string,
  itemId: string,
): Promise<number> {
  const { data: whs } = await supabase
    .from("warehouses")
    .select("id")
    .eq("brand_id", brandId)
    .eq("org_id", orgId)
    .eq("is_active", true);
  const warehouseIds = (whs ?? []).map((w) => w.id as string);
  if (warehouseIds.length === 0) return 0;

  const { data } = await supabase
    .from("v_stock_balances")
    .select("qty_available")
    .eq("brand_id", brandId)
    .eq("item_id", itemId)
    .in("warehouse_id", warehouseIds);
  return (data ?? []).reduce((sum, r) => sum + Number(r.qty_available ?? 0), 0);
}

/** 找出（或建立）代表某經銷商的供應商列，用來當買斷 PO 的 vendor_id */
async function getOrCreateDealerAsSupplier(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  dealerOrgId: string,
): Promise<ActionResult<{ id: string }>> {
  const { data: existing } = await supabase
    .from("suppliers")
    .select("id")
    .eq("brand_id", brandId)
    .contains("metadata", { internal_dealer_org_id: dealerOrgId })
    .maybeSingle();
  if (existing) return { ok: true, data: { id: existing.id as string } };

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("code, name")
    .eq("id", dealerOrgId)
    .single();
  if (orgErr || !org) return { ok: false, error: "找不到經銷商組織資料" };

  const { data: created, error } = await supabase
    .from("suppliers")
    .insert({
      brand_id: brandId,
      code: `DEALER-${org.code}`,
      name: `${org.name}（經銷商間調度）`,
      supplier_type: "internal_agency",
      type: "agent",
      is_active: true,
      metadata: { internal_dealer_org_id: dealerOrgId, is_internal_dealer_supplier: true },
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: created.id as string } };
}

/**
 * PO 核准後的履約判斷（由 src/domain/orders.ts 的 approvePurchaseOrder 呼叫）。
 * 只有 vendor 是「海德生（集團內部供應）」（AGENCY_INTERNAL_SUPPLIER_CODE）時才動作；
 * 其餘一般外部供應商（Castrol 等）直接略過，不影響既有 PO 核准流程。
 */
export async function fulfillAgencyInternalPO(
  poId: string,
): Promise<ActionResult<{ lines: FulfillmentOutcome[] }>> {
  const supabase = await createClient();

  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select("id, brand_id, warehouse_id, metadata, suppliers(code)")
    .eq("id", poId)
    .single();
  if (poErr || !po) return { ok: false, error: "找不到 PO" };

  const supplierCode = Array.isArray(po.suppliers) ? po.suppliers[0]?.code : (po.suppliers as { code?: string } | null)?.code;
  if (supplierCode !== AGENCY_INTERNAL_SUPPLIER_CODE) {
    // 一般外部供應商，不受本次修改影響
    return { ok: true, data: { lines: [] } };
  }

  const agencyOrgId = await getAgencyOrgId(supabase, po.brand_id);
  if (!agencyOrgId) return { ok: false, error: "找不到該品牌的總代理組織，無法判斷代理商自有庫存" };

  const { data: lines, error: linesErr } = await supabase
    .from("purchase_order_lines")
    .select("id, item_id, qty_ordered")
    .eq("po_id", poId);
  if (linesErr) return { ok: false, error: linesErr.message };

  const { data: agencyWarehouses } = await supabase
    .from("warehouses")
    .select("id")
    .eq("brand_id", po.brand_id)
    .eq("org_id", agencyOrgId)
    .eq("is_active", true)
    .limit(1);
  const agencyWarehouseId = (agencyWarehouses ?? [])[0]?.id as string | undefined;

  const { userId } = await getCurrentUserAndAdmin();
  const outcomes: FulfillmentOutcome[] = [];
  const createdBuybackPos: Array<{ id: string; po_no: string }> = [];

  for (const line of lines ?? []) {
    const itemId = line.item_id as string;
    const qtyOrdered = Number(line.qty_ordered);

    const ownStock = await getOrgAvailableStock(supabase, po.brand_id, agencyOrgId, itemId);
    if (ownStock >= qtyOrdered) {
      outcomes.push({ itemId, outcome: "own_stock_sufficient" });
      continue;
    }

    if (!agencyWarehouseId) {
      // 代理商在這個品牌底下還沒有自己的倉——資料缺口，無法建買斷 PO 的收貨倉，記為待補貨
      outcomes.push({ itemId, outcome: "backordered" });
      continue;
    }

    const shortfall = qtyOrdered - ownStock;
    const matchesRes = await searchAllDealersStockAction(itemId);
    const source = matchesRes.ok
      ? matchesRes.data
          .filter((m) => m.orgId !== agencyOrgId)
          .find((m) => m.qtyAvailable >= shortfall)
      : null;

    if (!source) {
      outcomes.push({ itemId, outcome: "backordered" });
      continue;
    }

    const supplierRes = await getOrCreateDealerAsSupplier(supabase, po.brand_id, source.orgId);
    if (!supplierRes.ok) {
      outcomes.push({ itemId, outcome: "backordered" });
      continue;
    }

    // 買斷單價：沿用 A 這張原始 PO 的單價（代理商賣給 A 多少，就用同樣單價向 C 買回）
    const { data: origLine } = await supabase
      .from("purchase_order_lines")
      .select("unit_price")
      .eq("id", line.id)
      .single();
    const unitPrice = Number(origLine?.unit_price ?? 0);

    const today = new Date();
    const dateStr =
      today.getFullYear().toString() +
      String(today.getMonth() + 1).padStart(2, "0") +
      String(today.getDate()).padStart(2, "0");
    const { data: lastPO } = await supabase
      .from("purchase_orders")
      .select("po_no")
      .eq("brand_id", po.brand_id)
      .like("po_no", `PO${dateStr}-%`)
      .order("po_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    let seq = 1;
    if (lastPO?.po_no) {
      const m = (lastPO.po_no as string).match(/-(\d+)$/);
      if (m) seq = parseInt(m[1], 10) + 1;
    }
    const po_no = `PO${dateStr}-${String(seq).padStart(3, "0")}`;
    const pretax = Math.round(shortfall * unitPrice * 100) / 100;
    const taxRate = 0.05;
    const taxAmt = Math.round(pretax * taxRate * 100) / 100;
    const total = pretax + taxAmt;

    const { data: buybackPo, error: buybackErr } = await supabase
      .from("purchase_orders")
      .insert({
        brand_id: po.brand_id,
        po_no,
        vendor_id: supplierRes.data.id,
        warehouse_id: agencyWarehouseId,
        purchase_type: "internal_buyback",
        notes: `經銷商間庫存調度（代理商中介，非 A 經銷商所知悉）— 來源 PO ${poId}`,
        po_date: today.toISOString().slice(0, 10),
        qty_ordered_total: shortfall,
        amount_pretax: pretax,
        amount_tax: taxAmt,
        amount_total: total,
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: userId ?? null,
        created_by: userId ?? null,
        metadata: { source: "agency_fulfillment", source_po_id: poId, source_po_line_id: line.id, source_dealer_org_id: source.orgId },
      })
      .select("id, po_no")
      .single();
    if (buybackErr || !buybackPo) {
      outcomes.push({ itemId, outcome: "backordered" });
      continue;
    }

    const { error: buybackLineErr } = await supabase.from("purchase_order_lines").insert({
      brand_id: po.brand_id,
      po_id: buybackPo.id,
      line_no: 1,
      item_id: itemId,
      qty_ordered: shortfall,
      unit_price: unitPrice,
      uom: "PCS",
      tax_rate: taxRate,
      line_amount_pretax: pretax,
      line_amount_tax: taxAmt,
      line_amount_total: total,
    });
    if (buybackLineErr) {
      await supabase.from("purchase_orders").delete().eq("id", buybackPo.id);
      outcomes.push({ itemId, outcome: "backordered" });
      continue;
    }

    await writeAuditLog({
      table_name: "purchase_orders",
      record_id: buybackPo.id as string,
      action: "dealer_stock_buyback_for_redistribution",
      actor_id: userId ?? null,
      brand_id: po.brand_id,
      after: {
        from_org_id: source.orgId,
        to_org_id: agencyOrgId,
        item_id: itemId,
        qty: shortfall,
        source_po_id: poId,
      },
    });

    createdBuybackPos.push({ id: buybackPo.id as string, po_no: buybackPo.po_no as string });
    outcomes.push({
      itemId,
      outcome: "buyback_created",
      buybackPoId: buybackPo.id as string,
      buybackPoNo: buybackPo.po_no as string,
      sourceDealerOrgId: source.orgId,
    });
  }

  const backordered = outcomes.filter((o) => o.outcome === "backordered").map((o) => o.itemId);
  const existingMeta = (po.metadata as Record<string, unknown> | null) ?? {};
  await supabase
    .from("purchase_orders")
    .update({
      metadata: {
        ...existingMeta,
        agency_fulfillment: {
          checked_at: new Date().toISOString(),
          backordered,
          buyback_pos: createdBuybackPos,
        },
      },
    })
    .eq("id", poId);

  return { ok: true, data: { lines: outcomes } };
}
