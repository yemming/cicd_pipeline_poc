/**
 * 中古車庫存 domain helper — server-only。
 *
 * 服務：
 *   - /sales/showroom/used-cars（展廳接待視角）
 *   - /usedcar/stock（中古車輛模組視角）
 *
 * 架構：Typed Core + JSONB Metadata pattern。
 * DB 表：used_car_inventory（2026-05-17 migration）。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { UsedCarDbStatus, UsedCarConditionGrade, UsedCarAcquisitionSource, UsedCarInventoryRow } from "./used-car-inventory.constants";
import { USED_CAR_DB_STATUS_LABELS, calcDaysInStock, statusLabel } from "./used-car-inventory.constants";

// ── Re-export types + pure helpers from .constants.ts（server-side caller 仍可 import from "@/domain/used-car-inventory"）──
export type { UsedCarInventoryRow } from "./used-car-inventory.constants";
export { calcDaysInStock, statusLabel } from "./used-car-inventory.constants";

// ── KPI 計算結果 ──
export type UsedCarKpiSummary = {
  available: number;
  pendingInspection: number;
  reserved: number;
  sold: number;
  avgDaysInStock: number;
  soldThisMonth: number;
};

export type UsedCarInventoryData = {
  units: UsedCarInventoryRow[];
  kpis: UsedCarKpiSummary;
  totalCount: number;
};

// ── Filter 參數 ──
export type UsedCarFilter = {
  brandId: string;
  status?: string;
  conditionGrade?: string;
  kmRange?: string;
  search?: string;
};

// ── 主查詢：撈指定 brand 的庫存列表 ──
export async function listUsedCars(filter: UsedCarFilter): Promise<UsedCarInventoryData> {
  const supabase = await createClient();

  let q = supabase
    .from("used_car_inventory")
    .select("*", { count: "exact" })
    .eq("brand_id", filter.brandId)
    .order("created_at", { ascending: false });

  if (filter.status) {
    q = q.eq("status", filter.status);
  }
  if (filter.conditionGrade) {
    q = q.eq("condition_grade", filter.conditionGrade);
  }
  if (filter.search) {
    q = q.ilike("model_display_name", `%${filter.search}%`);
  }

  // 里程區間 filter（client-side，資料量小）
  const { data, error, count } = await q;
  if (error) throw new Error(`listUsedCars: ${error.message}`);

  const rows = (data ?? []) as UsedCarInventoryRow[];

  // 里程 filter（DB 不好 range，資料量 <1000 client-side 沒問題）
  const units = filter.kmRange
    ? rows.filter((r) => {
        const km = r.mileage_km;
        if (filter.kmRange === "low") return km <= 10000;
        if (filter.kmRange === "mid") return km > 10000 && km <= 30000;
        if (filter.kmRange === "high") return km > 30000;
        return true;
      })
    : rows;

  // KPI 計算（從完整 rows 算，不受 km filter 影響）
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const kpis: UsedCarKpiSummary = {
    available: rows.filter((r) => r.status === "available").length,
    pendingInspection: rows.filter((r) => r.status === "pending_inspection").length,
    reserved: rows.filter((r) => r.status === "reserved").length,
    sold: rows.filter((r) => r.status === "sold").length,
    avgDaysInStock: (() => {
      const active = rows.filter((r) => r.status !== "sold" && r.status !== "withdrawn");
      if (active.length === 0) return 0;
      const total = active.reduce((sum, r) => sum + calcDaysInStock(r.listed_date, null), 0);
      return Math.round(total / active.length);
    })(),
    soldThisMonth: rows.filter((r) => {
      if (r.status !== "sold" || !r.sold_date) return false;
      return new Date(r.sold_date) >= thisMonthStart;
    }).length,
  };

  return { units, kpis, totalCount: count ?? rows.length };
}

// ── 單筆查詢 ──
export async function getUsedCarById(id: string): Promise<UsedCarInventoryRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_inventory")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as UsedCarInventoryRow;
}

// ── 建立 ──
export type CreateUsedCarInput = {
  brand_id: string;
  organization_id?: string | null;
  vehicle_model_id?: string | null;
  model_display_name: string;
  year: number;
  color?: string | null;
  color_hex?: string | null;
  mileage_km?: number;
  acquisition_price?: number | null;
  listing_price?: number | null;
  cost?: number | null;
  margin?: number | null;
  acquisition_source?: UsedCarAcquisitionSource | null;
  acquisition_date?: string | null;
  listed_date?: string | null;
  status?: UsedCarDbStatus;
  condition_grade?: UsedCarConditionGrade | null;
  lien_cleared?: boolean | null;
  inspection_due_date?: string | null;
  recommended_services?: string[] | null;
  note?: string | null;
  vin?: string | null;
  license_plate?: string | null;
};

export async function createUsedCar(input: CreateUsedCarInput): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_inventory")
    .insert({ ...input, status: input.status ?? "available" })
    .select("id")
    .single();
  if (error) throw new Error(`createUsedCar: ${error.message}`);
  return data as { id: string };
}

// ── 更新 ──
export async function updateUsedCar(
  id: string,
  patch: Partial<CreateUsedCarInput>
): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_inventory")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw new Error(`updateUsedCar: ${error.message}`);
  return data as { id: string };
}

// ── 狀態切換 ──
export async function setUsedCarStatus(
  id: string,
  status: UsedCarDbStatus,
  soldDate?: string
): Promise<{ id: string }> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "sold" && soldDate) patch.sold_date = soldDate;
  const { data, error } = await supabase
    .from("used_car_inventory")
    .update(patch)
    .eq("id", id)
    .select("id")
    .single();
  if (error) throw new Error(`setUsedCarStatus: ${error.message}`);
  return data as { id: string };
}

// ── 刪除 ──
export async function deleteUsedCar(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("used_car_inventory")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`deleteUsedCar: ${error.message}`);
}
