/**
 * 展廳新車庫存 domain helper — server-only
 *
 * 對應 DB 表：new_car_inventory
 * 視角：展廳現場現貨（dealer / RS 視角）
 * 庫管視角（/inventory/vehicles）同源資料、不同切面，共用本 helper。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { NewCarInventoryStatus, LicensePlateStatus, NewCarInventoryRow, NewCarInventoryInput, NewCarInventoryFilters, VehicleModelOption, OrganizationOption, NewCarKpiSummary } from "./new-car-inventory.constants";

// ── Re-export types from .constants.ts（server-side caller 仍可 import from "@/domain/new-car-inventory"）──
export type {
  NewCarInventoryRow,
  NewCarInventoryFilters,
  NewCarInventoryInput,
  VehicleModelOption,
  OrganizationOption,
  NewCarKpiSummary,
} from "./new-car-inventory.constants";

// ── 查詢 ──────────────────────────────────────────────────────────────

const SELECT_FIELDS = `
  id, brand_id, subsidiary_id, organization_id,
  vin, external_id, vehicle_model_id,
  color, color_hex, config,
  year, engine_no, build_date,
  cost_price, list_price, status,
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
    reserved: rows.filter((r) => r.status === "reserved").length,
    in_transit: rows.filter((r) => r.status === "in_transit").length,
    arrived: rows.filter((r) => r.status === "arrived").length,
    sold_this_month: rows.filter(
      (r) => r.status === "sold" && r.sold_date?.startsWith(thisMonth)
    ).length,
  };
}
