"use server";

/**
 * Domain Helper — Inventory Count Plans / Counts / Lines（盤點）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { revalidatePath } from "next/cache";
import {
  startCountSessionAction as _startCountSessionAction,
  submitCountSessionAction as _submitCountSessionAction,
  approveCountAdjustmentAction as _approveCountAdjustmentAction,
  createCountPlanAction as _createCountPlanAction,
  type StartCountSessionInput,
  type SubmitCountSessionInput,
  type CreateCountPlanInput,
} from "@/lib/parts/actions";

import type { Database } from "@/lib/database.types";

export async function startCountSessionAction(input: StartCountSessionInput) {
  return _startCountSessionAction(input);
}
export async function submitCountSessionAction(input: SubmitCountSessionInput) {
  return _submitCountSessionAction(input);
}
export async function approveCountAdjustmentAction(ctId: string) {
  return _approveCountAdjustmentAction(ctId);
}
export async function createCountPlanAction(input: CreateCountPlanInput) {
  return _createCountPlanAction(input);
}

export type UpdateCountPlanInput = {
  plan_name?: string;
  warehouse_id?: string;
  plan_type?: string;
  abc_filter?: string | null;
  schedule_cron?: string | null;
  next_run_at?: string | null;
  notes?: string | null;
};

export async function updateCountPlanAction(
  id: string,
  patch: UpdateCountPlanInput,
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.COUNT_PLAN))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const updates: Record<string, unknown> = {};
  if (patch.plan_name !== undefined) {
    const v = patch.plan_name.trim();
    if (!v) return { ok: false, error: "計畫名稱不可為空" };
    updates.plan_name = v;
  }
  if (patch.warehouse_id !== undefined) {
    if (!patch.warehouse_id) return { ok: false, error: "倉庫必選" };
    updates.warehouse_id = patch.warehouse_id;
  }
  if (patch.plan_type !== undefined) updates.plan_type = patch.plan_type;
  if (patch.abc_filter !== undefined) updates.abc_filter = patch.abc_filter;
  if (patch.schedule_cron !== undefined)
    updates.schedule_cron = patch.schedule_cron ? patch.schedule_cron.trim() : null;
  if (patch.next_run_at !== undefined) updates.next_run_at = patch.next_run_at;
  if (patch.notes !== undefined) updates.notes = patch.notes;

  if (Object.keys(updates).length === 0) {
    return { ok: true, data: { id } };
  }

  const { error } = await supabase
    .from("inventory_count_plans")
    .update(updates)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新計畫失敗：${error.message}` };

  revalidatePath("/parts/count/plans");
  revalidatePath(`/parts/count/plans/${id}`);
  return { ok: true, data: { id } };
}

export async function setCountPlanActiveAction(
  id: string,
  active: boolean,
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.COUNT_PLAN))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("inventory_count_plans")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `切換啟用狀態失敗：${error.message}` };
  revalidatePath("/parts/count/plans");
  revalidatePath(`/parts/count/plans/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteCountPlanAction(
  id: string,
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.COUNT_PLAN))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("inventory_count_plans")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除計畫失敗：${error.message}` };
  revalidatePath("/parts/count/plans");
  return { ok: true, data: { id } };
}

type Tables = Database["public"]["Tables"];
export type CountPlanRow = Tables["inventory_count_plans"]["Row"];
export type CountRow = Tables["inventory_counts"]["Row"];

export type CountPlanListRow = CountPlanRow & {
  warehouse_name: string | null;
};

export type CountSessionListRow = CountRow & {
  warehouse_name: string | null;
};

export async function listCountPlans(filter: {
  is_active?: boolean;
  q?: string;
} = {}): Promise<CountPlanListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("inventory_count_plans")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("next_run_at", { ascending: true })
    .limit(200);
  if (filter.is_active !== undefined) q = q.eq("is_active", filter.is_active);
  if (filter.q) q = q.ilike("plan_name", `%${filter.q}%`);

  const { data: plans, error } = await q;
  if (error) throw error;
  if (!plans || plans.length === 0) return [];

  const wIds = Array.from(new Set(plans.map((p) => p.warehouse_id).filter((x): x is string => !!x)));
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return plans.map((p) => ({
    ...p,
    warehouse_name: p.warehouse_id ? wMap.get(p.warehouse_id) ?? null : null,
  }));
}

export async function listCountSessions(filter: {
  status?: string;
  q?: string;
  warehouse_id?: string;
} = {}): Promise<CountSessionListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("inventory_counts")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.status) q = q.eq("status", filter.status);
  if (filter.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  if (filter.q) q = q.ilike("ct_no", `%${filter.q}%`);
  const { data: counts, error } = await q;
  if (error) throw error;
  if (!counts || counts.length === 0) return [];

  const wIds = Array.from(new Set(counts.map((c) => c.warehouse_id).filter((x): x is string => !!x)));
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return counts.map((c) => ({
    ...c,
    warehouse_name: c.warehouse_id ? wMap.get(c.warehouse_id) ?? null : null,
  }));
}

export async function getCountPlansPageData(
  filter: { is_active?: boolean; q?: string; warehouse_id?: string } = {},
): Promise<{
  rows: CountPlanListRow[];
  warehouses: { id: string; name: string; code: string }[];
  canEdit: boolean;
  stats: CountPlansStats;
  ganttBars: CountPlanGanttBar[];
  ganttRange: { from: string; to: string };
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const [rows, canEdit, whRes, stats, ganttBars] = await Promise.all([
    listCountPlans({ is_active: filter.is_active, q: filter.q }),
    hasPermission(PERMISSIONS.COUNT_PLAN),
    supabase
      .from("warehouses")
      .select("id, name, code")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code"),
    getCountPlansStats(),
    getCountPlanGanttData(),
  ]);
  const filteredRows = filter.warehouse_id
    ? rows.filter((r) => r.warehouse_id === filter.warehouse_id)
    : rows;
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 86400_000).toISOString().slice(0, 10);
  const to = new Date(now.getTime() + 60 * 86400_000).toISOString().slice(0, 10);
  return {
    rows: filteredRows,
    warehouses: whRes.data ?? [],
    canEdit,
    stats,
    ganttBars,
    ganttRange: { from, to },
  };
}

// ─────────────────────────── Count Plans 排期 / KPI（A 級補強） ───────────────────────────

export interface CountPlansStats {
  /** 本月已排定（next_run_at 在本月）+ 本月已執行（last_run_at 在本月）合計 */
  this_month_total: number;
  /** 本月已執行（last_run_at 在本月） */
  this_month_executed: number;
  /** 本月計畫的完成率（已執行 / 本月計畫總數）— null = 本月沒有計畫 */
  completion_rate: number | null;
  /** 接下來 7 天內待執行（next_run_at 在 7 天內、is_active=true） */
  upcoming_7d: number;
  /** 逾期（next_run_at 過了但沒 last_run_at、is_active=true） */
  overdue: number;
}

