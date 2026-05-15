"use server";

/**
 * Domain Helper — Aftersales Followup Cases（增項閉環追蹤）
 *
 * 對應頁面：/parts/aftersales/followups（看板 + 時間軸 + 整店統計）
 * Spec：docs/DUCATI_售後工單模組_..._最新版/05_增項閉環_完整子模組.html
 *
 * 結構：
 *   followup_cases (envelope) — 一筆 case = 一條閉環追蹤
 *     ↳ followup_events (timeline) — SA 聯繫、主管介入、車主決策、預約建立、結案
 *   ↑ source_addon_id 反指 repair_order_addons
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type CaseStatus =
  | "tracking"
  | "escalated"
  | "long_term"
  | "closed_won"
  | "closed_lost";

export type CaseSafetyLevel = "normal" | "safety_related" | "safety_critical";

export type FollowupEventType =
  | "created"
  | "sa_contact"
  | "supervisor_intervene"
  | "customer_agreed"
  | "long_term_marked"
  | "closed_lost"
  | "line_reminder"
  | "note";

export type FollowupCaseRow = {
  id: string;
  brand_id: string;
  source_addon_id: string;
  source_ro_id: string | null;
  case_no: string;
  title: string;
  safety_level: CaseSafetyLevel;
  estimated_fee: number;
  customer_name: string | null;
  vehicle_model: string | null;
  vehicle_license_plate: string | null;
  sa_id: string | null;
  sa_name: string | null;
  status: CaseStatus;
  next_contact_at: string | null;
  last_contacted_at: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  appointment_id: string | null;
  recovered_amount: number;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

export type FollowupEventRow = {
  id: string;
  brand_id: string;
  case_id: string;
  event_type: FollowupEventType;
  outcome: string | null;
  body: string | null;
  acted_by: string | null;
  acted_by_name: string | null;
  occurred_at: string;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

export type FollowupCaseWithRo = FollowupCaseRow & {
  ro: { id: string; ro_code: string } | null;
};

export type CasesListFilter = {
  status?: CaseStatus | "all" | "open"; // open = tracking + escalated + long_term
  safetyLevel?: CaseSafetyLevel | "all";
  saName?: string | null;
  q?: string | null;
};

export type CasesSummary = {
  totalLost: number;        // 本月失銷金額（所有 case 估價總和）
  totalLostCount: number;
  recovered: number;        // closed_won 金額
  recoveredCount: number;
  closureRate: number;      // recoveredCount / totalCount
  pending: number;          // tracking + escalated 件數
  pendingSafety: number;    // 安全等級 + 未結案
  longTerm: number;
  longTermPotential: number;
};

export type RankRow = { name: string; cnt: number; amt: number };
export type SaPerformanceRow = { sa_name: string; closed: number; total: number; rate: number };

function emptySummary(): CasesSummary {
  return {
    totalLost: 0,
    totalLostCount: 0,
    recovered: 0,
    recoveredCount: 0,
    closureRate: 0,
    pending: 0,
    pendingSafety: 0,
    longTerm: 0,
    longTermPotential: 0,
  };
}

export async function listCases(
  filter: CasesListFilter = {},
): Promise<{ rows: FollowupCaseWithRo[]; summary: CasesSummary }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("followup_cases")
    .select(
      "id, brand_id, source_addon_id, source_ro_id, case_no, title, safety_level, estimated_fee, customer_name, vehicle_model, vehicle_license_plate, sa_id, sa_name, status, next_contact_at, last_contacted_at, closed_at, closed_reason, appointment_id, recovered_amount, metadata, created_at, updated_at",
    )
    .eq("brand_id", brand);

  if (filter.status && filter.status !== "all") {
    if (filter.status === "open") {
      q = q.in("status", ["tracking", "escalated", "long_term"]);
    } else {
      q = q.eq("status", filter.status);
    }
  }
  if (filter.safetyLevel && filter.safetyLevel !== "all") {
    q = q.eq("safety_level", filter.safetyLevel);
  }
  if (filter.saName) {
    q = q.eq("sa_name", filter.saName);
  }
  if (filter.q) {
    q = q.or(
      `title.ilike.%${filter.q}%,customer_name.ilike.%${filter.q}%,case_no.ilike.%${filter.q}%`,
    );
  }

  q = q.order("safety_level", { ascending: true }).order("created_at", { ascending: false });

  const { data: cases, error } = await q;
  if (error) {
    console.error("[domain/followup-cases] listCases error", error);
    return { rows: [], summary: emptySummary() };
  }

  // 帶 ro_code（顯示用）
  const roIds = Array.from(
    new Set(((cases ?? []).map((c) => c.source_ro_id).filter(Boolean) as string[])),
  );
  const roMap = new Map<string, { id: string; ro_code: string }>();
  if (roIds.length > 0) {
    const { data: ros } = await supabase
      .from("repair_orders")
      .select("id, ro_code")
      .in("id", roIds);
    for (const r of ros ?? []) roMap.set(r.id, r as { id: string; ro_code: string });
  }

  const rows: FollowupCaseWithRo[] = (cases ?? []).map((c) => ({
    ...(c as unknown as FollowupCaseRow),
    ro: c.source_ro_id ? roMap.get(c.source_ro_id) ?? null : null,
  }));

  // Summary 跑全集（不受 filter 影響的 KPI 留給呼叫方再呼叫一次）
  const summary = rows.reduce<CasesSummary>((acc, r) => {
    acc.totalLost += Number(r.estimated_fee ?? 0);
    acc.totalLostCount += 1;
    if (r.status === "closed_won") {
      acc.recovered += Number(r.recovered_amount ?? r.estimated_fee ?? 0);
      acc.recoveredCount += 1;
    }
    if (r.status === "tracking" || r.status === "escalated") {
      acc.pending += 1;
      if (r.safety_level !== "normal") acc.pendingSafety += 1;
    }
    if (r.status === "long_term") {
      acc.longTerm += 1;
      acc.longTermPotential += Number(r.estimated_fee ?? 0);
    }
    return acc;
  }, emptySummary());
  summary.closureRate =
    summary.totalLostCount > 0
      ? Math.round((summary.recoveredCount / summary.totalLostCount) * 100)
      : 0;

  return { rows, summary };
}

export async function getCaseById(id: string): Promise<{
  case: FollowupCaseWithRo | null;
  events: FollowupEventRow[];
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: c } = await supabase
    .from("followup_cases")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!c) return { case: null, events: [] };

  let ro: { id: string; ro_code: string } | null = null;
  if (c.source_ro_id) {
    const { data: r } = await supabase
      .from("repair_orders")
      .select("id, ro_code")
      .eq("id", c.source_ro_id)
      .maybeSingle();
    ro = (r ?? null) as { id: string; ro_code: string } | null;
  }

  const { data: events } = await supabase
    .from("followup_events")
    .select("*")
    .eq("case_id", id)
    .order("occurred_at", { ascending: true });

  return {
    case: { ...(c as FollowupCaseRow), ro },
    events: (events ?? []) as FollowupEventRow[],
  };
}

/**
 * 統計 — Top 5 失銷項目（依 title 群聚）
 */
