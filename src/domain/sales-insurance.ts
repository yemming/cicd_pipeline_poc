import "server-only";

/**
 * Domain Helper — Sales Insurance（保險招攬工作台 A 級升級，2026-05-20）
 *
 * UI 絕對禁止 import @/lib/supabase；一律透過此 helper 讀寫。
 * 對應頁面：/sales/insurance（spec: RS_EX1 保險招攬工作台）
 *
 * Tables:
 *   - insurance_policies：保單主檔（一單一車一險種）
 *   - insurance_attempts：招攬聯絡紀錄（電訪 / 拜訪）
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  INSURANCE_PAGE_SIZE_DEFAULT,
  POLICY_TYPE_LABEL,
} from "./sales-insurance.constants";
import type {
  CreatePolicyInput,
  InsuranceFilters,
  InsuranceKpis,
  InsuranceLookups,
  InsurancePolicyRow,
  InsuranceTypeBreakdown,
  PolicyStatus,
  PolicyType,
  RenewalDueBucket,
  Result,
  UpdatePolicyInput,
} from "./sales-insurance.constants";

export {
  POLICY_STATUS_LABEL,
  POLICY_TYPE_LABEL,
  RENEWAL_TYPE_LABEL,
  POLICY_STATUS_CHIP,
  INSURANCE_PAGE_SIZE_DEFAULT,
} from "./sales-insurance.constants";
export type {
  CreatePolicyInput,
  InsuranceFilters,
  InsuranceKpis,
  InsuranceLookups,
  InsurancePolicyRow,
  InsuranceTypeBreakdown,
  PolicyStatus,
  PolicyType,
  RenewalDueBucket,
  RenewalType,
  Result,
  UpdatePolicyInput,
  AttemptResult,
} from "./sales-insurance.constants";

// ──────────────────────────────────────────────────────────────
// 內部：raw row → InsurancePolicyRow，計算 days_to_expiry
// ──────────────────────────────────────────────────────────────

type RawPolicyRow = {
  id: string;
  brand_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  policy_no: string | null;
  insurer: string;
  policy_type: PolicyType;
  start_date: string | null;
  end_date: string;
  premium: number | null;
  status: PolicyStatus;
  renewal_type: InsurancePolicyRow["renewal_type"];
  renewal_reminded_at: string | null;
  assigned_to: string | null;
  call_count: number;
  last_called_at: string | null;
  next_action_date: string | null;
  lost_reason_code: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  customers: { id: string; name: string } | { id: string; name: string }[] | null;
  customer_vehicles:
    | { id: string; license_plate: string | null }
    | { id: string; license_plate: string | null }[]
    | null;
  employees: { id: string; name: string } | { id: string; name: string }[] | null;
};

function pickOne<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

function daysBetween(today: Date, target: string): number {
  const t = new Date(target + "T00:00:00Z");
  const baseUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((t.getTime() - baseUtc) / 86400000);
}

function shapeRow(r: RawPolicyRow, today: Date): InsurancePolicyRow {
  const cust = pickOne(r.customers);
  const veh = pickOne(r.customer_vehicles);
  const emp = pickOne(r.employees);
  return {
    id: r.id,
    brand_id: r.brand_id,
    customer_id: r.customer_id,
    vehicle_id: r.vehicle_id,
    policy_no: r.policy_no,
    insurer: r.insurer,
    policy_type: r.policy_type,
    start_date: r.start_date,
    end_date: r.end_date,
    premium: r.premium,
    status: r.status,
    renewal_type: r.renewal_type,
    renewal_reminded_at: r.renewal_reminded_at,
    assigned_to: r.assigned_to,
    call_count: r.call_count,
    last_called_at: r.last_called_at,
    next_action_date: r.next_action_date,
    lost_reason_code: r.lost_reason_code,
    notes: r.notes,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    created_at: r.created_at,
    updated_at: r.updated_at,
    customer_name: cust?.name ?? null,
    vehicle_plate: veh?.license_plate ?? null,
    assigned_to_name: emp?.name ?? null,
    days_to_expiry: daysBetween(today, r.end_date),
  };
}

const POLICY_SELECT = `
  id, brand_id, customer_id, vehicle_id, policy_no, insurer, policy_type,
  start_date, end_date, premium, status, renewal_type, renewal_reminded_at,
  assigned_to, call_count, last_called_at, next_action_date, lost_reason_code,
  notes, metadata, created_at, updated_at,
  customers:customer_id ( id, name ),
  customer_vehicles:vehicle_id ( id, license_plate ),
  employees:assigned_to ( id, name )
` as const;

// ──────────────────────────────────────────────────────────────
// Lookups
// ──────────────────────────────────────────────────────────────

export async function getInsuranceLookups(): Promise<InsuranceLookups> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [custRes, vehRes, empRes] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
    supabase
      .from("customer_vehicles")
      .select("id, customer_id, license_plate")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .limit(500),
    supabase
      .from("employees")
      .select("id, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("name")
      .limit(500),
  ]);

  return {
    customers: (custRes.data ?? []) as Array<{ id: string; name: string }>,
    vehicles: (vehRes.data ?? []).map(
      (v: { id: string; customer_id: string | null; license_plate: string | null }) => ({
        id: v.id,
        customer_id: v.customer_id,
        license_plate: v.license_plate,
        label: v.license_plate ?? v.id.slice(0, 8),
      }),
    ),
    employees: (empRes.data ?? []) as Array<{ id: string; name: string }>,
  };
}

// ──────────────────────────────────────────────────────────────
// List
// ──────────────────────────────────────────────────────────────

export async function listInsurancePolicies(
  filters: InsuranceFilters = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: InsurancePolicyRow[]; totalCount: number }> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? INSURANCE_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("insurance_policies")
    .select(POLICY_SELECT, { count: "exact" })
    .eq("brand_id", scope.brand_id);

  if (filters.status && filters.status !== "all") q = q.eq("status", filters.status);
  if (filters.policy_type && filters.policy_type !== "all")
    q = q.eq("policy_type", filters.policy_type);
  if (filters.assigned_to && filters.assigned_to !== "all")
    q = q.eq("assigned_to", filters.assigned_to);

  if (filters.expiry_window && filters.expiry_window !== "all") {
    if (filters.expiry_window === "expired") {
      q = q.lt("end_date", todayStr);
    } else {
      const days = parseInt(filters.expiry_window, 10);
      const max = new Date(today);
      max.setDate(max.getDate() + days);
      q = q.gte("end_date", todayStr).lte("end_date", max.toISOString().slice(0, 10));
    }
  }

  // search by policy_no / insurer / notes
  if (filters.search?.trim()) {
    const s = filters.search.trim().replace(/[%_]/g, "");
    q = q.or(`policy_no.ilike.%${s}%,insurer.ilike.%${s}%,notes.ilike.%${s}%`);
  }

  q = q.order("end_date", { ascending: true }).range(from, to);

  const { data, error, count } = await q;
  if (error) {
    console.error("[sales-insurance] listInsurancePolicies failed:", error.message);
    return { rows: [], totalCount: 0 };
  }
  const rows = (data ?? []).map((r) => shapeRow(r as unknown as RawPolicyRow, today));
  return { rows, totalCount: count ?? 0 };
}

// ──────────────────────────────────────────────────────────────
// KPI
// ──────────────────────────────────────────────────────────────

export async function getInsuranceKpis(): Promise<InsuranceKpis> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);
  const in30Str = in30.toISOString().slice(0, 10);

  const [thisMonthRes, in30Res, activeRes, expiredRes, renewedThisMonthRes] = await Promise.all([
    supabase
      .from("insurance_policies")
      .select("id, premium", { count: "exact", head: false })
      .eq("brand_id", scope.brand_id)
      .gte("end_date", monthStart)
      .lte("end_date", monthEnd),
    supabase
      .from("insurance_policies")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .gte("end_date", todayStr)
      .lte("end_date", in30Str),
    supabase
      .from("insurance_policies")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .eq("status", "active"),
    supabase
      .from("insurance_policies")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .eq("status", "expired"),
    supabase
      .from("insurance_policies")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .eq("status", "renewed")
      .gte("updated_at", monthStart + "T00:00:00Z"),
  ]);

  const thisMonthRows = (thisMonthRes.data ?? []) as Array<{ premium: number | null }>;
  const totalPremium = thisMonthRows.reduce((sum, r) => sum + (Number(r.premium) || 0), 0);
  const expThis = thisMonthRes.count ?? 0;
  const renewedThis = renewedThisMonthRes.count ?? 0;
  // 簡化續保率：本月已續保 / (本月到期 + 本月已續保)；都 0 時回 0
  const denom = expThis + renewedThis;
  const renewalRate = denom > 0 ? Math.round((renewedThis / denom) * 100) : 0;

  return {
    expiring_this_month: expThis,
    expiring_30_days: in30Res.count ?? 0,
    active_count: activeRes.count ?? 0,
    expired_unrenewed: expiredRes.count ?? 0,
    renewal_rate_pct: renewalRate,
    total_premium_this_month: totalPremium,
  };
}

// ──────────────────────────────────────────────────────────────
// 即將到期 buckets（0-30 / 31-60 / 61-90）
// ──────────────────────────────────────────────────────────────

export async function getRenewalDueList(): Promise<RenewalDueBucket[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const in90 = new Date(today);
  in90.setDate(in90.getDate() + 90);
  const in90Str = in90.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("insurance_policies")
    .select("end_date, premium")
    .eq("brand_id", scope.brand_id)
    .gte("end_date", todayStr)
    .lte("end_date", in90Str);

  if (error) {
    console.error("[sales-insurance] getRenewalDueList failed:", error.message);
    return [];
  }

  const buckets: Record<RenewalDueBucket["window"], RenewalDueBucket> = {
    "0-30": { window: "0-30", count: 0, total_premium: 0 },
    "31-60": { window: "31-60", count: 0, total_premium: 0 },
    "61-90": { window: "61-90", count: 0, total_premium: 0 },
  };

  for (const row of data ?? []) {
    const d = daysBetween(today, row.end_date as string);
    const premium = Number(row.premium) || 0;
    const key: RenewalDueBucket["window"] =
      d <= 30 ? "0-30" : d <= 60 ? "31-60" : "61-90";
    buckets[key].count += 1;
    buckets[key].total_premium += premium;
  }

  return [buckets["0-30"], buckets["31-60"], buckets["61-90"]];
}

// ──────────────────────────────────────────────────────────────
// 險種分佈
// ──────────────────────────────────────────────────────────────

export async function getInsuranceByType(): Promise<InsuranceTypeBreakdown[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("insurance_policies")
    .select("policy_type")
    .eq("brand_id", scope.brand_id);

  if (error) {
    console.error("[sales-insurance] getInsuranceByType failed:", error.message);
    return [];
  }

  const counter: Record<PolicyType, number> = {
    compulsory: 0,
    voluntary: 0,
    theft: 0,
    other: 0,
  };
  for (const r of data ?? []) {
    const t = (r.policy_type as PolicyType) ?? "other";
    counter[t] = (counter[t] ?? 0) + 1;
  }

  return (Object.keys(counter) as PolicyType[]).map((t) => ({
    policy_type: t,
    label: POLICY_TYPE_LABEL[t],
    count: counter[t],
  }));
}

// ──────────────────────────────────────────────────────────────
// Mutations
// ──────────────────────────────────────────────────────────────

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23503") return "關聯資料不存在或已刪除";
  if (error.code === "23505") return "資料衝突：已存在相同保單";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  if (error.code === "42501") return "資料庫權限不足（RLS）";
  return `${fallback}：${error.message}`;
}

export async function createPolicy(
  input: CreatePolicyInput,
): Promise<Result<{ id: string }>> {
  if (!input.insurer?.trim()) return { ok: false, error: "請填寫保險公司" };
  if (!input.end_date) return { ok: false, error: "請填寫保險到期日" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("insurance_policies")
    .insert({
      brand_id: scope.brand_id,
      customer_id: input.customer_id,
      vehicle_id: input.vehicle_id,
      policy_no: input.policy_no ?? null,
      insurer: input.insurer.trim(),
      policy_type: input.policy_type,
      start_date: input.start_date ?? null,
      end_date: input.end_date,
      premium: input.premium ?? null,
      status: input.status ?? "pending",
      renewal_type: input.renewal_type ?? null,
      assigned_to: input.assigned_to ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: mapDbError(error, "建立保單失敗") };
  return { ok: true, data: { id: data!.id as string } };
}

export async function updatePolicy(
  id: string,
  patch: UpdatePolicyInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const payload: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) payload[k] = v;
  }
  if (Object.keys(payload).length === 0) return { ok: true, data: { id } };

  const { error } = await supabase.from("insurance_policies").update(payload).eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "更新保單失敗") };
  return { ok: true, data: { id } };
}

export async function markRenewed(id: string): Promise<Result<{ id: string }>> {
  return updatePolicy(id, { status: "renewed" });
}

export async function markCancelled(id: string): Promise<Result<{ id: string }>> {
  return updatePolicy(id, { status: "cancelled" });
}

export async function deletePolicy(id: string): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const { error } = await supabase.from("insurance_policies").delete().eq("id", id);
  if (error) return { ok: false, error: mapDbError(error, "刪除保單失敗") };
  return { ok: true, data: { id } };
}
