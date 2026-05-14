/**
 * Domain helper — 休眠戰敗管理（/sales/crm/dormant-leads）
 *
 * 業務：把 sales_leads 中 dormancy_status IN ('dormant','lost','revived') 的 row 集中管理，
 * 列出戰敗原因、休眠天數、再接觸排程；提供「喚醒一次」「標記戰敗」「轉回活躍」捷徑。
 *
 * 寫入走 src/lib/sales/sales-dormant-leads-actions.ts。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

export type {
  DormancyStatus,
  DormantLeadKind,
  LostReason,
} from "@/domain/sales-dormant-leads.constants";
import type {
  DormancyStatus,
  DormantLeadKind,
  LostReason,
} from "@/domain/sales-dormant-leads.constants";

export type DormantLeadRow = {
  id: string;
  brand_id: string;
  kind: DormantLeadKind;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  habc: string | null;
  intent_model: string | null;
  source: string | null;
  rs_name: string | null;
  last_visit_at: string | null;
  dormancy_status: DormancyStatus;
  lost_reason: LostReason | null;
  competitor_brand: string | null;
  lost_at: string | null;
  revive_attempt_count: number;
  last_revive_at: string | null;
  next_revive_at: string | null;
  assignee_id: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  /** 衍生：休眠/戰敗起算迄今天數（取 lost_at fallback last_revive_at fallback last_visit_at） */
  dormant_days: number | null;
};

export type DormantLeadFilters = {
  /** all | dormant | lost | revived */
  status: string;
  habc: string;
  reason: string;
  q: string;
  /** sales 版 = 'sales'；aftersales 版 = 'aftersales'；undefined 視為 sales（向後相容） */
  kind?: DormantLeadKind;
};

export type DormantLeadStats = {
  totalDormantOrLost: number;
  dormantCount: number;
  lostCount: number;
  revivedThisMonth: number;
  topLostReason: { reason: LostReason | null; count: number };
  topCompetitor: { brand: string | null; count: number };
  reasonBreakdown: Array<{ reason: LostReason; count: number; pct: number }>;
  competitorBreakdown: Array<{ brand: string; count: number; pct: number }>;
};

type RawRow = {
  id: string;
  brand_id: string;
  kind: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  habc: string | null;
  intent_model: string | null;
  source: string | null;
  rs_name: string | null;
  last_visit_at: string | null;
  dormancy_status: string;
  lost_reason: string | null;
  competitor_brand: string | null;
  lost_at: string | null;
  revive_attempt_count: number | null;
  last_revive_at: string | null;
  next_revive_at: string | null;
  assignee_id: string | null;
  note: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Date.now() - t;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function shapeRow(r: RawRow): DormantLeadRow {
  const anchor = r.lost_at ?? r.last_revive_at ?? r.last_visit_at;
  return {
    id: r.id,
    brand_id: r.brand_id,
    kind: (r.kind === "aftersales" ? "aftersales" : "sales") as DormantLeadKind,
    code: r.code,
    name: r.name,
    phone: r.phone,
    email: r.email,
    habc: r.habc,
    intent_model: r.intent_model,
    source: r.source,
    rs_name: r.rs_name,
    last_visit_at: r.last_visit_at,
    dormancy_status: r.dormancy_status as DormancyStatus,
    lost_reason: (r.lost_reason as LostReason | null) ?? null,
    competitor_brand: r.competitor_brand,
    lost_at: r.lost_at,
    revive_attempt_count: r.revive_attempt_count ?? 0,
    last_revive_at: r.last_revive_at,
    next_revive_at: r.next_revive_at,
    assignee_id: r.assignee_id,
    note: r.note,
    metadata:
      r.metadata && typeof r.metadata === "object"
        ? (r.metadata as Record<string, unknown>)
        : {},
    created_at: r.created_at,
    updated_at: r.updated_at,
    dormant_days: daysSince(anchor),
  };
}

const SELECT_FIELDS =
  "id, brand_id, kind, code, name, phone, email, habc, intent_model, source, rs_name, last_visit_at, dormancy_status, lost_reason, competitor_brand, lost_at, revive_attempt_count, last_revive_at, next_revive_at, assignee_id, note, metadata, created_at, updated_at";

export async function getDormantLeads(
  filters: DormantLeadFilters,
): Promise<DormantLeadRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const kind: DormantLeadKind = filters.kind ?? "sales";

  let q = supabase
    .from("sales_leads")
    .select(SELECT_FIELDS)
    .eq("brand_id", brand)
    .eq("kind", kind)
    .in("dormancy_status", ["dormant", "lost", "revived"]);

  if (filters.status !== "all") q = q.eq("dormancy_status", filters.status);
  if (filters.habc !== "all") q = q.eq("habc", filters.habc);
  if (filters.reason !== "all") q = q.eq("lost_reason", filters.reason);
  if (filters.q.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`name.ilike.%${t}%,code.ilike.%${t}%,phone.ilike.%${t}%`);
  }

  const { data, error } = await q
    .order("lost_at", { ascending: false, nullsFirst: false })
    .order("last_visit_at", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(`dormant-leads list: ${error.message}`);
  return ((data ?? []) as unknown as RawRow[]).map(shapeRow);
}