export async function getCountPlansStats(): Promise<CountPlansStats> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("inventory_count_plans")
    .select("next_run_at, last_run_at, is_active")
    .eq("brand_id", brand);
  if (error) throw error;
  const rows = data ?? [];
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const in7d = new Date(now.getTime() + 7 * 86400_000);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let thisMonthScheduled = 0;
  let thisMonthExecuted = 0;
  let upcoming7d = 0;
  let overdue = 0;

  for (const r of rows) {
    const nextRun = r.next_run_at ? new Date(r.next_run_at) : null;
    const lastRun = r.last_run_at ? new Date(r.last_run_at) : null;
    if (nextRun && nextRun >= monthStart && nextRun < monthEnd) thisMonthScheduled++;
    if (lastRun && lastRun >= monthStart && lastRun < monthEnd) thisMonthExecuted++;
    if (r.is_active && nextRun && nextRun >= today && nextRun <= in7d) upcoming7d++;
    if (r.is_active && nextRun && nextRun < today && !lastRun) overdue++;
  }

  const thisMonthTotal = thisMonthScheduled + thisMonthExecuted;
  const completionRate =
    thisMonthTotal > 0 ? Math.round((thisMonthExecuted / thisMonthTotal) * 1000) / 10 : null;

  return {
    this_month_total: thisMonthTotal,
    this_month_executed: thisMonthExecuted,
    completion_rate: completionRate,
    upcoming_7d: upcoming7d,
    overdue,
  };
}

export interface CountPlanGanttBar {
  id: string;
  plan_name: string;
  warehouse_name: string | null;
  plan_type: string | null;
  /** 起始日 ISO（last_run_at 或 next_run_at） */
  start: string;
  /** 結束日 ISO（start + duration_days） */
  end: string;
  /** 來自 metadata.duration_days，預設 2 */
  duration_days: number;
  /** 來自 metadata.assignee_label */
  assignee_label: string | null;
  /** 狀態：done / scheduled / overdue / paused */
  status: "done" | "scheduled" | "overdue" | "paused";
  is_active: boolean;
}

