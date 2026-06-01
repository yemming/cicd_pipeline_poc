/**
 * 進口批次 + Landed Cost 工作台 domain helper — server-only（讀取層）
 *
 * 對應表：import_shipments（批次/報關）+ new_car_inventory（批次內車輛）+
 *        import_cost_pool_lines（費用池）+ import_cost_allocations（分攤結果）。
 * 寫入（加費用 / commit 分攤）走 @/lib/vehicle-import/landed-cost-actions。
 * 天條：UI 只 import 本 helper / actions，不直連 supabase。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPrintBrandBuyer, type PrintBrandInfo, type PrintBuyerInfo } from "@/lib/pdf/print-context";
import type {
  ShipmentRow,
  ShipmentVehicleRow,
  PoolLineRow,
} from "./import-shipments.constants";

// 讓 UI 從 domain facade 一次拿型別（天條：UI 只 import @/domain/*）
export type {
  ShipmentRow,
  ShipmentVehicleRow,
  PoolLineRow,
  ShipmentStage,
  ShipmentStatus,
} from "./import-shipments.constants";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getShipmentBrandId(): Promise<string> {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user?.id) return "indian";
  const { data } = await supabase
    .from("profile_brands")
    .select("brand_id")
    .eq("user_id", u.user.id)
    .limit(1)
    .maybeSingle();
  return data?.brand_id ?? "indian";
}

const HEAD = `
  id, brand_id, shipment_no, purchase_order_id, bl_no, awb_no, customs_decl_no,
  vessel, forwarder, incoterms, total_cif, customs_valuation, etd, eta,
  customs_clear_date, stage, status, notes, created_at, gl_posted
`.trim();

export type ShipmentFilters = { q?: string; stage?: string; status?: string };

export async function listShipments(filters: ShipmentFilters = {}): Promise<ShipmentRow[]> {
  const supabase = await createClient();
  let q = supabase.from("import_shipments").select(HEAD).order("created_at", { ascending: false });
  if (filters.stage && filters.stage !== "all") q = q.eq("stage", filters.stage);
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.q?.trim()) {
    const t = filters.q.trim();
    q = q.or(`shipment_no.ilike.%${t}%,bl_no.ilike.%${t}%,customs_decl_no.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  const heads = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (heads.length === 0) return [];

  const ids = heads.map((h) => h.id as string);
  const [{ data: vRows }, { data: pRows }] = await Promise.all([
    supabase.from("new_car_inventory").select("shipment_id").in("shipment_id", ids),
    supabase.from("import_cost_pool_lines").select("shipment_id, amount").in("shipment_id", ids),
  ]);
  const vCount = new Map<string, number>();
  for (const r of (vRows ?? []) as Array<{ shipment_id: string | null }>) {
    if (r.shipment_id) vCount.set(r.shipment_id, (vCount.get(r.shipment_id) ?? 0) + 1);
  }
  const pTotal = new Map<string, number>();
  for (const r of (pRows ?? []) as Array<{ shipment_id: string | null; amount: number | null }>) {
    if (r.shipment_id) pTotal.set(r.shipment_id, (pTotal.get(r.shipment_id) ?? 0) + num(r.amount));
  }

  return heads.map((h) => mapShipment(h, vCount.get(h.id as string) ?? 0, pTotal.get(h.id as string) ?? 0));
}

function mapShipment(h: Record<string, unknown>, vehicleCount: number, poolTotal: number): ShipmentRow {
  return {
    id: h.id as string,
    brand_id: h.brand_id as string,
    shipment_no: h.shipment_no as string,
    purchase_order_id: (h.purchase_order_id as string) ?? null,
    bl_no: (h.bl_no as string) ?? null,
    awb_no: (h.awb_no as string) ?? null,
    customs_decl_no: (h.customs_decl_no as string) ?? null,
    vessel: (h.vessel as string) ?? null,
    forwarder: (h.forwarder as string) ?? null,
    incoterms: (h.incoterms as string) ?? null,
    total_cif: h.total_cif == null ? null : num(h.total_cif),
    customs_valuation: h.customs_valuation == null ? null : num(h.customs_valuation),
    etd: (h.etd as string) ?? null,
    eta: (h.eta as string) ?? null,
    customs_clear_date: (h.customs_clear_date as string) ?? null,
    stage: (h.stage as ShipmentRow["stage"]) ?? "ordered",
    status: (h.status as ShipmentRow["status"]) ?? "open",
    notes: (h.notes as string) ?? null,
    created_at: (h.created_at as string) ?? null,
    gl_posted: (h.gl_posted as boolean) ?? false,
    vehicle_count: vehicleCount,
    pool_total: poolTotal,
    settled: (h.status as string) === "settled",
  };
}

export async function getShipmentById(id: string): Promise<ShipmentRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("import_shipments").select(HEAD).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const h = data as unknown as Record<string, unknown>;
  const [{ count: vc }, { data: pRows }] = await Promise.all([
    supabase.from("new_car_inventory").select("id", { count: "exact", head: true }).eq("shipment_id", id),
    supabase.from("import_cost_pool_lines").select("amount").eq("shipment_id", id),
  ]);
  const pool = ((pRows ?? []) as Array<{ amount: number | null }>).reduce((s, r) => s + num(r.amount), 0);
  return mapShipment(h, vc ?? 0, pool);
}

export async function getShipmentVehicles(shipmentId: string): Promise<ShipmentVehicleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select(
      `id, vin, color, status, cif_value, gross_weight_kg, cost_price, customs_duty,
       commodity_tax, import_fees, model_amortized_cost, total_cost, cost_frozen_at,
       vehicle_models(display_name)`,
    )
    .eq("shipment_id", shipmentId)
    .order("vin", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((v) => ({
    id: v.id as string,
    vin: (v.vin as string) ?? null,
    color: (v.color as string) ?? null,
    model_display_name:
      (v.vehicle_models as { display_name?: string } | null)?.display_name ?? null,
    status: v.status as string,
    cif_value: num(v.cif_value),
    gross_weight_kg: num(v.gross_weight_kg),
    cost_price: num(v.cost_price),
    customs_duty: num(v.customs_duty),
    commodity_tax: num(v.commodity_tax),
    import_fees: num(v.import_fees),
    model_amortized_cost: num(v.model_amortized_cost),
    total_cost: num(v.total_cost),
    cost_frozen_at: (v.cost_frozen_at as string) ?? null,
  }));
}

export async function listPoolLines(shipmentId: string): Promise<PoolLineRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_cost_pool_lines")
    .select(
      "id, shipment_id, cost_type, amount, allocation_basis, is_inventoriable, target_vehicle_id, payee, invoice_no, occurred_at",
    )
    .eq("shipment_id", shipmentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    shipment_id: r.shipment_id as string,
    cost_type: r.cost_type as string,
    amount: num(r.amount),
    allocation_basis: r.allocation_basis as string,
    is_inventoriable: r.is_inventoriable !== false,
    target_vehicle_id: (r.target_vehicle_id as string) ?? null,
    payee: (r.payee as string) ?? null,
    invoice_no: (r.invoice_no as string) ?? null,
    occurred_at: (r.occurred_at as string) ?? null,
  }));
}

export type AllocationRow = {
  pool_line_id: string;
  vehicle_id: string;
  cost_type: string;
  allocated_amount: number;
};

/** 既有分攤結果（commit 後）— 給成本卡與工作台「已結算」狀態用 */
export async function listAllocations(shipmentId: string): Promise<AllocationRow[]> {
  const supabase = await createClient();
  // 先抓本批次 pool line ids
  const { data: lines } = await supabase
    .from("import_cost_pool_lines")
    .select("id")
    .eq("shipment_id", shipmentId);
  const ids = ((lines ?? []) as Array<{ id: string }>).map((l) => l.id);
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .from("import_cost_allocations")
    .select("pool_line_id, vehicle_id, cost_type, allocated_amount")
    .in("pool_line_id", ids);
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => ({
    pool_line_id: r.pool_line_id as string,
    vehicle_id: r.vehicle_id as string,
    cost_type: r.cost_type as string,
    allocated_amount: num(r.allocated_amount),
  }));
}

