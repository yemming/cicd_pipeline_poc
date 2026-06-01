/**
 * 車輛成本歸集卡（Cost Object Card）domain helper — server-only（讀取層）
 *
 * 以 new_car_inventory 為成本單位（VIN = 身分證），組出「直接 / 間接 / 追加」三類成本
 * 歸集明細（from import_cost_allocations）+ 毛利試算 + 凍結狀態。
 * 天條：UI 只 import 本 helper，不直連 supabase。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPrintBrandBuyer, type PrintBrandInfo, type PrintBuyerInfo } from "@/lib/pdf/print-context";
import { costTypeToColumn } from "./import-landed-cost.constants";

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export type CostCardRow = {
  id: string;
  vin: string | null;
  color: string | null;
  model_display_name: string | null;
  status: string;
  shipment_no: string | null;
  cost_price: number;
  customs_duty: number;
  commodity_tax: number;
  import_fees: number;
  model_amortized_cost: number;
  total_cost: number;
  list_price: number | null;
  gross_margin: number | null; // list_price - total_cost
  margin_pct: number | null;
  cost_frozen_at: string | null;
};

export type CostCardFilters = { q?: string; status?: string; settled?: string };

const FIELDS = `
  id, vin, color, status, shipment_id, cost_price, list_price, customs_duty, commodity_tax,
  import_fees, model_amortized_cost, total_cost, cost_frozen_at,
  vehicle_models(display_name)
`.trim();

function mapCard(v: Record<string, unknown>, shipmentNo: string | null): CostCardRow {
  const total = num(v.total_cost);
  const list = v.list_price == null ? null : num(v.list_price);
  const gm = list == null ? null : list - total;
  return {
    id: v.id as string,
    vin: (v.vin as string) ?? null,
    color: (v.color as string) ?? null,
    model_display_name: (v.vehicle_models as { display_name?: string } | null)?.display_name ?? null,
    status: v.status as string,
    shipment_no: shipmentNo,
    cost_price: num(v.cost_price),
    customs_duty: num(v.customs_duty),
    commodity_tax: num(v.commodity_tax),
    import_fees: num(v.import_fees),
    model_amortized_cost: num(v.model_amortized_cost),
    total_cost: total,
    list_price: list,
    gross_margin: gm,
    margin_pct: gm != null && list && list > 0 ? Math.round((gm / list) * 1000) / 10 : null,
    cost_frozen_at: (v.cost_frozen_at as string) ?? null,
  };
}

export async function listCostCards(filters: CostCardFilters = {}): Promise<CostCardRow[]> {
  const supabase = await createClient();
  let q = supabase.from("new_car_inventory").select(`${FIELDS}, import_shipments(shipment_no)`).order("created_at", { ascending: false });
  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.settled === "imported") q = q.not("shipment_id", "is", null);
  if (filters.q?.trim()) q = q.or(`vin.ilike.%${filters.q.trim()}%,color.ilike.%${filters.q.trim()}%`);

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((v) =>
    mapCard(v, (v.import_shipments as { shipment_no?: string } | null)?.shipment_no ?? null),
  );
}

export type CostCardAllocation = {
  cost_type: string;
  bucket: string; // 對應成本欄
  allocated_amount: number;
};

export type CostCardDetail = CostCardRow & {
  shipment_id: string | null;
  allocations: CostCardAllocation[];
};

export async function getCostCard(vehicleId: string): Promise<CostCardDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select(`${FIELDS}, shipment_id, import_shipments(shipment_no)`)
    .eq("id", vehicleId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const v = data as unknown as Record<string, unknown>;
  const card = mapCard(v, (v.import_shipments as { shipment_no?: string } | null)?.shipment_no ?? null);

  const { data: aData } = await supabase
    .from("import_cost_allocations")
    .select("cost_type, allocated_amount")
    .eq("vehicle_id", vehicleId);
  const allocations: CostCardAllocation[] = ((aData ?? []) as Array<Record<string, unknown>>).map(
    (a) => ({
      cost_type: a.cost_type as string,
      bucket: costTypeToColumn(a.cost_type as string) ?? "import_vat",
      allocated_amount: num(a.allocated_amount),
    }),
  );

  return { ...card, shipment_id: (v.shipment_id as string) ?? null, allocations };
}

// ── 列印：車輛成本卡 ────────────────────────────────────────────────────

export type VehicleCostCardForPrint = {
  id: string;
  brand: PrintBrandInfo;
  buyer: PrintBuyerInfo;
  card: CostCardDetail;
};

export async function getVehicleCostCardForPrint(
  vehicleId: string,
): Promise<VehicleCostCardForPrint | null> {
  const card = await getCostCard(vehicleId);
  if (!card) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("new_car_inventory")
    .select("brand_id, subsidiary_id")
    .eq("id", vehicleId)
    .maybeSingle();
  const brandId = (data as { brand_id?: string } | null)?.brand_id ?? "indian";
  const subsidiaryId = (data as { subsidiary_id?: string } | null)?.subsidiary_id ?? null;
  const { brand, buyer } = await getPrintBrandBuyer(brandId, subsidiaryId);
  return { id: vehicleId, brand, buyer, card };
}