export async function getCountPlanGanttData(): Promise<CountPlanGanttBar[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("inventory_count_plans")
    .select("id, plan_name, warehouse_id, plan_type, next_run_at, last_run_at, is_active, metadata")
    .eq("brand_id", brand);
  if (error) throw error;
  const plans = data ?? [];

  const wIds = Array.from(new Set(plans.map((p) => p.warehouse_id).filter((x): x is string => !!x)));
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return plans
    .map((p): CountPlanGanttBar | null => {
      const meta = (p.metadata as Record<string, unknown> | null) ?? {};
      const durationDays =
        typeof meta.duration_days === "number" && meta.duration_days > 0
          ? meta.duration_days
          : 2;
      const assigneeLabel =
        typeof meta.assignee_label === "string" ? meta.assignee_label : null;

      // 優先用 last_run_at（已執行的呈現歷史 bar）、不然用 next_run_at（排程 bar）
      const baseDateStr = p.last_run_at ?? p.next_run_at;
      if (!baseDateStr) return null;
      const startDate = new Date(baseDateStr);
      if (Number.isNaN(startDate.getTime())) return null;
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate.getTime() + durationDays * 86400_000);

      let status: CountPlanGanttBar["status"];
      if (!p.is_active) {
        status = "paused";
      } else if (p.last_run_at && new Date(p.last_run_at) >= startDate) {
        status = "done";
      } else if (p.next_run_at && new Date(p.next_run_at) < today && !p.last_run_at) {
        status = "overdue";
      } else {
        status = "scheduled";
      }

      return {
        id: p.id,
        plan_name: p.plan_name,
        warehouse_name: p.warehouse_id ? wMap.get(p.warehouse_id) ?? null : null,
        plan_type: p.plan_type,
        start: startDate.toISOString().slice(0, 10),
        end: endDate.toISOString().slice(0, 10),
        duration_days: durationDays,
        assignee_label: assigneeLabel,
        status,
        is_active: p.is_active,
      };
    })
    .filter((x): x is CountPlanGanttBar => x !== null)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export async function getCountPlanById(id: string): Promise<{
  plan: CountPlanListRow;
  warehouses: { id: string; name: string; code: string }[];
} | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("inventory_count_plans")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const wRes = await supabase
    .from("warehouses")
    .select("id, name, code")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("code");
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));
  return {
    plan: {
      ...data,
      warehouse_name: data.warehouse_id ? wMap.get(data.warehouse_id) ?? null : null,
    },
    warehouses: wRes.data ?? [],
  };
}

export async function getNewCountPlanFormData(): Promise<{
  warehouses: { id: string; name: string; code: string }[];
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name, code")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("code");
  if (error) throw error;
  return { warehouses: data ?? [] };
}

export async function getCountSessionsPageData(filter: {
  status?: string;
  q?: string;
  warehouse_id?: string;
} = {}): Promise<{
  rows: CountSessionListRow[];
  warehouses: { id: string; name: string; code: string }[];
  canEdit: boolean;
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const [rows, canEdit, whRes] = await Promise.all([
    listCountSessions(filter),
    hasPermission(PERMISSIONS.COUNT_EXECUTE),
    supabase
      .from("warehouses")
      .select("id, name, code")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code"),
  ]);
  return { rows, warehouses: whRes.data ?? [], canEdit };
}

/**
 * 盤點差異調整 list 頁（/parts/count/adjustments）
 *
 * 與 sessions 共表 inventory_counts、共 helper listCountSessions，
 * 但預設只看「有差異」+「已結算或待覆核」的單，提供差異覆核 / 過帳追溯視角。
 */
