/**
 * Domain Helper — 售後休眠流失管理（/crm/aftersales/dormant-customers · M02-6）
 *
 * 角色：服務顧問（SA）視角追逾期未進廠的客戶（休眠）+ 已判定流失的客戶（lost）。
 *
 * 三大資料來源：
 *  1. customers.aftersales_dormancy_status — typed 欄位（null/active/dormant_60/dormant_120/dormant_180/lost）
 *  2. work_orders.opened_at — runtime 推 last_visit_at 與 days_overdue
 *  3. nps_responses — 低 NPS 客戶輔助判斷
 *
 * 寫入：reactivate（建電訪 call_task）/ markLost（鎖案 + 寫流失原因）。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type {
  AftersalesDormancyStatus,
  AftersalesLostReason,
  AftersalesDormantRow,
  AftersalesDormantKpi,
  AftersalesDormantFilters,
  SaAssigneeOption,
} from "./crm-aftersales-dormant.constants";

// Re-export client-safe types/labels for backwards compat (UI 統一從 constants import)
export type {
  AftersalesDormancyStatus,
  AftersalesLostReason,
  AftersalesDormantRow,
  AftersalesDormantKpi,
  AftersalesDormantFilters,
  SaAssigneeOption,
} from "./crm-aftersales-dormant.constants";
export { LOST_REASON_LABEL, DORMANCY_LABEL } from "./crm-aftersales-dormant.constants";

export type DormantListResult = {
  rows: AftersalesDormantRow[];
  kpi: AftersalesDormantKpi;
};

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

function daysBetween(iso: string, now: number): number {
  return Math.floor((now - new Date(iso).getTime()) / 86400000);
}

type CustomerRow = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  assigned_sa_user_id: string | null;
  aftersales_dormancy_status: string | null;
  aftersales_lost_reason: string | null;
  aftersales_lost_at: string | null;
};

function parseStatus(s: string | null): AftersalesDormancyStatus | null {
  if (s === "active" || s === "dormant_60" || s === "dormant_120" || s === "dormant_180" || s === "lost") {
    return s;
  }
  return null;
}

function parseReason(s: string | null): AftersalesLostReason | null {
  if (
    s === "maintenance_overdue" ||
    s === "low_nps" ||
    s === "warranty_expired" ||
    s === "desmo_overdue" ||
    s === "unreachable" ||
    s === "other"
  ) {
    return s;
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────────
// List：休眠（dormant_60 / 120 / 180）
// ──────────────────────────────────────────────────────────────────────────

export async function listAftersalesDormantCustomers(
  filters: AftersalesDormantFilters = {},
): Promise<DormantListResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 撈所有有 dormancy_status 的客戶（含 lost — KPI 需要 lost 數）
  const { data: customersData, error: cErr } = await supabase
    .from("customers")
    .select(
      "id, code, name, phone, email, assigned_sa_user_id, aftersales_dormancy_status, aftersales_lost_reason, aftersales_lost_at",
    )
    .eq("brand_id", brand)
    .not("aftersales_dormancy_status", "is", null)
    .order("code");

  if (cErr) throw new Error(`dormant customers: ${cErr.message}`);

  const customers = (customersData ?? []) as CustomerRow[];
  if (customers.length === 0) {
    return {
      rows: [],
      kpi: {
        total_dormant: 0,
        dormant_60: 0,
        dormant_120: 0,
        dormant_180: 0,
        total_lost: 0,
        lost_this_month: 0,
        reactivated_this_month: 0,
        reactivate_rate: null,
      },
    };
  }

  const ids = customers.map((c) => c.id);
  const saIds = Array.from(
    new Set(customers.map((c) => c.assigned_sa_user_id).filter((x): x is string => Boolean(x))),
  );

  const [vehRes, woRes, saRes] = await Promise.all([
    supabase
      .from("customer_vehicles")
      .select("customer_id, license_plate, model_id, is_active")
      .eq("brand_id", brand)
      .in("customer_id", ids)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("work_orders")
      .select("customer_id, ro_no, opened_at")
      .eq("brand_id", brand)
      .in("customer_id", ids)
      .order("opened_at", { ascending: false }),
    saIds.length > 0
      ? supabase.from("employees").select("user_id, name").in("user_id", saIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; name: string }> }),
  ]);

  // 主車輛
  const primaryVehicle = new Map<string, { license_plate: string | null; model_id: string | null }>();
  const vehicleCount = new Map<string, number>();
  const modelIds = new Set<string>();
  for (const v of (vehRes.data ?? []) as Array<{
    customer_id: string;
    license_plate: string | null;
    model_id: string | null;
  }>) {
    vehicleCount.set(v.customer_id, (vehicleCount.get(v.customer_id) ?? 0) + 1);
    if (!primaryVehicle.has(v.customer_id)) {
      primaryVehicle.set(v.customer_id, { license_plate: v.license_plate, model_id: v.model_id });
    }
    if (v.model_id) modelIds.add(v.model_id);
  }

  let modelNameById = new Map<string, string>();
  if (modelIds.size > 0) {
    const { data: mData } = await supabase
      .from("vehicle_models")
      .select("id, display_name")
      .in("id", Array.from(modelIds));
    modelNameById = new Map(
      ((mData ?? []) as Array<{ id: string; display_name: string }>).map((m) => [m.id, m.display_name]),
    );
  }

  // 工單聚合
  const visitCount = new Map<string, number>();
  const lastVisit = new Map<string, { opened_at: string; ro_no: string }>();
  for (const w of (woRes.data ?? []) as Array<{
    customer_id: string;
    ro_no: string;
    opened_at: string;
  }>) {
    visitCount.set(w.customer_id, (visitCount.get(w.customer_id) ?? 0) + 1);
    if (!lastVisit.has(w.customer_id)) {
      lastVisit.set(w.customer_id, { opened_at: w.opened_at, ro_no: w.ro_no });
    }
  }

  // SA name
  const saNameByUserId = new Map<string, string>();
  for (const e of (saRes.data ?? []) as Array<{ user_id: string; name: string }>) {
    saNameByUserId.set(e.user_id, e.name);
  }

  const now = Date.now();
  const allRows: AftersalesDormantRow[] = customers.map((c) => {
    const lv = lastVisit.get(c.id) ?? null;
    const primary = primaryVehicle.get(c.id) ?? null;
    const status: AftersalesDormancyStatus =
      parseStatus(c.aftersales_dormancy_status) ?? "active";
    return {
      id: c.id,
      code: c.code,
      name: c.name,
      phone: c.phone,
      email: c.email,
      primary_license_plate: primary?.license_plate ?? null,
      primary_model_name: primary?.model_id ? (modelNameById.get(primary.model_id) ?? null) : null,
      vehicle_count: vehicleCount.get(c.id) ?? 0,
      visit_count: visitCount.get(c.id) ?? 0,
      last_visit_at: lv?.opened_at ?? null,
      last_ro_no: lv?.ro_no ?? null,
      days_overdue: lv ? daysBetween(lv.opened_at, now) : null,
      dormancy_status: status,
      assigned_sa_user_id: c.assigned_sa_user_id,
      assigned_sa_name: c.assigned_sa_user_id
        ? (saNameByUserId.get(c.assigned_sa_user_id) ?? null)
        : null,
      lost_reason: parseReason(c.aftersales_lost_reason),
      lost_at: c.aftersales_lost_at,
    };
  });

  // KPI（基於全集，不被 client filter 影響）
  const dormant60 = allRows.filter((r) => r.dormancy_status === "dormant_60").length;
  const dormant120 = allRows.filter((r) => r.dormancy_status === "dormant_120").length;
  const dormant180 = allRows.filter((r) => r.dormancy_status === "dormant_180").length;
  const totalDormant = dormant60 + dormant120 + dormant180;
  const lostRows = allRows.filter((r) => r.dormancy_status === "lost");
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const lostThisMonth = lostRows.filter(
    (r) => r.lost_at && new Date(r.lost_at).getTime() >= monthStart,
  ).length;

  // 重啟成功率：本月被建電訪任務、且任務已 completed 的 dormant 客戶 / 本月被建電訪任務的 dormant 客戶
  // 簡化：撈 call_tasks (kind='aftersales', created_at >= monthStart, customer_id IN dormantIds)
  const dormantIds = allRows
    .filter((r) => r.dormancy_status !== "lost")
    .map((r) => r.id);
  let reactivatedThisMonth = 0;
  let attemptedThisMonth = 0;
  if (dormantIds.length > 0) {
    const { data: ctData } = await supabase
      .from("call_tasks")
      .select("customer_id, status, created_at")
      .eq("brand_id", brand)
      .eq("kind", "aftersales")
      .in("customer_id", dormantIds)
      .gte("created_at", new Date(monthStart).toISOString());
    const ct = (ctData ?? []) as Array<{ customer_id: string; status: string }>;
    attemptedThisMonth = new Set(ct.map((t) => t.customer_id)).size;
    reactivatedThisMonth = new Set(
      ct.filter((t) => t.status === "completed").map((t) => t.customer_id),
    ).size;
  }
  const reactivateRate =
    attemptedThisMonth > 0
      ? Math.round((reactivatedThisMonth / attemptedThisMonth) * 100)
      : null;

  const kpi: AftersalesDormantKpi = {
    total_dormant: totalDormant,
    dormant_60: dormant60,
    dormant_120: dormant120,
    dormant_180: dormant180,
    total_lost: lostRows.length,
    lost_this_month: lostThisMonth,
    reactivated_this_month: reactivatedThisMonth,
    reactivate_rate: reactivateRate,
  };

  // 套 filter（含 status / reason / search）
  let rows = allRows;
  if (filters.status && filters.status !== "all") {
    rows = rows.filter((r) => r.dormancy_status === filters.status);
  }
  if (filters.reason && filters.reason !== "all") {
    rows = rows.filter((r) => r.lost_reason === filters.reason);
  }
  if (filters.search?.trim()) {
    const t = filters.search.trim().toUpperCase();
    rows = rows.filter(
      (r) =>
        r.code.toUpperCase().includes(t) ||
        r.name.toUpperCase().includes(t) ||
        (r.phone ?? "").toUpperCase().includes(t) ||
        (r.primary_license_plate ?? "").toUpperCase().includes(t),
    );
  }

  // 排序：dormant 依逾期天數 desc、lost 依 lost_at desc
  rows.sort((a, b) => {
    const ad = a.days_overdue ?? -1;
    const bd = b.days_overdue ?? -1;
    return bd - ad;
  });

  return { rows, kpi };
}

// ──────────────────────────────────────────────────────────────────────────
// SA assignee 候選（下拉用）
// ──────────────────────────────────────────────────────────────────────────

export async function listAftersalesSaAssignees(): Promise<SaAssigneeOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("user_id, name, is_active")
    .eq("is_active", true)
    .not("user_id", "is", null)
    .order("name")
    .limit(50);
  if (error) return [];
  return ((data ?? []) as Array<{ user_id: string; name: string }>).map((e) => ({
    user_id: e.user_id,
    name: e.name,
  }));
}