export async function topLostItems(): Promise<RankRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("followup_cases")
    .select("title, estimated_fee")
    .eq("brand_id", brand);
  const buckets = new Map<string, { cnt: number; amt: number }>();
  for (const r of data ?? []) {
    const key = (r.title as string) || "未命名";
    const cur = buckets.get(key) ?? { cnt: 0, amt: 0 };
    cur.cnt += 1;
    cur.amt += Number(r.estimated_fee ?? 0);
    buckets.set(key, cur);
  }
  return Array.from(buckets.entries())
    .map(([name, v]) => ({ name, cnt: v.cnt, amt: v.amt }))
    .sort((a, b) => b.cnt - a.cnt)
    .slice(0, 5);
}

/**
 * 統計 — SA 個人閉環績效
 */
export async function saPerformance(): Promise<SaPerformanceRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("followup_cases")
    .select("sa_name, status")
    .eq("brand_id", brand);
  const map = new Map<string, { closed: number; total: number }>();
  for (const r of data ?? []) {
    const name = (r.sa_name as string) || "（未指派）";
    const cur = map.get(name) ?? { closed: 0, total: 0 };
    cur.total += 1;
    if (r.status === "closed_won") cur.closed += 1;
    map.set(name, cur);
  }
  return Array.from(map.entries())
    .map(([sa_name, v]) => ({
      sa_name,
      closed: v.closed,
      total: v.total,
      rate: v.total > 0 ? Math.round((v.closed / v.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

/**
 * 統計 — SA 名單（filter dropdown 用）
 */
export async function listSaNames(): Promise<string[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data } = await supabase
    .from("followup_cases")
    .select("sa_name")
    .eq("brand_id", brand)
    .not("sa_name", "is", null);
  return Array.from(new Set((data ?? []).map((r) => r.sa_name as string).filter(Boolean))).sort();
}
