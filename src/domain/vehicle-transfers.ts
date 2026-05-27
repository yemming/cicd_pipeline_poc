/**
 * RS_INV04 車輛調撥 domain helper — server-only。
 *
 * DB 表：vehicle_transfers（id, brand_id, transfer_no UNIQUE per brand,
 *   vehicle_kind new/used, new_car_id/used_car_id FK, from/to_warehouse_id,
 *   transfer_date, freight_type(A_VEHICLE_COST/B_FROM/C_TO/D_SPLIT/E_NONE),
 *   freight_amount, carrier, reason, status, metadata jsonb）。
 *
 * 副作用：freight_type='A_VEHICLE_COST' 時，運費寫回該車 transfer_freight_cost
 *   （new_car_inventory / used_car_inventory 依 vehicle_kind），total_cost 由 DB
 *   自動反映（含 transfer_freight_cost）。
 *
 * 架構：Typed Core + JSONB Metadata；UI 一律走本 helper、禁止直連 supabase。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  NEW_CAR_STATUS_LABELS,
  type NewCarInventoryStatus,
} from "./new-car-inventory.constants";
import {
  statusLabel as usedStatusLabel,
  type UsedCarDbStatus,
} from "./used-car-inventory.constants";
import {
  FREIGHT_TYPE_LABELS,
  type FreightType,
  type TransferableVehicle,
  type TransferStatus,
  type VehicleKind,
  type VehicleTransferFilters,
  type VehicleTransferRow,
  type WarehouseOption,
} from "./vehicle-transfers.constants";

export type {
  VehicleTransferRow,
  VehicleTransferFilters,
  TransferableVehicle,
  WarehouseOption,
} from "./vehicle-transfers.constants";

const TABLE = "vehicle_transfers";

const SELECT_FIELDS = `
  id, brand_id, transfer_no, vehicle_kind,
  new_car_id, used_car_id, from_warehouse_id, to_warehouse_id,
  transfer_date, freight_type, freight_amount, carrier, reason, status,
  metadata, created_at, updated_at, created_by
`.trim();

function vinTail(vin: string | null | undefined): string | null {
  if (!vin) return null;
  return vin.length > 6 ? vin.slice(-6) : vin;
}

// ── brand helper（與 new/used-car-inventory 同邏輯）─────────────────────
export async function getTransferBrandId(): Promise<string> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return "indian";
  const { data } = await supabase
    .from("profile_brands")
    .select("brand_id")
    .eq("user_id", userId)
    .limit(1)
    .single();
  return data?.brand_id ?? "indian";
}

// ── 單號流水：VTR-YYYYMMDD-NNN（per brand 當日流水）────────────────────
export async function nextTransferNo(brandId: string): Promise<string> {
  const supabase = await createClient();
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const ymd = `${tz.getFullYear()}${String(tz.getMonth() + 1).padStart(2, "0")}${String(
    tz.getDate(),
  ).padStart(2, "0")}`;
  const prefix = `VTR-${ymd}-`;
  const { data } = await supabase
    .from(TABLE)
    .select("transfer_no")
    .eq("brand_id", brandId)
    .ilike("transfer_no", `${prefix}%`)
    .order("transfer_no", { ascending: false })
    .limit(1);
  const top = (data ?? [])[0] as { transfer_no: string } | undefined;
  let seq = 1;
  if (top?.transfer_no) {
    const tail = top.transfer_no.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n)) seq = n + 1;
  }
  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// ── 倉庫 lookup（門店 = organizations level=2）─────────────────────────
export async function getWarehouseOptions(brandId: string): Promise<WarehouseOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("brand_id", brandId)
    .eq("level", 2)
    .order("name");
  if (error) throw new Error(`getWarehouseOptions: ${error.message}`);
  return (data ?? []) as WarehouseOption[];
}

// ── 可調撥車輛清單（new + used 合併）──────────────────────────────────
// 排除已售 / 已交車 / 報損；中古排除已售 / 下架。
export async function listTransferableVehicles(
  brandId: string,
): Promise<TransferableVehicle[]> {
  const supabase = await createClient();

  const [newRes, usedRes] = await Promise.all([
    supabase
      .from("new_car_inventory")
      .select(
        "id, vin, status, total_cost, organization_id, vehicle_models(display_name)",
      )
      .eq("brand_id", brandId)
      .not("status", "in", "(sold,delivered,damaged)")
      .order("created_at", { ascending: false }),
    supabase
      .from("used_car_inventory")
      .select(
        "id, vin, status, total_cost, listing_price, organization_id, model_display_name",
      )
      .eq("brand_id", brandId)
      .not("status", "in", "(sold,withdrawn)")
      .order("created_at", { ascending: false }),
  ]);

  if (newRes.error) throw new Error(`listTransferableVehicles(new): ${newRes.error.message}`);
  if (usedRes.error) throw new Error(`listTransferableVehicles(used): ${usedRes.error.message}`);

  type NewJoined = {
    id: string;
    vin: string | null;
    status: string;
    total_cost: number | null;
    organization_id: string | null;
    vehicle_models: { display_name?: string } | null;
  };
  type UsedJoined = {
    id: string;
    vin: string | null;
    status: string;
    total_cost: number | null;
    listing_price: number | null;
    organization_id: string | null;
    model_display_name: string | null;
  };

  const newVehicles: TransferableVehicle[] = ((newRes.data ?? []) as unknown as NewJoined[]).map(
    (r) => ({
      id: r.id,
      kind: "new" as VehicleKind,
      label: r.vehicle_models?.display_name ?? "（未指定車型）",
      vin: r.vin,
      vin_tail: vinTail(r.vin),
      status: r.status,
      status_label:
        NEW_CAR_STATUS_LABELS[r.status as NewCarInventoryStatus] ?? r.status,
      total_cost: r.total_cost,
      listing_price: null,
      organization_id: r.organization_id,
      pending_recon: false,
    }),
  );

  const usedVehicles: TransferableVehicle[] = ((usedRes.data ?? []) as unknown as UsedJoined[]).map(
    (r) => ({
      id: r.id,
      kind: "used" as VehicleKind,
      label: r.model_display_name ?? "（未指定車型）",
      vin: r.vin,
      vin_tail: vinTail(r.vin),
      status: r.status,
      status_label: usedStatusLabel(r.status as UsedCarDbStatus) ?? r.status,
      total_cost: r.total_cost,
      listing_price: r.listing_price,
      organization_id: r.organization_id,
      pending_recon: r.status === "pending_recon" || r.status === "pending_inspection",
    }),
  );

  return [...newVehicles, ...usedVehicles];
}

// ── 列表 ──────────────────────────────────────────────────────────────
export async function listVehicleTransfers(
  brandId: string,
  filters: VehicleTransferFilters = {},
): Promise<{ rows: VehicleTransferRow[]; totalCount: number }> {
  const supabase = await createClient();

  let q = supabase
    .from(TABLE)
    .select(SELECT_FIELDS, { count: "exact" })
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.freight_type) q = q.eq("freight_type", filters.freight_type);
  if (filters.vehicle_kind) q = q.eq("vehicle_kind", filters.vehicle_kind);
  if (filters.q?.trim()) {
    const kw = filters.q.trim();
    q = q.or(`transfer_no.ilike.%${kw}%,carrier.ilike.%${kw}%,reason.ilike.%${kw}%`);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(`listVehicleTransfers: ${error.message}`);

  const rows = (data ?? []) as unknown as VehicleTransferRow[];
  const enriched = await enrichTransfers(brandId, rows);
  return { rows: enriched, totalCount: count ?? enriched.length };
}

export async function getVehicleTransferById(
  id: string,
): Promise<VehicleTransferRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .select(SELECT_FIELDS)
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`getVehicleTransferById: ${error.message}`);
  }
  const row = data as unknown as VehicleTransferRow;
  const enriched = await enrichTransfers(row.brand_id, [row]);
  return enriched[0] ?? null;
}

/**
 * 把調撥單列表攤平顯示欄（車輛 label / VIN 末 6 碼 / 來去倉名）。
 * 一次撈相關 new/used 車輛 + 倉庫，避免 N+1。
 */
