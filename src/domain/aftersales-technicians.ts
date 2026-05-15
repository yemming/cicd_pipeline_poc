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
