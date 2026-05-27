/**
 * RS_INV03 整車採購財務結算 domain helper — server-only
 *
 * 業務：採購單到港後，把該批進口費用（關稅 / 運費 / 保險）按各台車的「採購成本」
 *       佔比分攤回每台 new_car_inventory。
 *
 * 成本寫回策略（重要）：
 *   new_car_inventory 沒有獨立的 customs / freight / insurance 欄位。分攤後三項加總
 *   進 `cost_price`，把 cost_price 從「採購價」升級成「到岸成本（landed cost）」——
 *   這樣自動被 generated 欄位 total_cost 吃進去（total_cost = cost_price + pdi_labor
 *   + pdi_parts + transfer_freight）。
 *   分攤明細（原始採購價 / 關 / 運 / 保各多少 + 結算時間）存 metadata.cost_settlement
 *   供追溯與冪等重跑。
 *
 * 純型別 + 純計算（allocateImportCosts）放 cost-settlement.constants.ts，client 可 value-import。
 *
 * 天條：UI 只 import 本 helper / server action，不直連 supabase。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  COST_SETTLEMENT_PAGE_SIZE_DEFAULT,
  type CostSettlementMeta,
  type SettlementPORow,
  type SettlementVehicle,
  type SettlementPODetail,
} from "./cost-settlement.constants";

// ── Re-export（server-side caller 仍可 import from "@/domain/cost-settlement"）──
export {
  COST_SETTLEMENT_PAGE_SIZE_DEFAULT,
  allocateImportCosts,
} from "./cost-settlement.constants";
export type {
  CostSettlementMeta,
  SettlementPORow,
  SettlementVehicle,
  SettlementPODetail,
  AllocationLine,
} from "./cost-settlement.constants";

// ── helper ────────────────────────────────────────────────────────────

async function getBrandId(): Promise<string> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return "indian";
  const { data } = await supabase
    .from("profile_brands")
    .select("brand_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.brand_id ?? "indian";
}

export async function getCostSettlementBrandId(): Promise<string> {
  return getBrandId();
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 從一台車的 metadata 取出 cost_settlement（型別安全） */
function readSettlement(metadata: unknown): CostSettlementMeta | null {
  if (!metadata || typeof metadata !== "object") return null;
  const cs = (metadata as Record<string, unknown>).cost_settlement;
  if (!cs || typeof cs !== "object") return null;
  const o = cs as Record<string, unknown>;
  if (typeof o.original_price !== "number") return null;
  return {
    original_price: num(o.original_price),
    customs: num(o.customs),
    freight: num(o.freight),
    insurance: num(o.insurance),
    settled_at: typeof o.settled_at === "string" ? o.settled_at : "",
  };
}

// ── 查詢 ──────────────────────────────────────────────────────────────

type RawVehicle = {
  id: string;
  purchase_order_id: string | null;
  cost_price: number | string | null;
  metadata: unknown;
};

/**
 * 待 / 已結算採購單列表。
 * 只列「已到港（含車輛）」的採購單 —— 結算動作前提是車輛主檔已建（到港確認後）。
 * 判定方式：採購單底下有 new_car_inventory row。
 */
