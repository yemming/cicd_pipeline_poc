import "server-only";

/**
 * Domain Helper — Sales Quotes（賞車報價單）
 *
 * 對應頁面：/sales/quote（A 級升級，2026-05-20）
 * 對應 spec：RS04 賞車報價與成交訂單 v1（Tab 0 賞車報價單）
 *
 * UI 嚴禁直接 import @/lib/supabase；一律透過此 helper 讀寫。
 *
 * 業務流：
 *   客戶賞車 → RS 開報價單 (status='open') → 傳送給客戶 (status='sent')
 *                                          ├─ 客戶簽 → status='won' + 建 sales_order
 *                                          ├─ 客戶不買 → status='lost'
 *                                          └─ 超過 expires_at → status='expired'
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type {
  CreateSalesQuoteInput,
  ListSalesQuotesFilter,
  QuoteKpis,
  QuoteLine,
  QuoteStatus,
  Result,
  SalesQuoteDetail,
  SalesQuoteRow,
  UpdateSalesQuoteInput,
} from "./sales-quote.constants";

// ─────────────────────────────────────────────────────────────
// Re-export types for caller convenience
// ─────────────────────────────────────────────────────────────
export type {
  CreateSalesQuoteInput,
  ListSalesQuotesFilter,
  QuoteKpis,
  QuoteLine,
  QuoteStatus,
  Result,
  SalesQuoteDetail,
  SalesQuoteRow,
  UpdateSalesQuoteInput,
  VehicleKind,
} from "./sales-quote.constants";

export const QUOTES_PAGE_SIZE_DEFAULT = 50;

// ─────────────────────────────────────────────────────────────
// List
// ─────────────────────────────────────────────────────────────

export async function listSalesQuotes(
  filter: ListSalesQuotesFilter = {},
): Promise<{ rows: SalesQuoteRow[]; totalCount: number }> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.max(1, filter.pageSize ?? QUOTES_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("sales_quotes")
    .select(
      "id, brand_id, quote_no, vehicle_kind, status, customer_id, customer_name, customer_phone, rs_name, vehicle_model_id, vehicle_model_name, used_brand_model, vehicle_amount, addon_amount, discount_amount, total_amount, expires_at, sent_at, closed_at, estimated_delivery_date, converted_order_id, notes, created_at, updated_at",
      { count: "exact" },
    )
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filter.status) q = q.eq("status", filter.status);
  if (filter.vehicle_kind) q = q.eq("vehicle_kind", filter.vehicle_kind);
  if (filter.q) {
    const term = filter.q.replace(/[%_]/g, "");
    q = q.or(
      `quote_no.ilike.%${term}%,customer_name.ilike.%${term}%,vehicle_model_name.ilike.%${term}%`,
    );
  }

  const { data, error, count } = await q;
  if (error) {
    console.error("[sales-quote] listSalesQuotes failed:", error.message);
    return { rows: [], totalCount: 0 };
  }

  const rows: SalesQuoteRow[] = (data ?? []).map((r) => ({
    ...r,
    vehicle_amount: Number(r.vehicle_amount ?? 0),
    addon_amount: Number(r.addon_amount ?? 0),
    discount_amount: Number(r.discount_amount ?? 0),
    total_amount: Number(r.total_amount ?? 0),
  })) as SalesQuoteRow[];

  return { rows, totalCount: count ?? 0 };
}

// ─────────────────────────────────────────────────────────────
// Get by ID
// ─────────────────────────────────────────────────────────────

export async function getSalesQuoteById(
  id: string,
): Promise<SalesQuoteDetail | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("sales_quotes")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (error) {
    console.error("[sales-quote] getSalesQuoteById failed:", error.message);
    return null;
  }
  if (!data) return null;

  return {
    ...data,
    vehicle_amount: Number(data.vehicle_amount ?? 0),
    addon_amount: Number(data.addon_amount ?? 0),
    discount_amount: Number(data.discount_amount ?? 0),
    total_amount: Number(data.total_amount ?? 0),
    lines: (Array.isArray(data.lines) ? data.lines : []) as QuoteLine[],
    metadata: (data.metadata as Record<string, unknown>) ?? {},
  } as SalesQuoteDetail;
}

// ─────────────────────────────────────────────────────────────
// KPI
// ─────────────────────────────────────────────────────────────

export async function getQuoteKpis(): Promise<QuoteKpis> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
    .toISOString()
    .slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);
  const in30 = new Date(today);
  in30.setDate(in30.getDate() + 30);
  const in30Str = in30.toISOString().slice(0, 10);

  const [monthlyRes, pendingRes, expiringRes, wonRes, closedRes] =
    await Promise.all([
      // 本月開立
      supabase
        .from("sales_quotes")
        .select("total_amount", { count: "exact" })
        .eq("brand_id", scope.brand_id)
        .gte("created_at", `${monthStart}T00:00:00Z`)
        .lte("created_at", `${monthEnd}T23:59:59Z`),
      // 待簽約：open / sent
      supabase
        .from("sales_quotes")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .in("status", ["open", "sent"]),
      // 30 天內過期（且仍未成交）
      supabase
        .from("sales_quotes")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .in("status", ["open", "sent"])
        .gte("expires_at", todayStr)
        .lte("expires_at", in30Str),
      // 本月成交
      supabase
        .from("sales_quotes")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .eq("status", "won")
        .gte("updated_at", `${monthStart}T00:00:00Z`)
        .lte("updated_at", `${monthEnd}T23:59:59Z`),
      // 本月關案總數（won + lost + expired）
      supabase
        .from("sales_quotes")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .in("status", ["won", "lost", "expired"])
        .gte("updated_at", `${monthStart}T00:00:00Z`)
        .lte("updated_at", `${monthEnd}T23:59:59Z`),
    ]);

  const monthlyRows = (monthlyRes.data ?? []) as Array<{ total_amount: number | null }>;
  const monthlyAmount = monthlyRows.reduce(
    (sum, r) => sum + (Number(r.total_amount) || 0),
    0,
  );
  const wonCount = wonRes.count ?? 0;
  const closedCount = closedRes.count ?? 0;
  const conversionRate =
    closedCount > 0 ? Math.round((wonCount / closedCount) * 100) : 0;

  return {
    monthly_count: monthlyRes.count ?? 0,
    monthly_amount: monthlyAmount,
    pending_count: pendingRes.count ?? 0,
    expiring_30_days: expiringRes.count ?? 0,
    conversion_rate_pct: conversionRate,
  };
}

// ─────────────────────────────────────────────────────────────
// Status breakdown — for funnel / chart
// ─────────────────────────────────────────────────────────────

export type QuoteStatusBreakdown = {
  status: QuoteStatus;
  count: number;
};

export async function getQuoteStatusBreakdown(): Promise<QuoteStatusBreakdown[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("sales_quotes")
    .select("status")
    .eq("brand_id", scope.brand_id);

  if (error) {
    console.error("[sales-quote] getQuoteStatusBreakdown failed:", error.message);
    return [];
  }

  const counts = new Map<QuoteStatus, number>();
  for (const r of data ?? []) {
    const s = r.status as QuoteStatus;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return (
    ["open", "sent", "won", "lost", "expired"] as QuoteStatus[]
  ).map((s) => ({ status: s, count: counts.get(s) ?? 0 }));
}

// ─────────────────────────────────────────────────────────────
// Generate quote number
// ─────────────────────────────────────────────────────────────

async function genQuoteNo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
): Promise<string> {
  const d = new Date();
  const dateStr =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0");
  const pattern = `Q-${dateStr}-%`;

  const { data: last } = await supabase
    .from("sales_quotes")
    .select("quote_no")
    .eq("brand_id", brandId)
    .like("quote_no", pattern)
    .order("quote_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  let seq = 1;
  if (last?.quote_no) {
    const m = last.quote_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  return `Q-${dateStr}-${String(seq).padStart(3, "0")}`;
}

// ─────────────────────────────────────────────────────────────
// Create
// ─────────────────────────────────────────────────────────────

export async function createSalesQuote(
  input: CreateSalesQuoteInput,
): Promise<Result<{ id: string; quote_no: string }>> {
  if (!input.vehicle_kind) {
    return { ok: false, error: "請選擇車輛類型（新車 / 中古車）" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const quote_no = await genQuoteNo(supabase, scope.brand_id);

  // 預設有效期 14 天
  const expiresAt =
    input.expires_at ??
    new Date(Date.now() + 14 * 86400 * 1000).toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("sales_quotes")
    .insert({
      brand_id: scope.brand_id,
      quote_no,
      vehicle_kind: input.vehicle_kind,
      status: "open",
      customer_id: input.customer_id ?? null,
      customer_name: input.customer_name ?? null,
      customer_phone: input.customer_phone ?? null,
      rs_name: input.rs_name ?? null,
      vehicle_model_id: input.vehicle_model_id ?? null,
      vehicle_model_name: input.vehicle_model_name ?? null,
      used_brand_model: input.used_brand_model ?? null,
      vehicle_amount: input.vehicle_amount ?? 0,
      addon_amount: input.addon_amount ?? 0,
      discount_amount: input.discount_amount ?? 0,
      total_amount: input.total_amount ?? 0,
      lines: input.lines ?? [],
      expires_at: expiresAt,
      estimated_delivery_date: input.estimated_delivery_date ?? null,
      notes: input.notes ?? null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "報價單號重複，請重試" };
    }
    return { ok: false, error: `建立失敗：${error.message}` };
  }

  revalidatePath("/sales/quote");
  return { ok: true, data: { id: data.id, quote_no } };
}

// ─────────────────────────────────────────────────────────────
// Update
// ─────────────────────────────────────────────────────────────

export async function updateSalesQuote(
  id: string,
  patch: UpdateSalesQuoteInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_quotes")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到報價單" };
  if (current.status === "won" || current.status === "lost") {
    return { ok: false, error: "已關案的報價單不可修改" };
  }

  const { error } = await supabase
    .from("sales_quotes")
    .update({ ...patch, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  revalidatePath("/sales/quote");
  revalidatePath(`/sales/quote/${id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Set status
// ─────────────────────────────────────────────────────────────

export async function setSalesQuoteStatus(
  id: string,
  status: QuoteStatus,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("sales_quotes")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到報價單" };

  const extra: Record<string, unknown> = {};
  const nowIso = new Date().toISOString();
  if (status === "sent") extra.sent_at = nowIso;
  if (status === "won" || status === "lost" || status === "expired")
    extra.closed_at = nowIso;

  const { error } = await supabase
    .from("sales_quotes")
    .update({ status, ...extra, updated_by: user?.id ?? null })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `狀態更新失敗：${error.message}` };

  revalidatePath("/sales/quote");
  revalidatePath(`/sales/quote/${id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Delete
// ─────────────────────────────────────────────────────────────

export async function deleteSalesQuote(
  id: string,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: current } = await supabase
    .from("sales_quotes")
    .select("status")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (!current) return { ok: false, error: "找不到報價單" };
  if (current.status === "won") {
    return { ok: false, error: "已成交的報價單不可刪除" };
  }

  const { error } = await supabase
    .from("sales_quotes")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `刪除失敗：${error.message}` };

  revalidatePath("/sales/quote");
  return { ok: true, data: { id } };
}
