"use server";

/**
 * Domain Helper — 售後 工位看板 (Service Bays)
 *
 * 對應頁面：/parts/aftersales/management/bays
 * Spec：07_售後管理模組_v2.html（即時看板 → 工位看板 sub-tab）
 *
 * 紀律：UI 不得直連 supabase，全走本 helper。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { BayStatus, BayType } from "./service-bays.constants";
import { URGENT_THRESHOLD_MINUTES, elapsedMinutes } from "./service-bays.constants";

export type ServiceBayRow = {
  id: string;
  brand_id: string;
  organization_id: string | null;
  subsidiary_id: string | null;
  code: string;
  name: string;
  bay_type: BayType | string | null;
  purpose: string | null;
  status: BayStatus;
  current_ro_code: string | null;
  current_item: string | null;
  current_tech_name: string | null;
  current_tech_color: string | null;
  started_at: string | null;
  done_today: number;
  used_minutes: number;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ServiceBayKpis = {
  free: number;
  busy: number;
  urgent: number;
  offline: number;
  total: number;
};

export type BayEfficiencyRow = {
  bay_id: string;
  code: string;
  name: string;
  bay_type: string | null;
  purpose: string | null;
  done_today: number;
  used_minutes: number;
  available_minutes: number;
  usage_pct: number;
  turnover: number;
  status: BayStatus;
};

/* ──────────────── Read ──────────────── */

/** 列出當前 brand 全部工位（依 sort_order） */
export async function listServiceBays(): Promise<ServiceBayRow[]> {
  const scope = await getActiveScope();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("service_bays")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("sort_order", { ascending: true });
  if (error) throw error;

  // 把 elapsed > urgent 閾值且還是 busy 的，自動升 urgent（read-time 計算，不寫回）
  const list = (data ?? []) as ServiceBayRow[];
  return list.map((b) => {
    if (b.status === "busy" && b.started_at) {
      const elapsed = elapsedMinutes(b.started_at);
      if (elapsed >= URGENT_THRESHOLD_MINUTES) {
        return { ...b, status: "urgent" as BayStatus };
      }
    }
    return b;
  });
}

export async function computeBayKpis(): Promise<ServiceBayKpis> {
  const bays = await listServiceBays();
  const kpi: ServiceBayKpis = {
    free: 0,
    busy: 0,
    urgent: 0,
    offline: 0,
    total: bays.length,
  };
  for (const b of bays) kpi[b.status] += 1;
  return kpi;
}

/** 算每個工位的效率指標（read-time on-the-fly） */
export async function computeBayEfficiency(
  dailyHours: number,
): Promise<{ rows: BayEfficiencyRow[]; totals: BayEfficiencyRow }> {
  const bays = await listServiceBays();
  const availableMinutes = dailyHours * 60;
  const rows: BayEfficiencyRow[] = bays.map((b) => {
    const usage_pct =
      availableMinutes > 0 && b.is_active
        ? Math.min(999, Math.round((b.used_minutes / availableMinutes) * 100))
        : 0;
    const turnover = b.done_today; // 周轉率 by bay = 該工位完成數
    return {
      bay_id: b.id,
      code: b.code,
      name: b.name,
      bay_type: b.bay_type,
      purpose: b.purpose,
      done_today: b.done_today,
      used_minutes: b.used_minutes,
      available_minutes: b.is_active ? availableMinutes : 0,
      usage_pct,
      turnover,
      status: b.status,
    };
  });
  const activeRows = rows.filter((r) => r.status !== "offline");
  const totalDone = rows.reduce((s, r) => s + r.done_today, 0);
  const totalUsed = rows.reduce((s, r) => s + r.used_minutes, 0);
  const totalAvail = activeRows.reduce((s, r) => s + r.available_minutes, 0);
  const avgUsage = totalAvail > 0 ? Math.round((totalUsed / totalAvail) * 100) : 0;
  const avgTurnover =
    activeRows.length > 0
      ? Math.round((totalDone / activeRows.length) * 10) / 10
      : 0;
  const totals: BayEfficiencyRow = {
    bay_id: "__total__",
    code: "合計",
    name: "全場合計",
    bay_type: null,
    purpose: null,
    done_today: totalDone,
    used_minutes: totalUsed,
    available_minutes: totalAvail,
    usage_pct: avgUsage,
    turnover: avgTurnover,
    status: "free",
  };
  return { rows, totals };
}

/* ──────────────── Daily Hours (store-level setting) ──────────────── */

/**
 * 從 organizations.metadata.shop_daily_hours 讀；缺則 fallback 9。
 * 同 brand 取 level=2 的 store；POC 階段一個 brand 一個 store，沒有就 default。
 */
export async function getShopDailyHours(): Promise<number> {
  const scope = await getActiveScope();
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("metadata")
    .eq("brand_id", scope.brand_id)
    .eq("level", 2)
    .limit(1)
    .maybeSingle();
  const meta = (data?.metadata ?? {}) as Record<string, unknown>;
  const v = Number(meta.shop_daily_hours ?? 9);
  if (!Number.isFinite(v) || v <= 0) return 9;
  return v;
}

export async function setShopDailyHours(
  hours: number,
): Promise<{ ok: boolean; error?: string }> {
  if (![8, 9, 10, 12].includes(hours))
    return { ok: false, error: "可用工時必須是 8/9/10/12 之一" };
  const scope = await getActiveScope();
  const supabase = await createClient();
  const { data: org, error: e1 } = await supabase
    .from("organizations")
    .select("id, metadata")
    .eq("brand_id", scope.brand_id)
    .eq("level", 2)
    .limit(1)
    .maybeSingle();
  if (e1) return { ok: false, error: e1.message };
  if (!org) return { ok: false, error: "找不到門店組織" };
  const next = { ...((org.metadata ?? {}) as Record<string, unknown>), shop_daily_hours: hours };
  const { error } = await supabase
    .from("organizations")
    .update({ metadata: next })
    .eq("id", org.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
