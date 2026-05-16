"use server";

/**
 * Domain Helper — 售後 派工看板 (Aftersales Technicians)
 *
 * 對應頁面：/parts/aftersales/management/dispatch
 * Spec：07_售後管理模組_v2.html → 即時看板 → 👨‍🔧 派工看板
 *
 * 紀律：UI 不得直連 supabase，全走本 helper。
 * 跟 service-bays 對稱：用「主表存當前 demo 狀態」的精簡 schema，
 * 等真實 dispatch / clock_logs 上線後再升級。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { TechStatus } from "./aftersales-technicians.constants";
import {
  computeEfficiency,
  computeProductivity,
  computeUtilization,
} from "./aftersales-technicians.constants";

export type AftersalesTechnicianRow = {
  id: string;
  brand_id: string;
  organization_id: string | null;
  subsidiary_id: string | null;
  code: string;
  name: string;
  grade: string | null;
  avatar_color: string | null;
  status: TechStatus;
  current_ro_code: string | null;
  current_item: string | null;
  current_bay_code: string | null;
  started_at: string | null;
  jobs_total: number;
  jobs_done: number;
  sold_minutes: number;
  actual_minutes: number;
  available_minutes: number;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type DispatchKpis = {
  working: number;
  idle: number;
  break: number;
  off: number;
  total_active: number;
};

/** 全員合計（NADA 三指標彙總，footer 用） */
export type DispatchTotals = {
  total_jobs: number;
  done_jobs: number;
  in_progress_jobs: number;
  sold_minutes: number;
  actual_minutes: number;
  available_minutes: number;
  avg_eff: number;
  avg_prod: number;
  avg_util: number;
  technician_count: number;
};

/* ──────────────── Read ──────────────── */

/** 列出當前 brand 全部技師（依 sort_order） */
export async function listAftersalesTechnicians(): Promise<
  AftersalesTechnicianRow[]
> {
  const scope = await getActiveScope();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("aftersales_technicians")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AftersalesTechnicianRow[];
}

/** KPI bar：施工中 / 待命 / 休息 / 下班 計數 */
export async function computeDispatchKpis(): Promise<DispatchKpis> {
  const list = await listAftersalesTechnicians();
  const k: DispatchKpis = {
    working: 0,
    idle: 0,
    break: 0,
    off: 0,
    total_active: 0,
  };
  for (const t of list) {
    if (!t.is_active) continue;
    k.total_active += 1;
    if (t.status === "working") k.working += 1;
    else if (t.status === "idle") k.idle += 1;
    else if (t.status === "break") k.break += 1;
    else if (t.status === "off") k.off += 1;
  }
  return k;
}

/** 全員 NADA 合計（統計表 footer） */
export async function computeDispatchTotals(): Promise<DispatchTotals> {
  const list = await listAftersalesTechnicians();
  let total_jobs = 0;
  let done_jobs = 0;
  let sold = 0;
  let actual = 0;
  let avail = 0;
  let count = 0;
  for (const t of list) {
    if (!t.is_active) continue;
    total_jobs += t.jobs_total;
    done_jobs += t.jobs_done;
    sold += t.sold_minutes;
    actual += t.actual_minutes;
    avail += t.available_minutes;
    count += 1;
  }
  return {
    total_jobs,
    done_jobs,
    in_progress_jobs: Math.max(0, total_jobs - done_jobs),
    sold_minutes: sold,
    actual_minutes: actual,
    available_minutes: avail,
    avg_eff: computeEfficiency(sold, actual),
    avg_prod: computeProductivity(sold, avail),
    avg_util: computeUtilization(actual, avail),
    technician_count: count,
  };
}

/* ──────────────── 集團 Dashboard — 售後人效彙整 (C13b) ──────────────── */

