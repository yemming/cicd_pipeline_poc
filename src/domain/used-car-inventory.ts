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
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import type { UsedCarDbStatus, UsedCarConditionGrade, UsedCarAcquisitionSource, UsedCarInventoryRow } from "./used-car-inventory.constants";
import { calcDaysInStock } from "./used-car-inventory.constants";

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

// ── A 級看板用 KPI（M01-7）──
export type UsedCarBoardKpi = {
  total: number;           // 全部（含已售出）
  available: number;       // 在庫可售
  avgMarginRate: number;   // 平均毛利率 %
  aged90: number;          // 庫齡 > 90 天的台數
  negativeMargin: number;  // 毛利為負的台數
  soldThisMonth: number;   // 本月已售
};

export type UsedCarByModelDatum = {
  model: string;
  available: number;
  pending_inspection: number;
  reserved: number;
  sold: number;
  withdrawn: number;
  total: number;
};

export type UsedCarSlowMover = {
  id: string;
  model_display_name: string;
  color: string | null;
  status: UsedCarDbStatus;
  listed_date: string | null;
  days_in_stock: number;
  listing_price: number | null;
  margin: number | null;
  condition_grade: UsedCarConditionGrade | null;
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
  /** 來源類型（acquisition_source）：trade_in / direct_buy / auction / other */
  source?: string;
  /**
   * 是否排除「不可展示」狀態（輪3-2b）。
   * 預設 true（展廳看板只顯示可售狀態），傳 false 可顯示全部（管理視角）。
   * 不可展示狀態：evaluation / pending_recon / withdrawn / inactive
   */
  excludeNonShowroom?: boolean;
};

// 主查詢 select：含 join repair_orders 撈整備工單號（待整備車輛顯示用）
const USED_CAR_SELECT =
  "*, recon_workorder:repair_orders!used_car_inventory_recon_workorder_id_fkey(ro_code)";

// 把 supabase 回的 nested join 攤平成 recon_workorder_code
function flattenReconCode(
  row: Record<string, unknown> & {
    recon_workorder?: { ro_code: string | null } | null;
  }
): UsedCarInventoryRow {
  const { recon_workorder, ...rest } = row;
  return {
    ...rest,
    recon_workorder_code: recon_workorder?.ro_code ?? null,
  } as UsedCarInventoryRow;
}

/**
 * 展廳看板不可展示的狀態（輪3-2b）。
 * evaluation=鑑價中、pending_recon=待整備、withdrawn=已下架、inactive=停用
 */
const NON_SHOWROOM_STATUSES: string[] = ["evaluation", "pending_recon", "withdrawn", "inactive"];

// ── 主查詢：撈指定 brand 的庫存列表 ──
export async function listUsedCars(filter: UsedCarFilter): Promise<UsedCarInventoryData> {
  const supabase = await createClient();
  // 輪3-2b：展廳看板預設排除不可展示狀態，傳 excludeNonShowroom=false 可看全部（管理視角）
  const excludeNonShowroom = filter.excludeNonShowroom !== false;

  let q = supabase
    .from("used_car_inventory")
    .select(USED_CAR_SELECT, { count: "exact" })
    .eq("brand_id", filter.brandId)
    .order("created_at", { ascending: false });

  if (filter.status) {
    q = q.eq("status", filter.status);
  } else if (excludeNonShowroom) {
    // 沒有指定 status 且預設排除不可展示狀態
    q = q.not("status", "in", `(${NON_SHOWROOM_STATUSES.join(",")})`);
  }
  if (filter.conditionGrade) {
    q = q.eq("condition_grade", filter.conditionGrade);
  }
  if (filter.source) {
    q = q.eq("acquisition_source", filter.source);
  }
  if (filter.search) {
    q = q.ilike("model_display_name", `%${filter.search}%`);
  }

  // 里程區間 filter（client-side，資料量小）
  const { data, error, count } = await q;
  if (error) throw new Error(`listUsedCars: ${error.message}`);

  const rows = (data ?? []).map((r) => flattenReconCode(r as Record<string, unknown>));

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
    .select(USED_CAR_SELECT)
    .eq("id", id)
    .single();
  if (error) return null;
  return flattenReconCode(data as Record<string, unknown>);
}