export async function getCountAdjustmentsPageData(filter: {
  status?: string;
  q?: string;
  warehouse_id?: string;
  variance_only?: boolean;
} = {}): Promise<{
  rows: CountSessionListRow[];
  warehouses: { id: string; name: string; code: string }[];
  canEdit: boolean;
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const varianceOnly = filter.variance_only ?? true;

  const [rows, canEdit, whRes] = await Promise.all([
    listCountSessions({
      status: filter.status,
      q: filter.q,
      warehouse_id: filter.warehouse_id,
    }),
    hasPermission(PERMISSIONS.COUNT_ADJUST),
    supabase
      .from("warehouses")
      .select("id, name, code")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code"),
  ]);

  // 預設聚焦「已結算 / 待覆核 / 已取消」的單；沒指定 status 時用這組白名單
  const filteredByStatus = filter.status
    ? rows
    : rows.filter((r) =>
        ["pending_approval", "completed", "cancelled"].includes(r.status ?? ""),
      );

  // 差異視角：預設只看 variance_lines > 0 的單
  const filteredByVariance = varianceOnly
    ? filteredByStatus.filter((r) => Number(r.variance_lines ?? 0) > 0)
    : filteredByStatus;

  return { rows: filteredByVariance, warehouses: whRes.data ?? [], canEdit };
}

// ─────────────────────────── Count Ops dashboard（/parts/operations/count-ops） ───────────────────────────

export type CountOpsRow = CountRow & {
  warehouse_name: string | null;
  counted_lines: number;
  progress_pct: number;
};

export interface CountOpsStats {
  in_progress: number;
  pending_plans: number;
  pending_approval: number;
  completed_this_month: number;
  accuracy_last_3: number | null;
}

export interface CountOpsFilter {
  status?: "all" | "active" | "pending_approval" | "completed";
  warehouse_id?: string;
  q?: string;
}

export async function getCountOpsPageData(
  filter: CountOpsFilter = {},
): Promise<{
  rows: CountOpsRow[];
  stats: CountOpsStats;
  warehouses: { id: string; name: string }[];
  canEdit: boolean;
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const canEdit = await hasPermission(PERMISSIONS.COUNT_EXECUTE);

  let baseQ = supabase
    .from("inventory_counts")
    .select(
      "id, ct_no, brand_id, plan_id, warehouse_id, count_date, status, count_type, total_lines, variance_lines, variance_amount, approved_at, approver_id, first_counter_id, second_counter_id, freeze_warehouse, notes, metadata, created_at, created_by, updated_at",
    )
    .eq("brand_id", brand)
    .neq("status", "cancelled")
    .order("count_date", { ascending: false })
    .limit(200);

  if (filter.status === "active") {
    baseQ = baseQ.in("status", ["counting", "first_done", "second_done"]);
  } else if (filter.status === "pending_approval") {
    baseQ = baseQ.eq("status", "pending_approval");
  } else if (filter.status === "completed") {
    baseQ = baseQ.eq("status", "completed");
  }
  if (filter.warehouse_id) baseQ = baseQ.eq("warehouse_id", filter.warehouse_id);
  if (filter.q) baseQ = baseQ.ilike("ct_no", `%${filter.q}%`);

  const { data: counts, error } = await baseQ;
  if (error) throw new Error(`inventory_counts: ${error.message}`);

  const wIds = Array.from(
    new Set((counts ?? []).map((c) => c.warehouse_id).filter((x): x is string => !!x)),
  );
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  // 撈各 ct 的已盤點行數（qty_first_count IS NOT NULL）
  const ctIds = (counts ?? []).map((c) => c.id);
  const countedMap = new Map<string, number>();
  if (ctIds.length > 0) {
    const { data: lines, error: linesErr } = await supabase
      .from("inventory_count_lines")
      .select("ct_id, qty_first_count")
      .in("ct_id", ctIds);
    if (linesErr) throw linesErr;
    for (const l of lines ?? []) {
      if (l.qty_first_count == null) continue;
      countedMap.set(l.ct_id, (countedMap.get(l.ct_id) ?? 0) + 1);
    }
  }

  const rows: CountOpsRow[] = (counts ?? []).map((c) => {
    const counted = countedMap.get(c.id) ?? 0;
    const total = Number(c.total_lines ?? 0);
    return {
      ...(c as CountRow),
      warehouse_name: c.warehouse_id ? wMap.get(c.warehouse_id) ?? null : null,
      counted_lines: counted,
      progress_pct: total > 0 ? Math.min(100, Math.round((counted / total) * 1000) / 10) : 0,
    };
  });

  // KPI stats — 不受 filter 影響、撈全集
  const { data: allCounts, error: allErr } = await supabase
    .from("inventory_counts")
    .select("status, total_lines, variance_lines, variance_amount, approved_at, count_date")
    .eq("brand_id", brand)
    .neq("status", "cancelled");
  if (allErr) throw allErr;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  let inProgress = 0;
  let pendingApproval = 0;
  let completedThisMonth = 0;
  const recentCompleted: Array<{ total: number; var: number }> = [];

  for (const c of allCounts ?? []) {
    if (["counting", "first_done", "second_done"].includes(c.status)) inProgress++;
    if (c.status === "pending_approval") pendingApproval++;
    if (c.status === "completed" && c.approved_at && c.approved_at >= monthStart) {
      completedThisMonth++;
    }
  }
  // 最近 3 筆 completed accuracy
  const { data: latest3, error: latestErr } = await supabase
    .from("inventory_counts")
    .select("total_lines, variance_lines")
    .eq("brand_id", brand)
    .eq("status", "completed")
    .order("approved_at", { ascending: false, nullsFirst: false })
    .limit(3);
  if (latestErr) throw latestErr;
  for (const c of latest3 ?? []) {
    recentCompleted.push({
      total: Number(c.total_lines ?? 0),
      var: Number(c.variance_lines ?? 0),
    });
  }
  let accuracy: number | null = null;
  if (recentCompleted.length > 0) {
    const totalSum = recentCompleted.reduce((s, x) => s + x.total, 0);
    const varSum = recentCompleted.reduce((s, x) => s + Math.abs(x.var), 0);
    if (totalSum > 0) {
      accuracy = Math.max(0, Math.min(100, (1 - varSum / totalSum) * 100));
    }
  }

  // 待開始 plans：next_run_at <= today AND is_active
  const todayStr = now.toISOString().slice(0, 10);
  const { count: pendingPlanCount, error: planErr } = await supabase
    .from("inventory_count_plans")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brand)
    .eq("is_active", true)
    .lte("next_run_at", todayStr);
  if (planErr) throw planErr;

  // warehouse 下拉
  const { data: allWh, error: whErr } = await supabase
    .from("warehouses")
    .select("id, name")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("name");
  if (whErr) throw whErr;

  return {
    rows,
    stats: {
      in_progress: inProgress,
      pending_plans: pendingPlanCount ?? 0,
      pending_approval: pendingApproval,
      completed_this_month: completedThisMonth,
      accuracy_last_3: accuracy,
    },
    warehouses: allWh ?? [],
    canEdit,
  };
}