/** 單筆技師人效排行（NADA 三指標 by tech） */
export type TechnicianEfficiencyRankRow = {
  id: string;
  code: string;
  name: string;
  grade: string | null;
  avatar_color: string | null;
  status: TechStatus;
  jobs_total: number;
  jobs_done: number;
  sold_hours: number;
  actual_hours: number;
  available_hours: number;
  efficiency: number;   // sold ÷ actual × 100 — 目標 ≥ 125%
  productivity: number; // sold ÷ available × 100 — 目標 85-87.5%
  utilization: number;  // actual ÷ available × 100 — 目標 ≥ 80%
};

export type TechnicianEfficiencyKpis = {
  technician_count: number;
  working: number;
  jobs_total: number;
  jobs_done: number;
  jobs_in_progress: number;
  avg_efficiency: number;
  avg_productivity: number;
  avg_utilization: number;
  /** 達 NADA 效率目標 (≥125%) 的人數 */
  eff_on_target_count: number;
  /** 達 NADA 利用率目標 (≥80%) 的人數 */
  util_on_target_count: number;
  total_sold_hours: number;
  total_actual_hours: number;
  total_available_hours: number;
};

/**
 * 集團看板 — 售後人效統計
 * 一次回 KPI + 全員排行（依效率 desc）。
 * read-only：不做寫入，純從現有 dispatch 主表的當前快照算。
 */
export async function getTechnicianEfficiencySummary(options?: {
  topN?: number;
}): Promise<{
  kpis: TechnicianEfficiencyKpis;
  ranking: TechnicianEfficiencyRankRow[];
}> {
  const list = await listAftersalesTechnicians();
  const active = list.filter((t) => t.is_active);

  const ranking: TechnicianEfficiencyRankRow[] = active.map((t) => {
    const sold_hours = Math.round((t.sold_minutes / 60) * 10) / 10;
    const actual_hours = Math.round((t.actual_minutes / 60) * 10) / 10;
    const available_hours = Math.round((t.available_minutes / 60) * 10) / 10;
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      grade: t.grade,
      avatar_color: t.avatar_color,
      status: t.status,
      jobs_total: t.jobs_total,
      jobs_done: t.jobs_done,
      sold_hours,
      actual_hours,
      available_hours,
      efficiency: computeEfficiency(t.sold_minutes, t.actual_minutes),
      productivity: computeProductivity(t.sold_minutes, t.available_minutes),
      utilization: computeUtilization(t.actual_minutes, t.available_minutes),
    };
  });

  // 預設依效率排序
  ranking.sort((a, b) => b.efficiency - a.efficiency);
  const topN = options?.topN;
  const sliced = topN && topN > 0 ? ranking.slice(0, topN) : ranking;

  // KPI 彙整（用全集計算，slice 只影響 ranking 顯示）
  let jobs_total = 0;
  let jobs_done = 0;
  let sold_min = 0;
  let actual_min = 0;
  let avail_min = 0;
  let working = 0;
  let eff_on = 0;
  let util_on = 0;
  for (const r of ranking) {
    jobs_total += r.jobs_total;
    jobs_done += r.jobs_done;
    sold_min += r.sold_hours * 60;
    actual_min += r.actual_hours * 60;
    avail_min += r.available_hours * 60;
    if (r.status === "working") working += 1;
    if (r.efficiency >= 125) eff_on += 1;
    if (r.utilization >= 80) util_on += 1;
  }
  const kpis: TechnicianEfficiencyKpis = {
    technician_count: ranking.length,
    working,
    jobs_total,
    jobs_done,
    jobs_in_progress: Math.max(0, jobs_total - jobs_done),
    avg_efficiency: computeEfficiency(sold_min, actual_min),
    avg_productivity: computeProductivity(sold_min, avail_min),
    avg_utilization: computeUtilization(actual_min, avail_min),
    eff_on_target_count: eff_on,
    util_on_target_count: util_on,
    total_sold_hours: Math.round((sold_min / 60) * 10) / 10,
    total_actual_hours: Math.round((actual_min / 60) * 10) / 10,
    total_available_hours: Math.round((avail_min / 60) * 10) / 10,
  };
  return { kpis, ranking: sliced };
}
