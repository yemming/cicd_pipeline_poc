/**
 * 展廳新車庫存 domain helper — server-only
 *
 * 對應 DB 表：new_car_inventory
 * 視角：展廳現場現貨（dealer / RS 視角）
 * 庫管視角（/inventory/vehicles）同源資料、不同切面，共用本 helper。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type { NewCarInventoryStatus, NewCarInventoryRow, NewCarInventoryInput, NewCarInventoryFilters, VehicleModelOption, OrganizationOption, NewCarKpiSummary, NewCarByModelDatum, NewCarSlowMover, DemoRetireToUsedInput, VehicleUnitOption } from "./new-car-inventory.constants";

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
  DemoRetireToUsedInput,
  VehicleUnitOption,
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
  is_demo_unit, demo_asset_acquired_at, demo_retired_at, converted_to_used_inventory_id,
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
    // Demo 車欄位（DB DEFAULT false，確保前端讀到 boolean）
    is_demo_unit: (r.is_demo_unit as boolean) ?? false,
    demo_asset_acquired_at: (r.demo_asset_acquired_at as string | null) ?? null,
    demo_retired_at: (r.demo_retired_at as string | null) ?? null,
    converted_to_used_inventory_id: (r.converted_to_used_inventory_id as string | null) ?? null,
  };
}

export async function listNewCars(
  filters: NewCarInventoryFilters = {}
): Promise<NewCarInventoryRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  let q = supabase
    .from("new_car_inventory")
    .select(SELECT_FIELDS)
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false });

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.license_plate_status) q = q.eq("license_plate_status", filters.license_plate_status);
  if (filters.color) q = q.eq("color", filters.color);
  if (filters.vehicle_model_id) q = q.eq("vehicle_model_id", filters.vehicle_model_id);
  if (filters.q) q = q.or(`vin.ilike.%${filters.q}%,color.ilike.%${filters.q}%,engine_no.ilike.%${filters.q}%`);
  // Demo 車 filter：true=只列 demo；false=排除 demo；undefined=全部
  if (filters.is_demo_unit === true) q = q.eq("is_demo_unit", true);
  if (filters.is_demo_unit === false) q = q.eq("is_demo_unit", false);

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
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select(SELECT_FIELDS)
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return mapRow(data as any);
}

/**
 * 訂單建立 wizard 用：列出某車款目前「可售」（displayed）且非 demo 車的具體單位（VIN）。
 * RS04：createSalesOrder() 靠 new_vehicle_id 才能真正鎖車，本函式讓 UI 有得選。
 */
export async function listSellableNewCarUnits(
  vehicleModelId: string
): Promise<VehicleUnitOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("id, vin, color, list_price, license_plate_status")
    .eq("brand_id", scope.brand_id)
    .eq("vehicle_model_id", vehicleModelId)
    .eq("status", "displayed")
    .eq("is_demo_unit", false)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as VehicleUnitOption[];
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
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("new_car_inventory")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) throw error;
}

export async function deleteNewCar(id: string): Promise<void> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("new_car_inventory")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) throw error;
}

/** 兩業務員幾乎同時對同一台車按狀態按鈕時，用 CAS 擋下後到者，避免 lost update */
export class StaleNewCarStatusError extends Error {
  constructor() {
    super("此車輛狀態已被其他人異動，請重新整理後再試");
    this.name = "StaleNewCarStatusError";
  }
}

export async function setNewCarStatus(
  id: string,
  status: NewCarInventoryStatus,
  expectedCurrentStatus?: NewCarInventoryStatus
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
    incident_hold: null,
    frozen: null,
  };
  const field = dateField[status];
  const patch: Record<string, unknown> = { status };
  if (field) patch[field] = new Date().toISOString().slice(0, 10);

  const scope = await getActiveScope();
  let query = supabase
    .from("new_car_inventory")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (expectedCurrentStatus) query = query.eq("status", expectedCurrentStatus);
  const { data, error } = await query.select("id");
  if (error) throw error;
  if (expectedCurrentStatus && (data ?? []).length === 0) {
    throw new StaleNewCarStatusError();
  }
}

// ── Lookup helpers（供 page.tsx 使用，避免 UI 直連 supabase）─────────

export async function getVehicleModelOptions(): Promise<VehicleModelOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("vehicle_models")
    .select("id, display_name, series, msrp")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("series")
    .order("display_name");
  if (error) throw error;
  return (data ?? []) as VehicleModelOption[];
}

export async function getOrganizationOptions(): Promise<OrganizationOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name")
    .eq("brand_id", scope.brand_id)
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
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("status, sold_date")
    .eq("brand_id", scope.brand_id);
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
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("status, vehicle_models(display_name, series)")
    .eq("brand_id", scope.brand_id);
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
        incident_hold: 0,
        frozen: 0,
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
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("id, vin, color, status, arrival_date, list_price, vehicle_models(display_name)")
    .eq("brand_id", scope.brand_id)
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

// ── Demo 車管理（A1）─────────────────────────────────────────────────

/**
 * 列出所有 demo 車（is_demo_unit=true），供試乘選車使用。
 * 回傳 id + status + vin + model_display_name + color；
 * 排除 incident_hold（事故中，不可被試乘）。
 */
export type DemoVehicleOption = {
  id: string;
  vin: string | null;
  model_display_name: string | null;
  color: string | null;
  status: NewCarInventoryStatus;
  demo_asset_acquired_at: string | null;
};

