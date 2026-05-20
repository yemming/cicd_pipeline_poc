"use server";

/**
 * Domain Helper — 報損報溢（Loss / Overflow）
 *
 * 對映 `inventory_adjustments` 表：type=loss/exception_out → 報損；
 * type=gain/exception_in/other → 報溢。reason 拆五類 (damage / lost /
 * expired / count_error / other)。
 *
 * 提供：list / analytics (KpiCard / DonutChart / LineChart) + CRUD facade。
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  APPROVAL_THRESHOLD,
  REASON_LABEL,
  type LossOverflowReason,
} from "@/domain/loss-overflow.constants";

export type LossOverflowKind = "loss" | "overflow";

const LOSS_TYPES = ["loss", "exception_out"] as const;
const OVERFLOW_TYPES = ["gain", "exception_in", "other"] as const;

export type LossOverflowRow = {
  id: string;
  brand_id: string;
  adj_no: string;
  warehouse_id: string;
  warehouse_name: string | null;
  type: string;
  kind: LossOverflowKind;
  reason: string;
  reason_kind: LossOverflowReason | null;
  total_amount: number;
  abs_amount: number;
  status: string;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  posted_at: string | null;
  gl_posted: boolean;
  requires_approval: boolean;
  created_at: string;
};

export type LossOverflowFilters = {
  kind?: LossOverflowKind | "";
  reason?: string;
  status?: string;
  warehouse_id?: string;
  date_from?: string;
  date_to?: string;
  amount_min?: number;
  amount_max?: number;
  q?: string;
};

export type LossOverflowAnalytics = {
  month_loss_amount: number;
  month_overflow_amount: number;
  pending_approval_count: number;
  pending_approval_amount: number;
};

export type ReasonBreakdown = {
  reason: LossOverflowReason;
  label: string;
  count: number;
  amount: number;
};

export type TrendPoint = {
  month: string; // YYYY-MM
  label: string;
  loss_amount: number; // 正值
  overflow_amount: number;
};

function classifyKind(type: string): LossOverflowKind {
  return (LOSS_TYPES as readonly string[]).includes(type) ? "loss" : "overflow";
}

function classifyReason(raw: string | null | undefined): LossOverflowReason | null {
  if (!raw) return null;
  const v = raw.toLowerCase();
  if (["damage", "lost", "expired", "count_error", "other"].includes(v)) {
    return v as LossOverflowReason;
  }
  // 對舊資料盡力分類：reason text 含關鍵字
  if (v.includes("damage") || v.includes("毀") || v.includes("壞")) return "damage";
  if (v.includes("lost") || v.includes("短") || v.includes("少")) return "lost";
  if (v.includes("expir") || v.includes("過期")) return "expired";
  if (v.includes("count") || v.includes("盤")) return "count_error";
  return "other";
}

function decorate(row: {
  id: string;
  brand_id: string;
  adj_no: string;
  warehouse_id: string;
  type: string;
  reason: string;
  total_amount: number | string | null;
  status: string;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  posted_at: string | null;
  gl_posted: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}, warehouseName: string | null): LossOverflowRow {
  const total = Number(row.total_amount ?? 0);
  const reasonKindFromMeta =
    row.metadata && typeof row.metadata === "object" && row.metadata !== null
      ? (row.metadata as { reason_kind?: string }).reason_kind ?? null
      : null;
  const reasonKind = (reasonKindFromMeta
    ? classifyReason(reasonKindFromMeta)
    : classifyReason(row.reason));
  return {
    id: row.id,
    brand_id: row.brand_id,
    adj_no: row.adj_no,
    warehouse_id: row.warehouse_id,
    warehouse_name: warehouseName,
    type: row.type,
    kind: classifyKind(row.type),
    reason: row.reason,
    reason_kind: reasonKind,
    total_amount: total,
    abs_amount: Math.abs(total),
    status: row.status,
    notes: row.notes,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    posted_at: row.posted_at,
    gl_posted: !!row.gl_posted,
    requires_approval: Math.abs(total) >= APPROVAL_THRESHOLD,
    created_at: row.created_at,
  };
}

export async function listLossOverflow(
  filters: LossOverflowFilters = {},
): Promise<LossOverflowRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("inventory_adjustments")
    .select(
      "id, brand_id, adj_no, warehouse_id, type, reason, total_amount, status, notes, approved_by, approved_at, posted_at, gl_posted, metadata, created_at",
    )
    .eq("brand_id", brand)
    .order("created_at", { ascending: false })
    .limit(500);

  if (filters.warehouse_id) q = q.eq("warehouse_id", filters.warehouse_id);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.date_from) q = q.gte("created_at", filters.date_from);
  if (filters.date_to) {
    // 含 end-of-day
    q = q.lt("created_at", filters.date_to + "T23:59:59");
  }
  if (filters.q) q = q.ilike("adj_no", `%${filters.q}%`);

  if (filters.kind === "loss") {
    q = q.in("type", LOSS_TYPES as unknown as string[]);
  } else if (filters.kind === "overflow") {
    q = q.in("type", OVERFLOW_TYPES as unknown as string[]);
  }

  const { data, error } = await q;
  if (error) throw new Error(`listLossOverflow: ${error.message}`);
  if (!data || data.length === 0) return [];

  const whIds = Array.from(new Set(data.map((r) => r.warehouse_id).filter((x): x is string => !!x)));
  const whRes = whIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", whIds)
    : { data: [], error: null };
  if (whRes.error) throw whRes.error;
  const whMap = new Map((whRes.data ?? []).map((w) => [w.id, w.name]));

  let rows = data.map((r) =>
    decorate(
      r as Parameters<typeof decorate>[0],
      r.warehouse_id ? whMap.get(r.warehouse_id) ?? null : null,
    ),
  );

  if (filters.reason) {
    rows = rows.filter((r) => r.reason_kind === filters.reason);
  }
  if (filters.amount_min !== undefined) {
    rows = rows.filter((r) => r.abs_amount >= (filters.amount_min ?? 0));
  }
  if (filters.amount_max !== undefined) {
    rows = rows.filter((r) => r.abs_amount <= (filters.amount_max ?? Infinity));
  }
  return rows;
}

export async function getLossOverflowAnalytics(): Promise<LossOverflowAnalytics> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  const { data, error } = await supabase
    .from("inventory_adjustments")
    .select("type, total_amount, status, created_at")
    .eq("brand_id", brand)
    .gte("created_at", monthStartIso);
  if (error) throw error;

  // pending approval — 整體（不限本月）的 submitted 件數 + 金額
  const { data: pendingData, error: pendErr } = await supabase
    .from("inventory_adjustments")
    .select("total_amount")
    .eq("brand_id", brand)
    .eq("status", "submitted");
  if (pendErr) throw pendErr;

  let lossAmt = 0;
  let overflowAmt = 0;
  for (const r of data ?? []) {
    const total = Number(r.total_amount ?? 0);
    const kind = classifyKind(r.type);
    if (kind === "loss") lossAmt += Math.abs(total);
    else overflowAmt += Math.abs(total);
  }

  const pendingCount = (pendingData ?? []).length;
  const pendingAmount = (pendingData ?? []).reduce(
    (s, r) => s + Math.abs(Number(r.total_amount ?? 0)),
    0,
  );

  return {
    month_loss_amount: lossAmt,
    month_overflow_amount: overflowAmt,
    pending_approval_count: pendingCount,
    pending_approval_amount: pendingAmount,
  };
}

export async function getLossOverflowReasonBreakdown(
  days = 90,
): Promise<ReasonBreakdown[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("inventory_adjustments")
    .select("type, reason, total_amount, metadata, created_at")
    .eq("brand_id", brand)
    .gte("created_at", since.toISOString())
    .in("type", LOSS_TYPES as unknown as string[]); // 只看報損
  if (error) throw error;

  const buckets: Record<LossOverflowReason, { count: number; amount: number }> = {
    damage: { count: 0, amount: 0 },
    lost: { count: 0, amount: 0 },
    expired: { count: 0, amount: 0 },
    count_error: { count: 0, amount: 0 },
    other: { count: 0, amount: 0 },
  };

  for (const r of data ?? []) {
    const meta = (r.metadata ?? {}) as { reason_kind?: string };
    const reasonKind =
      classifyReason(meta.reason_kind ?? null) ?? classifyReason(r.reason) ?? "other";
    buckets[reasonKind].count += 1;
    buckets[reasonKind].amount += Math.abs(Number(r.total_amount ?? 0));
  }

  return (Object.keys(buckets) as LossOverflowReason[]).map((k) => ({
    reason: k,
    label: REASON_LABEL[k],
    count: buckets[k].count,
    amount: buckets[k].amount,
  }));
}

export async function getLossOverflowTrend(months = 6): Promise<TrendPoint[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("inventory_adjustments")
    .select("type, total_amount, created_at")
    .eq("brand_id", brand)
    .gte("created_at", since.toISOString());
  if (error) throw error;

  // 預備 N 個月 buckets
  const points: TrendPoint[] = [];
  const cursor = new Date(since);
  for (let i = 0; i < months; i++) {
    const ym = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    points.push({
      month: ym,
      label: `${cursor.getMonth() + 1}月`,
      loss_amount: 0,
      overflow_amount: 0,
    });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const byMonth = new Map(points.map((p) => [p.month, p]));

  for (const r of data ?? []) {
    const d = new Date(r.created_at);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const point = byMonth.get(ym);
    if (!point) continue;
    const total = Number(r.total_amount ?? 0);
    const kind = classifyKind(r.type);
    if (kind === "loss") point.loss_amount += Math.abs(total);
    else point.overflow_amount += Math.abs(total);
  }

  return points;
}

export async function getLossOverflowPageData(
  filters: LossOverflowFilters = {},
): Promise<{
  rows: LossOverflowRow[];
  warehouses: { id: string; name: string; code: string }[];
  analytics: LossOverflowAnalytics;
  reasonBreakdown: ReasonBreakdown[];
  trend: TrendPoint[];
  canEdit: boolean;
  canApprove: boolean;
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [rows, analytics, reasonBreakdown, trend, canEdit, canApprove, whRes] =
    await Promise.all([
      listLossOverflow(filters),
      getLossOverflowAnalytics(),
      getLossOverflowReasonBreakdown(90),
      getLossOverflowTrend(6),
      hasPermission(PERMISSIONS.COUNT_ADJUST),
      hasPermission(PERMISSIONS.COUNT_ADJUST),
      supabase
        .from("warehouses")
        .select("id, name, code")
        .eq("brand_id", brand)
        .eq("is_active", true)
        .order("code"),
    ]);

  return {
    rows,
    warehouses: whRes.data ?? [],
    analytics,
    reasonBreakdown,
    trend,
    canEdit,
    canApprove,
  };
}

export async function getLossOverflowById(
  id: string,
): Promise<LossOverflowRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("inventory_adjustments")
    .select(
      "id, brand_id, adj_no, warehouse_id, type, reason, total_amount, status, notes, approved_by, approved_at, posted_at, gl_posted, metadata, created_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: wh } = await supabase
    .from("warehouses")
    .select("name")
    .eq("id", data.warehouse_id)
    .maybeSingle();
  return decorate(data as Parameters<typeof decorate>[0], wh?.name ?? null);
}