export async function listSettlementPurchaseOrders(
  filters: { status?: string; q?: string } = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: SettlementPORow[]; totalCount: number }> {
  const supabase = await createClient();
  const brandId = await getBrandId();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? COST_SETTLEMENT_PAGE_SIZE_DEFAULT);

  // 撈所有已到港 / 已結算的採購單（arrived / closed），同 brand
  let q = supabase
    .from("vehicle_purchase_orders")
    .select("id, po_no, supplier_name, order_date, expected_arrival, status, brand_id")
    .eq("brand_id", brandId)
    .in("status", ["arrived", "closed"])
    .order("expected_arrival", { ascending: false, nullsFirst: false });

  if (filters.q?.trim()) {
    const term = filters.q.trim();
    q = q.or(`po_no.ilike.%${term}%,supplier_name.ilike.%${term}%`);
  }

  const { data: pos, error } = await q;
  if (error) throw error;

  type POHead = {
    id: string;
    po_no: string;
    supplier_name: string | null;
    order_date: string | null;
    expected_arrival: string | null;
    status: string;
    brand_id: string;
  };
  const heads = (pos ?? []) as POHead[];
  if (heads.length === 0) return { rows: [], totalCount: 0 };

  const poIds = heads.map((h) => h.id);

  // 撈這些 PO 底下所有車輛（取成本 + metadata 算 settled / 採購成本）
  const { data: vehicles, error: vErr } = await supabase
    .from("new_car_inventory")
    .select("id, purchase_order_id, cost_price, metadata")
    .eq("brand_id", brandId)
    .in("purchase_order_id", poIds);
  if (vErr) throw vErr;

  const byPo = new Map<
    string,
    { count: number; purchase: number; import: number; settled: boolean; settledAt: string | null }
  >();
  for (const v of (vehicles ?? []) as RawVehicle[]) {
    const poId = v.purchase_order_id;
    if (!poId) continue;
    const agg =
      byPo.get(poId) ?? { count: 0, purchase: 0, import: 0, settled: false, settledAt: null };
    const cs = readSettlement(v.metadata);
    const original = cs ? cs.original_price : num(v.cost_price);
    agg.count += 1;
    agg.purchase += original;
    if (cs) {
      agg.settled = true;
      agg.import += cs.customs + cs.freight + cs.insurance;
      if (cs.settled_at && (!agg.settledAt || cs.settled_at > agg.settledAt)) {
        agg.settledAt = cs.settled_at;
      }
    }
    byPo.set(poId, agg);
  }

  let rows: SettlementPORow[] = heads
    .filter((h) => byPo.has(h.id)) // 只列有車輛的 PO
    .map((h) => {
      const agg = byPo.get(h.id)!;
      return {
        id: h.id,
        po_no: h.po_no,
        supplier_name: h.supplier_name,
        order_date: h.order_date,
        expected_arrival: h.expected_arrival,
        status: h.status,
        brand_id: h.brand_id,
        vehicle_count: agg.count,
        total_purchase_cost: agg.purchase,
        total_import_cost: agg.import,
        settled: agg.settled,
        settled_at: agg.settledAt,
      };
    });

  // settled filter（client filter；量級小）
  if (filters.status === "pending") rows = rows.filter((r) => !r.settled);
  else if (filters.status === "settled") rows = rows.filter((r) => r.settled);

  const totalCount = rows.length;
  const from = (page - 1) * pageSize;
  return { rows: rows.slice(from, from + pageSize), totalCount };
}

/**
 * 結算作業頁：撈某 PO 的所有車輛（含採購成本基底 + 既有分攤明細）。
 */
export async function getSettlementPODetail(
  poId: string,
): Promise<SettlementPODetail | null> {
  const supabase = await createClient();
  const brandId = await getBrandId();

  const { data: head, error } = await supabase
    .from("vehicle_purchase_orders")
    .select("id, po_no, supplier_name, order_date, expected_arrival, status, brand_id")
    .eq("id", poId)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (error) throw error;
  if (!head) return null;

  const { data: vData, error: vErr } = await supabase
    .from("new_car_inventory")
    .select(
      `id, vin, color, status, cost_price, pdi_labor_cost, pdi_parts_cost,
       transfer_freight_cost, total_cost, metadata,
       vehicle_models(display_name, series)`,
    )
    .eq("purchase_order_id", poId)
    .eq("brand_id", brandId)
    .order("vin", { ascending: true });
  if (vErr) throw vErr;

  type JoinedVehicle = {
    id: string;
    vin: string | null;
    color: string | null;
    status: string;
    cost_price: number | string | null;
    pdi_labor_cost: number | string | null;
    pdi_parts_cost: number | string | null;
    transfer_freight_cost: number | string | null;
    total_cost: number | string | null;
    metadata: unknown;
    vehicle_models: { display_name?: string; series?: string } | null;
  };

  const vehicles: SettlementVehicle[] = ((vData ?? []) as unknown as JoinedVehicle[]).map(
    (v) => {
      const cs = readSettlement(v.metadata);
      const costPrice = num(v.cost_price);
      return {
        id: v.id,
        vin: v.vin,
        color: v.color,
        model_display_name: v.vehicle_models?.display_name ?? null,
        model_series: v.vehicle_models?.series ?? null,
        status: v.status,
        cost_price: costPrice,
        original_price: cs ? cs.original_price : costPrice,
        pdi_labor_cost: num(v.pdi_labor_cost),
        pdi_parts_cost: num(v.pdi_parts_cost),
        transfer_freight_cost: num(v.transfer_freight_cost),
        total_cost: num(v.total_cost),
        settlement: cs,
      };
    },
  );

  const total_purchase_cost = vehicles.reduce((s, v) => s + v.original_price, 0);
  const settled = vehicles.some((v) => v.settlement !== null);
  const existing_customs = vehicles.reduce((s, v) => s + (v.settlement?.customs ?? 0), 0);
  const existing_freight = vehicles.reduce((s, v) => s + (v.settlement?.freight ?? 0), 0);
  const existing_insurance = vehicles.reduce((s, v) => s + (v.settlement?.insurance ?? 0), 0);

  return {
    id: head.id,
    po_no: head.po_no,
    supplier_name: head.supplier_name,
    order_date: head.order_date,
    expected_arrival: head.expected_arrival,
    status: head.status,
    brand_id: head.brand_id,
    vehicles,
    total_purchase_cost,
    settled,
    existing_customs: Math.round(existing_customs),
    existing_freight: Math.round(existing_freight),
    existing_insurance: Math.round(existing_insurance),
  };
}