export async function listDemoVehicles(): Promise<DemoVehicleOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("new_car_inventory")
    .select("id, vin, color, status, demo_asset_acquired_at, vehicle_models(display_name)")
    .eq("brand_id", scope.brand_id)
    .eq("is_demo_unit", true)
    .neq("status", "incident_hold")  // 事故扣押中：不可被試乘
    .neq("status", "sold")
    .neq("status", "delivered")
    .order("demo_asset_acquired_at", { ascending: false });
  if (error) throw error;
  type Joined = {
    id: string;
    vin: string | null;
    color: string | null;
    status: string;
    demo_asset_acquired_at: string | null;
    vehicle_models: { display_name?: string } | null;
  };
  return ((data ?? []) as unknown as Joined[]).map((r) => ({
    id: r.id,
    vin: r.vin,
    model_display_name: r.vehicle_models?.display_name ?? null,
    color: r.color,
    status: r.status as NewCarInventoryStatus,
    demo_asset_acquired_at: r.demo_asset_acquired_at,
  }));
}

/**
 * 標記或取消 demo 車。
 * is_demo=true 時同時設 demo_asset_acquired_at（若尚未設定）。
 * is_demo=false 時清空 demo_asset_acquired_at（但 demo_retired_at 保留）。
 */
export async function markAsDemoUnit(
  id: string,
  is_demo: boolean,
  acquired_at?: string | null,
): Promise<void> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const patch: Record<string, unknown> = { is_demo_unit: is_demo };
  if (is_demo) {
    patch.demo_asset_acquired_at = acquired_at ?? new Date().toISOString().slice(0, 10);
  } else {
    patch.demo_asset_acquired_at = null;
  }
  const { error } = await supabase
    .from("new_car_inventory")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) throw error;
}

/**
 * demo 車退役轉中古車（一次性不可逆）。
 *
 * 流程：
 *  1. 確認目標車是 is_demo_unit=true 且尚未退役（demo_retired_at IS NULL）
 *  2. 建立 used_car_inventory 記錄（status = 'pending_inspection' 觸發車況書流程，不是 available）
 *  3. 回寫 new_car_inventory：demo_retired_at=today, converted_to_used_inventory_id=新 used id,
 *     status='delivered'（退出庫存流程）
 *
 * 注意：
 *  - 不觸發 used_car_evaluations（鑑價）
 *  - 上架售價由操作者輸入（商業定價，不綁帳面 cost_price）
 *  - 車況書 condition_report 由技師填（pending_inspection 狀態觸發）
 */
export async function retireDemoToUsed(
  input: DemoRetireToUsedInput,
): Promise<{ usedCarId: string }> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. 確認 demo 車存在且未退役
  const { data: car, error: fetchErr } = await supabase
    .from("new_car_inventory")
    .select("id, is_demo_unit, demo_retired_at, vehicle_model_id, vin, brand_id, color, list_price, cost_price, organization_id")
    .eq("id", input.new_car_id)
    .eq("brand_id", scope.brand_id)
    .single();
  if (fetchErr || !car) throw new Error("找不到該新車記錄");
  if (!car.is_demo_unit) throw new Error("此車不是 demo 車，無法執行退役操作");
  if (car.demo_retired_at) throw new Error("此 demo 車已退役，不可重複操作");

  const today = new Date().toISOString().slice(0, 10);

  // 2. 建立 used_car_inventory 記錄（pending_inspection = 待車況書）
  const { data: usedCar, error: usedErr } = await supabase
    .from("used_car_inventory")
    .insert({
      brand_id: scope.brand_id,
      organization_id: car.organization_id ?? null,
      vehicle_model_id: car.vehicle_model_id ?? null,
      model_display_name: input.model_display_name,
      year: input.year,
      color: input.color ?? (car.color as string | null) ?? null,
      vin: car.vin ?? null,
      mileage_km: input.mileage_km ?? 0,
      acquisition_price: (car.cost_price as number | null) ?? null,
      listing_price: input.listing_price,
      cost: (car.cost_price as number | null) ?? null,
      acquisition_source: "other",   // demo 退役特殊來源
      acquisition_date: today,
      listed_date: null,             // 尚未上架，車況書完成後再設
      status: "pending_inspection",  // 觸發車況書流程（不是 available）
      note: input.note ?? `由 demo 車 ${car.vin ?? car.id} 退役轉入`,
      // 反向追溯 typed column（Russell 裁示一：可互相追溯查詢）；metadata 同步保留向下相容
      converted_from_demo_id: input.new_car_id,
      metadata: {
        converted_from_demo_id: input.new_car_id,
        converted_at: today,
        converted_by: user?.id ?? null,
      },
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (usedErr || !usedCar) throw new Error(`建立中古車記錄失敗：${usedErr?.message}`);

  // 3. 回寫 new_car_inventory：退役日期 + 追溯 id + status → delivered（退出庫存）
  const { error: updateErr } = await supabase
    .from("new_car_inventory")
    .update({
      demo_retired_at: today,
      converted_to_used_inventory_id: (usedCar as { id: string }).id,
      status: "delivered",  // 退出新車庫存流程（不是 sold，但也不再待售）
    })
    .eq("id", input.new_car_id)
    .eq("brand_id", scope.brand_id);
  if (updateErr) {
    // rollback：刪掉剛建的 used_car 記錄（最佳努力）
    await supabase.from("used_car_inventory").delete().eq("id", (usedCar as { id: string }).id);
    throw new Error(`回寫 demo 車退役狀態失敗：${updateErr.message}`);
  }

  return { usedCarId: (usedCar as { id: string }).id };
}