export type LandedCostWorkbench = {
  shipment: ShipmentRow;
  vehicles: ShipmentVehicleRow[];
  poolLines: PoolLineRow[];
  allocations: AllocationRow[];
};

export async function getLandedCostWorkbench(
  shipmentId: string,
): Promise<LandedCostWorkbench | null> {
  const shipment = await getShipmentById(shipmentId);
  if (!shipment) return null;
  const [vehicles, poolLines, allocations] = await Promise.all([
    getShipmentVehicles(shipmentId),
    listPoolLines(shipmentId),
    listAllocations(shipmentId),
  ]);
  return { shipment, vehicles, poolLines, allocations };
}

// ── 列印：Landed Cost 結算表 ────────────────────────────────────────────

export type LandedCostStatementForPrint = {
  id: string;
  brand: PrintBrandInfo;
  buyer: PrintBuyerInfo;
  shipment: ShipmentRow;
  poolLines: PoolLineRow[];
  poolTotal: number;
  vehicles: ShipmentVehicleRow[];
  totals: {
    cif: number;
    customs_duty: number;
    commodity_tax: number;
    import_fees: number;
    model_amortized_cost: number;
    total_cost: number;
  };
};

export async function getLandedCostStatementForPrint(
  shipmentId: string,
): Promise<LandedCostStatementForPrint | null> {
  const wb = await getLandedCostWorkbench(shipmentId);
  if (!wb) return null;
  // buyer 法人：取批次內第一台車的 subsidiary（沒有就退回品牌名）
  const supabase = await createClient();
  const { data: firstVeh } = await supabase
    .from("new_car_inventory")
    .select("subsidiary_id")
    .eq("shipment_id", shipmentId)
    .limit(1)
    .maybeSingle();
  const subsidiaryId = (firstVeh as { subsidiary_id?: string } | null)?.subsidiary_id ?? null;
  const { brand, buyer } = await getPrintBrandBuyer(wb.shipment.brand_id, subsidiaryId);

  const totals = wb.vehicles.reduce(
    (t, v) => ({
      cif: t.cif + v.cif_value,
      customs_duty: t.customs_duty + v.customs_duty,
      commodity_tax: t.commodity_tax + v.commodity_tax,
      import_fees: t.import_fees + v.import_fees,
      model_amortized_cost: t.model_amortized_cost + v.model_amortized_cost,
      total_cost: t.total_cost + v.total_cost,
    }),
    { cif: 0, customs_duty: 0, commodity_tax: 0, import_fees: 0, model_amortized_cost: 0, total_cost: 0 },
  );

  return {
    id: shipmentId,
    brand,
    buyer,
    shipment: wb.shipment,
    poolLines: wb.poolLines,
    poolTotal: wb.poolLines.reduce((s, l) => s + l.amount, 0),
    vehicles: wb.vehicles,
    totals,
  };
}
