/**
 * 展廳新車庫存 domain helper — server-only
 *
 * 對應 DB 表：new_car_inventory
 * 視角：展廳現場現貨（dealer / RS 視角）
 * 庫管視角（/inventory/vehicles）同源資料、不同切面，共用本 helper。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { NewCarInventoryStatus, LicensePlateStatus, NewCarInventoryRow, NewCarInventoryInput, NewCarInventoryFilters, VehicleModelOption, OrganizationOption, NewCarKpiSummary, NewCarByModelDatum, NewCarSlowMover } from "./new-car-inventory.constants";

// ── Re-export types from .constants.ts（server-side caller 仍可 import from "@/domain/new-car-inventory"）──
export type {
  NewCarInventoryRow,
  NewCarInventoryFilters,
  NewCarInventoryInput,
  VehicleModelOption,
  OrganizationOption,
  NewCarKpiSummary,
  NewCarByModelDatum,
  NewCarSlowMover,
} from "./new-car-inventory.constants";

// ── 查詢 ──────────────────────────────────────────────────────────────

const SELECT_FIELDS = `
  id, brand_id, subsidiary_id, organization_id,
  vin, external_id, vehicle_model_id,
  color, color_hex, config,
  year, engine_no, build_date,
  cost_price, list_price,
  pdi_labor_cost, pdi_parts_cost, transfer_freight_cost, total_cost,
  pdi_workorder_id, purchase_order_id, arrival_batch_id, damage_flag, damage_notes,
  status,
  arrival_date, displayed_date, reserved_date, sold_date, delivered_date,
  license_plate_status, license_plate_no,
  linked_sales_order_id, note, images, metadata,
  created_at, updated_at, created_by, updated_by,
  vehicle_models(display_name, series),
  organizations(name)
`.trim();

function mapRow(r: Record<string, unknown>): NewCarInventoryRow {
  const vm = r.vehicle_models as { display_name?: string; series?: string } | null;
  const org = r.organizations as { name?: string } | null;
  return {
    ...(r as Omit<NewCarInventoryRow, "model_display_name" | "model_series" | "organization_name">),
    config: (r.config as Record<string, unknown>) ?? {},
    images: (r.images as string[]) ?? [],
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    model_display_name: vm?.display_name ?? null,
    model_series: vm?.series ?? null,
    organization_name: org?.name ?? null,
  };
}

export async function listNewCars(
  filters: NewCarInventoryFilters = {}
): Promise<NewCarInventoryRow[]> {
  const supabase = await createClient();
  let q = supabase.from("new_car_inventory").select(SELECT_FIELDS).order("created_at", { ascending: false });

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.license_plate_status) q = q.eq("license_plate_status", filters.license_plate_status);
  if (filters.color) q = q.eq("color", filters.color);
  if (filters.q) q = q.or(`vin.ilike.%${filters.q}%,color.ilike.%${filters.q}%,engine_no.ilike.%${filters.q}%`);

  const { data, error } = await q;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let rows = (data ?? []).map((r) => mapRow(r as any));

  // series filter — join 後過濾
  if (filters.series) {
    rows = rows.filter((r) => r.model_series === filters.series);
  }

  return rows;
}

export async function getNewCarById(id: string): Promise<NewCarInventoryRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select(SELECT_FIELDS)
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mapRow(data as any);
}

export async function createNewCar(
  input: NewCarInventoryInput
): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .insert(input)
    .select("id")
    .single();
  if (error) throw error;
  return { id: (data as { id: string }).id };
}

export async function updateNewCar(
  id: string,
  patch: Partial<NewCarInventoryInput>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("new_car_inventory")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteNewCar(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("new_car_inventory")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function setNewCarStatus(
  id: string,
  status: NewCarInventoryStatus
): Promise<void> {
  const supabase = await createClient();
  const dateField: Record<NewCarInventoryStatus, string | null> = {
    in_transit: null,
    pending_pdi: "arrival_date",
    arrived: "arrival_date",
    displayed: "displayed_date",
    reserved: "reserved_date",
    sold: "sold_date",
    delivered: "delivered_date",
    damaged: null,
  };
  const field = dateField[status];
  const patch: Record<string, unknown> = { status };
  if (field) patch[field] = new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("new_car_inventory")
    .update(patch)
    .eq("id", id);
  if (error) throw error;
}

// ── Lookup helpers（供 page.tsx 使用，避免 UI 直連 supabase）─────────

export async function getVehicleModelOptions(): Promise<VehicleModelOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_models")
    .select("id, display_name, series, msrp")
    .eq("is_active", true)
    .order("series")
    .order("display_name");
  if (error) throw error;
  return (data ?? []) as VehicleModelOption[];
}

export async function getOrganizationOptions(): Promise<OrganizationOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("level", 2)
    .order("name");
  if (error) throw error;
  return (data ?? []) as OrganizationOption[];
}

export async function getCurrentBrandId(): Promise<string> {
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

// ── 衍生統計（KPI 看板用）────────────────────────────────────────────

export async function getNewCarKpiSummary(): Promise<NewCarKpiSummary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("status, sold_date");
  if (error) throw error;

  const rows = (data ?? []) as { status: string; sold_date: string | null }[];
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return {
    displayed: rows.filter((r) => r.status === "displayed").length,
    pending_pdi: rows.filter((r) => r.status === "pending_pdi").length,
    reserved: rows.filter((r) => r.status === "reserved").length,
    in_transit: rows.filter((r) => r.status === "in_transit").length,
    arrived: rows.filter((r) => r.status === "arrived").length,
    sold_this_month: rows.filter(
      (r) => r.status === "sold" && r.sold_date?.startsWith(thisMonth)
    ).length,
  };
}

/**
 * 庫存量按車型 + status 堆疊（給 BarChart 用）。
 * 回傳每個車型一列、key=status 為 value，category 為車型名。
 */