export async function getDormantLeadStats(
  kind: DormantLeadKind = "sales",
): Promise<DormantLeadStats> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("sales_leads")
    .select(
      "dormancy_status, lost_reason, competitor_brand, last_revive_at, lost_at",
    )
    .eq("brand_id", brand)
    .eq("kind", kind)
    .in("dormancy_status", ["dormant", "lost", "revived"]);
  if (error) throw new Error(`dormant-leads stats: ${error.message}`);

  const rows = (data ?? []) as Array<{
    dormancy_status: string;
    lost_reason: string | null;
    competitor_brand: string | null;
    last_revive_at: string | null;
    lost_at: string | null;
  }>;

  let dormantCount = 0;
  let lostCount = 0;
  let revivedThisMonth = 0;
  const reasonMap = new Map<string, number>();
  const compMap = new Map<string, number>();

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  for (const r of rows) {
    if (r.dormancy_status === "dormant") dormantCount += 1;
    if (r.dormancy_status === "lost") lostCount += 1;
    if (
      r.dormancy_status === "revived" &&
      r.last_revive_at &&
      new Date(r.last_revive_at).getTime() >= monthStart
    ) {
      revivedThisMonth += 1;
    }
    if (r.lost_reason)
      reasonMap.set(r.lost_reason, (reasonMap.get(r.lost_reason) ?? 0) + 1);
    if (r.competitor_brand)
      compMap.set(
        r.competitor_brand,
        (compMap.get(r.competitor_brand) ?? 0) + 1,
      );
  }

  const reasonTotal = Array.from(reasonMap.values()).reduce(
    (a, b) => a + b,
    0,
  );
  const compTotal = Array.from(compMap.values()).reduce((a, b) => a + b, 0);

  const reasonBreakdown = Array.from(reasonMap.entries())
    .map(([reason, count]) => ({
      reason: reason as LostReason,
      count,
      pct: reasonTotal === 0 ? 0 : Math.round((count / reasonTotal) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const competitorBreakdown = Array.from(compMap.entries())
    .map(([brand, count]) => ({
      brand,
      count,
      pct: compTotal === 0 ? 0 : Math.round((count / compTotal) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  return {
    totalDormantOrLost: dormantCount + lostCount,
    dormantCount,
    lostCount,
    revivedThisMonth,
    topLostReason: {
      reason: (reasonBreakdown[0]?.reason as LostReason | null) ?? null,
      count: reasonBreakdown[0]?.count ?? 0,
    },
    topCompetitor: {
      brand: competitorBreakdown[0]?.brand ?? null,
      count: competitorBreakdown[0]?.count ?? 0,
    },
    reasonBreakdown,
    competitorBreakdown,
  };
}

export async function getDormantLeadById(
  id: string,
): Promise<DormantLeadRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("sales_leads")
    .select(SELECT_FIELDS)
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return null;
  return shapeRow(data as unknown as RawRow);
}