// ── 建立 ──
export type CreateUsedCarInput = {
  metadata?: Record<string, unknown> | null;
  created_by?: string | null;
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

// ─────────────────────────────────────────────────────────────────────
// A 級看板補強（M01-7）：KPI / by-model / slow-movers
// ─────────────────────────────────────────────────────────────────────

/**
 * 抓目前登入者的 brand_id（fallback 'indian'）— 跟 new-car-inventory 同邏輯。
 */
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

/**
 * 是否可看「整車成本」等敏感成本欄位。
 * 沿用 RBAC：擁有 sales.cost.view（app admin 自動有）才看得到整備成本 / 整車成本合計。
 */
export async function canViewUsedCarCost(): Promise<boolean> {
  return hasPermission(PERMISSIONS.SALES_COST_VIEW);
}

/**
 * 看板頂部 KPI 列：總台數 / 在售 / 平均毛利率 / 庫齡>90天 / 負毛利 / 本月已售。
 */
export async function getUsedCarKpis(brandId: string): Promise<UsedCarBoardKpi> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_inventory")
    .select("status, listed_date, sold_date, listing_price, margin")
    .eq("brand_id", brandId);
  if (error) throw new Error(`getUsedCarKpis: ${error.message}`);

  const rows = (data ?? []) as {
    status: string;
    listed_date: string | null;
    sold_date: string | null;
    listing_price: number | null;
    margin: number | null;
  }[];

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const total = rows.length;
  const available = rows.filter((r) => r.status === "available").length;

  // 平均毛利率（只看「有 listing_price > 0 + margin 非 null」的 row）
  const marginRows = rows.filter(
    (r) => r.margin != null && r.listing_price != null && r.listing_price > 0
  );
  const avgMarginRate =
    marginRows.length === 0
      ? 0
      : Math.round(
          (marginRows.reduce(
            (sum, r) => sum + (r.margin! / r.listing_price!) * 100,
            0
          ) /
            marginRows.length) *
            10
        ) / 10;

  // 庫齡 > 90 天的「未售出」台數
  const aged90 = rows.filter((r) => {
    if (r.status === "sold" || r.status === "withdrawn") return false;
    if (!r.listed_date) return false;
    const days = Math.floor(
      (now.getTime() - new Date(r.listed_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    return days > 90;
  }).length;

  const negativeMargin = rows.filter(
    (r) => r.margin != null && r.margin < 0 && r.status !== "sold"
  ).length;

  const soldThisMonth = rows.filter((r) => {
    if (r.status !== "sold" || !r.sold_date) return false;
    return new Date(r.sold_date) >= thisMonthStart;
  }).length;

  return { total, available, avgMarginRate, aged90, negativeMargin, soldThisMonth };
}

/**
 * 各車型 × 狀態堆疊（給 BarChart 用）— 依 model_display_name aggregate。
 */
export async function getUsedCarByModel(brandId: string): Promise<UsedCarByModelDatum[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_inventory")
    .select("model_display_name, status")
    .eq("brand_id", brandId);
  if (error) throw new Error(`getUsedCarByModel: ${error.message}`);

  type Row = { model_display_name: string; status: string };
  const rows = (data ?? []) as Row[];

  const byModel = new Map<string, UsedCarByModelDatum>();
  for (const r of rows) {
    const name = r.model_display_name ?? "（未指定）";
    if (!byModel.has(name)) {
      byModel.set(name, {
        model: name,
        available: 0,
        pending_inspection: 0,
        reserved: 0,
        sold: 0,
        withdrawn: 0,
        total: 0,
      });
    }
    const datum = byModel.get(name)!;
    const status = r.status as UsedCarDbStatus;
    if (status in datum) {
      (datum as unknown as Record<string, number>)[status] += 1;
    }
    datum.total += 1;
  }

  return Array.from(byModel.values()).sort((a, b) => b.total - a.total);
}

/**
 * 庫齡 > {days} 天且尚未售出的車（給「老闆要看哪些賣不動」清單用）。
 */
export async function getUsedCarSlowMovers(
  brandId: string,
  days = 90
): Promise<UsedCarSlowMover[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("used_car_inventory")
    .select(
      "id, model_display_name, color, status, listed_date, listing_price, margin, condition_grade"
    )
    .eq("brand_id", brandId)
    .in("status", ["available", "pending_inspection", "reserved"])
    .not("listed_date", "is", null);
  if (error) throw new Error(`getUsedCarSlowMovers: ${error.message}`);

  type Row = {
    id: string;
    model_display_name: string;
    color: string | null;
    status: string;
    listed_date: string;
    listing_price: number | null;
    margin: number | null;
    condition_grade: string | null;
  };
  const rows = (data ?? []) as Row[];
  const today = new Date();

  return rows
    .map((r) => {
      const daysIn = Math.floor(
        (today.getTime() - new Date(r.listed_date).getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: r.id,
        model_display_name: r.model_display_name,
        color: r.color,
        status: r.status as UsedCarDbStatus,
        listed_date: r.listed_date,
        days_in_stock: daysIn,
        listing_price: r.listing_price,
        margin: r.margin,
        condition_grade: r.condition_grade as UsedCarConditionGrade | null,
      };
    })
    .filter((r) => r.days_in_stock > days)
    .sort((a, b) => b.days_in_stock - a.days_in_stock);
}