export type CountSessionLine = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  bin_id: string | null;
  bin_label: string | null;
  qty_system: number;
  qty_first_count: number | null;
  qty_final: number | null;
  variance: number | null;
  variance_amount: number | null;
  unit_cost: number | null;
  status: string;
};

export async function getCountSessionById(id: string): Promise<{
  ct: CountOpsRow;
  lines: CountSessionLine[];
} | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data: ct, error } = await supabase
    .from("inventory_counts")
    .select(
      "id, ct_no, brand_id, plan_id, warehouse_id, count_date, status, count_type, total_lines, variance_lines, variance_amount, approved_at, approver_id, first_counter_id, second_counter_id, freeze_warehouse, notes, metadata, created_at, created_by, updated_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (!ct) return null;

  const { data: wRow } = await supabase
    .from("warehouses")
    .select("name")
    .eq("id", ct.warehouse_id)
    .maybeSingle();

  const { data: linesRaw, error: linesErr } = await supabase
    .from("inventory_count_lines")
    .select(
      "id, line_no, item_id, bin_id, qty_system, qty_first_count, qty_final, variance, variance_amount, unit_cost, status",
    )
    .eq("ct_id", id)
    .order("line_no");
  if (linesErr) throw linesErr;

  const itemIds = Array.from(new Set((linesRaw ?? []).map((l) => l.item_id)));
  const binIds = Array.from(
    new Set((linesRaw ?? []).map((l) => l.bin_id).filter((x): x is string => !!x)),
  );
  const [itemsRes, binsRes] = await Promise.all([
    itemIds.length > 0
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    binIds.length > 0
      ? supabase.from("warehouse_bins").select("id, code").in("id", binIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (binsRes.error) throw binsRes.error;
  const itemMap = new Map(
    (itemsRes.data ?? []).map((i) => [i.id, { code: i.code, name: i.name }]),
  );
  const binMap = new Map((binsRes.data ?? []).map((b) => [b.id, b.code]));

  const lines: CountSessionLine[] = (linesRaw ?? []).map((l) => {
    const it = itemMap.get(l.item_id);
    return {
      id: l.id,
      line_no: l.line_no,
      item_id: l.item_id,
      item_code: it?.code ?? null,
      item_name: it?.name ?? null,
      bin_id: l.bin_id,
      bin_label: l.bin_id ? binMap.get(l.bin_id) ?? null : null,
      qty_system: Number(l.qty_system),
      qty_first_count: l.qty_first_count == null ? null : Number(l.qty_first_count),
      qty_final: l.qty_final == null ? null : Number(l.qty_final),
      variance: l.variance == null ? null : Number(l.variance),
      variance_amount: l.variance_amount == null ? null : Number(l.variance_amount),
      unit_cost: l.unit_cost == null ? null : Number(l.unit_cost),
      status: l.status,
    };
  });

  const counted = lines.filter((l) => l.qty_first_count != null).length;
  const total = Number(ct.total_lines ?? 0);

  return {
    ct: {
      ...(ct as CountRow),
      warehouse_name: wRow?.name ?? null,
      counted_lines: counted,
      progress_pct: total > 0 ? Math.min(100, Math.round((counted / total) * 1000) / 10) : 0,
    },
    lines,
  };
}

export async function getNewCountSessionFormData(): Promise<{
  warehouses: { id: string; name: string }[];
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("warehouses")
    .select("id, name")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  return { warehouses: data ?? [] };
}

/**
 * 取消盤點 session：清 lines、把 ct.status 標為 cancelled。
 * 僅在 status IN ('counting','first_done','second_done') 時允許。
 */
export async function cancelCountSessionAction(
  id: string,
): Promise<{ ok: true; data: { id: string } } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "缺 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: ct, error: getErr } = await supabase
    .from("inventory_counts")
    .select("id, status")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (getErr || !ct) return { ok: false, error: `找不到盤點單：${getErr?.message ?? "no row"}` };
  if (!["counting", "first_done", "second_done"].includes(ct.status)) {
    return { ok: false, error: `狀態 ${ct.status} 不可取消（僅進行中可取消）` };
  }

  const { error: delErr } = await supabase
    .from("inventory_count_lines")
    .delete()
    .eq("ct_id", id);
  if (delErr) return { ok: false, error: `清明細失敗：${delErr.message}` };

  const { error: updErr } = await supabase
    .from("inventory_counts")
    .update({ status: "cancelled", total_lines: 0 })
    .eq("id", id);
  if (updErr) return { ok: false, error: `更新狀態失敗：${updErr.message}` };

  return { ok: true, data: { id } };
}

/**
 * 報損報溢審核 list 視角（/parts/count/loss-overflow）
 *
 * 跟 adjustments 用同一批 inventory_counts row，但呈現「正式損溢單 LG-*」
 * 的審批狀態維度：draft / review / done / reject 四態。
 * 過濾規則同 adjustments — 僅 variance_lines > 0 的差異 session。
 */
export async function getCountLossOverflowPageData(filter: {
  status?: string;
  q?: string;
  warehouse_id?: string;
} = {}): Promise<{
  rows: CountSessionListRow[];
  warehouses: { id: string; name: string; code: string }[];
  canEdit: boolean;
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 反向 mapping：LG status → DB status
  // draft = first_done / second_done; review = pending_approval;
  // done = completed; reject = cancelled
  const lgToDb: Record<string, string[]> = {
    draft: ["first_done", "second_done"],
    review: ["pending_approval"],
    done: ["completed"],
    reject: ["cancelled"],
  };

  const [rows, canEdit, whRes] = await Promise.all([
    listCountSessions({ q: filter.q, warehouse_id: filter.warehouse_id }),
    hasPermission(PERMISSIONS.COUNT_ADJUST),
    supabase
      .from("warehouses")
      .select("id, name, code")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("code"),
  ]);

  // 預設聚焦四態（draft / review / done / reject 對映的所有 DB status）
  const allLgStatuses = ["first_done", "second_done", "pending_approval", "completed", "cancelled"];
  const filteredByStatus = filter.status && lgToDb[filter.status]
    ? rows.filter((r) => lgToDb[filter.status!].includes(r.status ?? ""))
    : rows.filter((r) => allLgStatuses.includes(r.status ?? ""));

  // 報損報溢頁只看有差異的單；無差異的不出現
  const filteredByVariance = filteredByStatus.filter(
    (r) => Number(r.variance_lines ?? 0) > 0,
  );

  return { rows: filteredByVariance, warehouses: whRes.data ?? [], canEdit };
}