async function enrichTransfers(
  brandId: string,
  rows: VehicleTransferRow[],
): Promise<VehicleTransferRow[]> {
  if (rows.length === 0) return [];
  const supabase = await createClient();

  const newIds = rows.map((r) => r.new_car_id).filter((x): x is string => !!x);
  const usedIds = rows.map((r) => r.used_car_id).filter((x): x is string => !!x);
  const whIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.from_warehouse_id, r.to_warehouse_id])
        .filter((x): x is string => !!x),
    ),
  );

  const [newRes, usedRes, whRes] = await Promise.all([
    newIds.length
      ? supabase
          .from("new_car_inventory")
          .select("id, vin, vehicle_models(display_name)")
          .in("id", newIds)
      : Promise.resolve({ data: [], error: null }),
    usedIds.length
      ? supabase
          .from("used_car_inventory")
          .select("id, vin, model_display_name")
          .in("id", usedIds)
      : Promise.resolve({ data: [], error: null }),
    whIds.length
      ? supabase.from("organizations").select("id, name").in("id", whIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const newMap = new Map<string, { label: string; vin: string | null }>();
  for (const r of (newRes.data ?? []) as unknown as Array<{
    id: string;
    vin: string | null;
    vehicle_models: { display_name?: string } | null;
  }>) {
    newMap.set(r.id, { label: r.vehicle_models?.display_name ?? "（新車）", vin: r.vin });
  }
  const usedMap = new Map<string, { label: string; vin: string | null }>();
  for (const r of (usedRes.data ?? []) as unknown as Array<{
    id: string;
    vin: string | null;
    model_display_name: string | null;
  }>) {
    usedMap.set(r.id, { label: r.model_display_name ?? "（中古車）", vin: r.vin });
  }
  const whMap = new Map<string, string>();
  for (const r of (whRes.data ?? []) as unknown as Array<{ id: string; name: string }>) {
    whMap.set(r.id, r.name);
  }

  return rows.map((r) => {
    const veh =
      r.vehicle_kind === "new" && r.new_car_id
        ? newMap.get(r.new_car_id)
        : r.vehicle_kind === "used" && r.used_car_id
          ? usedMap.get(r.used_car_id)
          : null;
    const vt = vinTail(veh?.vin);
    return {
      ...r,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      vehicle_label: veh ? `${veh.label}${vt ? `（…${vt}）` : ""}` : null,
      vin_tail: vt,
      from_warehouse_name: r.from_warehouse_id ? whMap.get(r.from_warehouse_id) ?? null : null,
      to_warehouse_name: r.to_warehouse_id ? whMap.get(r.to_warehouse_id) ?? null : null,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// 寫入（由 server action 呼叫）
// ─────────────────────────────────────────────────────────────────────

export type CreateTransferInput = {
  brand_id: string;
  transfer_no: string;
  vehicle_kind: VehicleKind;
  new_car_id?: string | null;
  used_car_id?: string | null;
  from_warehouse_id?: string | null;
  to_warehouse_id?: string | null;
  transfer_date?: string | null;
  freight_type: FreightType;
  freight_amount?: number | null;
  carrier?: string | null;
  reason?: string | null;
  status?: TransferStatus;
  metadata?: Record<string, unknown>;
  created_by?: string | null;
};

export async function insertVehicleTransfer(
  input: CreateTransferInput,
): Promise<{ id: string; transfer_no: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .insert({ ...input, status: input.status ?? "pending" })
    .select("id, transfer_no")
    .single();
  if (error) throw new Error(`insertVehicleTransfer: ${error.message}`);
  return data as { id: string; transfer_no: string };
}

/**
 * 把運費寫回該車 transfer_freight_cost（A_VEHICLE_COST 專用）。
 * 累加（+= freight），total_cost 由 DB 自動反映。回傳寫前 / 寫後成本（驗證用）。
 */
export async function addVehicleTransferFreight(
  kind: VehicleKind,
  vehicleId: string,
  freight: number,
): Promise<{ before: number; after: number; totalCostBefore: number | null; totalCostAfter: number | null }> {
  const supabase = await createClient();
  const table = kind === "new" ? "new_car_inventory" : "used_car_inventory";

  const { data: before, error: readErr } = await supabase
    .from(table)
    .select("transfer_freight_cost, total_cost")
    .eq("id", vehicleId)
    .single();
  if (readErr) throw new Error(`addVehicleTransferFreight(read): ${readErr.message}`);

  const prev = Number((before as { transfer_freight_cost: number | null }).transfer_freight_cost ?? 0);
  const totalBefore = (before as { total_cost: number | null }).total_cost;
  const next = prev + freight;

  const { error: updErr } = await supabase
    .from(table)
    .update({ transfer_freight_cost: next })
    .eq("id", vehicleId);
  if (updErr) throw new Error(`addVehicleTransferFreight(update): ${updErr.message}`);

  const { data: after } = await supabase
    .from(table)
    .select("total_cost")
    .eq("id", vehicleId)
    .single();

  return {
    before: prev,
    after: next,
    totalCostBefore: totalBefore != null ? Number(totalBefore) : null,
    totalCostAfter:
      after && (after as { total_cost: number | null }).total_cost != null
        ? Number((after as { total_cost: number | null }).total_cost)
        : null,
  };
}

export async function setVehicleTransferStatus(
  id: string,
  brandId: string,
  status: TransferStatus,
): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(TABLE)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("brand_id", brandId)
    .select("id")
    .single();
  if (error) throw new Error(`setVehicleTransferStatus: ${error.message}`);
  return data as { id: string };
}

/** 純顯示用：freight_type → 中文 label（給 server component 用） */
export function freightLabel(t: FreightType | null): string {
  return t ? FREIGHT_TYPE_LABELS[t] : "—";
}