export async function getNewCarInventoryByModel(): Promise<NewCarByModelDatum[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("status, vehicle_models(display_name, series)");
  if (error) throw error;

  type Joined = { status: string; vehicle_models: { display_name?: string; series?: string } | null };
  const rows = (data ?? []) as unknown as Joined[];

  const byModel = new Map<string, NewCarByModelDatum>();
  for (const r of rows) {
    const name = r.vehicle_models?.display_name ?? "（未指定）";
    if (!byModel.has(name)) {
      byModel.set(name, {
        model: name,
        series: r.vehicle_models?.series ?? null,
        in_transit: 0,
        pending_pdi: 0,
        arrived: 0,
        displayed: 0,
        reserved: 0,
        sold: 0,
        delivered: 0,
        damaged: 0,
        total: 0,
      });
    }
    const datum = byModel.get(name)!;
    const status = r.status as NewCarInventoryStatus;
    datum[status] = (datum[status] ?? 0) + 1;
    datum.total += 1;
  }

  return Array.from(byModel.values()).sort((a, b) => b.total - a.total);
}

/**
 * 庫齡 > {days} 天且尚未售出的車（slow movers）。
 */
export async function getNewCarSlowMovers(days = 90): Promise<NewCarSlowMover[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("id, vin, color, status, arrival_date, list_price, vehicle_models(display_name)")
    .in("status", ["arrived", "displayed", "reserved"])
    .not("arrival_date", "is", null);
  if (error) throw error;

  type Joined = {
    id: string;
    vin: string | null;
    color: string | null;
    status: string;
    arrival_date: string;
    list_price: number | null;
    vehicle_models: { display_name?: string } | null;
  };
  const rows = (data ?? []) as unknown as Joined[];
  const today = new Date();

  return rows
    .map((r) => {
      const arrived = new Date(r.arrival_date);
      const daysIn = Math.floor((today.getTime() - arrived.getTime()) / (1000 * 60 * 60 * 24));
      return {
        id: r.id,
        vin: r.vin,
        model_display_name: r.vehicle_models?.display_name ?? null,
        color: r.color,
        status: r.status as NewCarInventoryStatus,
        arrival_date: r.arrival_date,
        days_in_stock: daysIn,
        list_price: r.list_price,
      };
    })
    .filter((r) => r.days_in_stock > days)
    .sort((a, b) => b.days_in_stock - a.days_in_stock);
}
