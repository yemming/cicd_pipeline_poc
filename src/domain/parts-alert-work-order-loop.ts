"use server";

/**
 * Domain Helper — 工單缺料閉環統計（M04L-8 A 級儀表板專用）
 *
 * 跟 `src/domain/alerts.ts` 既有的 CRUD helper 共用 `parts_workorder_loop_entries` 表，
 * 這裡只新增 KPI / 漏斗 / 階段分佈 / aging 等「分析用」query；CRUD 仍走 alerts.ts。
 *
 * 6 階段 stage 對映（軟性，根據 status + is_overdue + days_pending + po_no 推導）：
 *   1) sa_picking    — 領料當下發現缺料（pending + days <= 1 + 無 PO）
 *   2) shortage_alert — 缺料告警（pending + days >= 2 + 無 PO）
 *   3) auto_demand    — 自動建補貨需求（pending + 有 PO + days < 4）
 *   4) po_review      — 採購審核中（escalated 或 pending + days >= 4）
 *   5) part_arrived   — 備件到庫（resolved + days_pending=0；剛入庫待派發）
 *   6) auto_closed    — 自動解除（resolved + days_pending > 0）
 *
 * 注：viewer 取向、不改 status enum、不寫回 DB。
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";
import {
  LOOP_STAGE_LABELS,
  LOOP_STAGE_ORDER,
  type LoopStageKey,
} from "./parts-alert-work-order-loop.constants";

type Tables = Database["public"]["Tables"];
type EntryRow = Tables["parts_workorder_loop_entries"]["Row"];

export type LoopStageStat = {
  key: LoopStageKey;
  label: string;
  count: number;
  avg_days: number;
  overdue_count: number;
};

export type LoopKpi = {
  open_count: number;
  overdue_count: number;
  resolved_count: number;
  total_count: number;
  avg_cycle_days: number;
  avg_open_days: number;
};

export type LoopFunnelDatum = {
  name: string;
  value: number;
};

export type LoopFilter = {
  q?: string;
  status?: "pending" | "escalated" | "resolved" | "";
  overdue_only?: boolean;
  sa_name?: string;
  stage?: LoopStageKey | "";
};

export type LoopRowWithStage = EntryRow & { stage: LoopStageKey };

// ─────────────────────────────────────────────────────────────────────────
// 內部 helpers（同步、不 export）
// ─────────────────────────────────────────────────────────────────────────
function resolveLoopStageSync(row: EntryRow): LoopStageKey {
  if (row.status === "resolved") {
    return row.days_pending === 0 ? "part_arrived" : "auto_closed";
  }
  if (row.status === "escalated") return "po_review";
  if (!row.po_no) {
    if (row.days_pending <= 1) return "sa_picking";
    return "shortage_alert";
  }
  if (row.days_pending >= 4) return "po_review";
  return "auto_demand";
}

async function fetchAllRows(): Promise<EntryRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("parts_workorder_loop_entries")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────────────────
// Public（async only — 因為 "use server"）
// ─────────────────────────────────────────────────────────────────────────

export async function listLoopRowsWithStage(
  filter: LoopFilter = {},
): Promise<LoopRowWithStage[]> {
  const all = await fetchAllRows();
  let rows: LoopRowWithStage[] = all.map((r) => ({ ...r, stage: resolveLoopStageSync(r) }));
  if (filter.status) rows = rows.filter((r) => r.status === filter.status);
  if (filter.overdue_only) rows = rows.filter((r) => r.is_overdue);
  if (filter.sa_name) rows = rows.filter((r) => (r.sa_name ?? "") === filter.sa_name);
  if (filter.stage) rows = rows.filter((r) => r.stage === filter.stage);
  if (filter.q) {
    const ql = filter.q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.ro_no.toLowerCase().includes(ql) ||
        (r.missing_parts ?? "").toLowerCase().includes(ql) ||
        (r.po_no ?? "").toLowerCase().includes(ql) ||
        (r.sa_name ?? "").toLowerCase().includes(ql),
    );
  }
  return rows;
}

export async function computeLoopKpi(): Promise<LoopKpi> {
  const all = await fetchAllRows();
  const open = all.filter((r) => r.status !== "resolved");
  const resolved = all.filter((r) => r.status === "resolved");
  const overdue = all.filter((r) => r.is_overdue && r.status !== "resolved");

  const sumAll = all.reduce((s, r) => s + (r.days_pending ?? 0), 0);
  const sumOpen = open.reduce((s, r) => s + (r.days_pending ?? 0), 0);

  return {
    open_count: open.length,
    overdue_count: overdue.length,
    resolved_count: resolved.length,
    total_count: all.length,
    avg_cycle_days: all.length ? Number((sumAll / all.length).toFixed(1)) : 0,
    avg_open_days: open.length ? Number((sumOpen / open.length).toFixed(1)) : 0,
  };
}

export async function computeLoopStageStats(): Promise<LoopStageStat[]> {
  const all = await fetchAllRows();
  const buckets = new Map<LoopStageKey, EntryRow[]>();
  for (const k of LOOP_STAGE_ORDER) buckets.set(k, []);
  for (const r of all) {
    const key = resolveLoopStageSync(r);
    const list = buckets.get(key);
    if (list) list.push(r);
  }
  return LOOP_STAGE_ORDER.map((key) => {
    const list = buckets.get(key) ?? [];
    const sum = list.reduce((s, r) => s + (r.days_pending ?? 0), 0);
    const overdue = list.filter((r) => r.is_overdue).length;
    return {
      key,
      label: LOOP_STAGE_LABELS[key],
      count: list.length,
      avg_days: list.length ? Number((sum / list.length).toFixed(1)) : 0,
      overdue_count: overdue,
    };
  });
}

export async function computeLoopFunnel(): Promise<LoopFunnelDatum[]> {
  const all = await fetchAllRows();
  const hasPo = all.filter((r) => !!r.po_no);
  const reviewedOrDone = all.filter((r) => r.status !== "pending");
  const resolved = all.filter((r) => r.status === "resolved");
  return [
    { name: "SA 領料", value: all.length },
    {
      name: "缺料告警",
      value: all.filter((r) => r.days_pending >= 1 || r.status !== "pending").length,
    },
    { name: "自動建需求", value: hasPo.length },
    { name: "採購審核", value: reviewedOrDone.length },
    { name: "備件到庫", value: resolved.length },
    { name: "自動解除", value: resolved.length },
  ];
}

export async function listLoopSaOptions(): Promise<string[]> {
  const all = await fetchAllRows();
  const set = new Set<string>();
  for (const r of all) {
    if (r.sa_name && r.sa_name.trim()) set.add(r.sa_name.trim());
  }
  return Array.from(set).sort();
}

export async function getLoopBoardData(filter: LoopFilter = {}): Promise<{
  rows: LoopRowWithStage[];
  kpi: LoopKpi;
  stages: LoopStageStat[];
  funnel: LoopFunnelDatum[];
  sa_options: string[];
  canEdit: boolean;
}> {
  const [rows, kpi, stages, funnel, sa_options, canEdit] = await Promise.all([
    listLoopRowsWithStage(filter),
    computeLoopKpi(),
    computeLoopStageStats(),
    computeLoopFunnel(),
    listLoopSaOptions(),
    hasPermission(PERMISSIONS.ALERT_CONFIG),
  ]);
  return { rows, kpi, stages, funnel, sa_options, canEdit };
}
