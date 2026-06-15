"use server";

/**
 * Domain Helper — RP4 Layer1 通用稽核日誌（audit_logs）
 *
 * - writeAuditLog：寫入 audit_logs（用 createServiceClient bypass RLS，因 RLS 僅 admin SELECT）
 * - listAuditLogs：撈稽核日誌（加 brand / table / date 過濾 + 分頁）
 *
 * 呼叫規則：
 *   writeAuditLog 只能在 "use server" 環境呼叫（server action / route handler）。
 *   建議包在 after() 非阻塞呼叫，不影響主流程 latency。
 *
 * 典型使用：
 *   import { after } from "next/server";
 *   import { writeAuditLog } from "@/domain/audit-logs";
 *
 *   after(async () => {
 *     await writeAuditLog({
 *       table_name: "repair_orders",
 *       record_id: roId,
 *       action: "status_changed",
 *       actor_id: actorId,
 *       brand_id: brandId,
 *       before: { status: "維修中" },
 *       after: { status: "待結帳" },
 *     });
 *   });
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveScope } from "@/lib/scope/active-scope";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { AUDIT_LOG_PAGE_SIZE as _PAGE_SIZE } from "@/domain/audit-logs.constants";

// ─────────────────────────────────────────────────
// 型別
// ─────────────────────────────────────────────────

export type AuditLogInput = {
  /** DB 表名（例：repair_orders / ro_checkouts / repair_order_addons） */
  table_name: string;
  /** 被操作的 record id（uuid 或可識別字串） */
  record_id?: string | null;
  /** 動作描述（例：status_changed / discount_applied / sig_cleared / approval_decided） */
  action: string;
  /** 操作人 auth.uid()；由 caller 帶入（已從 server context 取） */
  actor_id?: string | null;
  /** 品牌（來自 getActiveScope() 或 caller 傳入） */
  brand_id?: string | null;
  /** 操作前快照（jsonb） */
  before?: Record<string, unknown> | null;
  /** 操作後快照（jsonb） */
  after?: Record<string, unknown> | null;
};

export type AuditLogRow = {
  id: number;
  table_name: string;
  record_id: string | null;
  action: string;
  actor_id: string | null;
  /** JOIN profiles 取出的顯示名稱，fallback 到 UUID 前 8 碼 */
  actor_name?: string | null;
  brand_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

export type AuditLogListFilters = {
  brand_id?: string;
  table_name?: string;
  action?: string;
  record_id?: string;
  actor_id?: string;
  /** 跨欄關鍵字（同時比對 record_id / actor_id ilike） */
  keyword?: string;
  date_from?: string;
  date_to?: string;
};

// ─────────────────────────────────────────────────
// WRITE（service client bypass RLS）
// ─────────────────────────────────────────────────

/**
 * writeAuditLog — INSERT 一筆稽核紀錄到 audit_logs 表。
 *
 * - 走 createServiceClient（bypass RLS，因為 RLS 只允許 admin SELECT，寫入用 service role）
 * - 失敗靜默記 console.error，不影響主流程
 * - 建議在 after() 非阻塞呼叫
 */
export async function writeAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const svc = createServiceClient();
    const { error } = await svc.from("audit_logs").insert({
      table_name: input.table_name,
      record_id: input.record_id ?? null,
      action: input.action,
      actor_id: input.actor_id ?? null,
      brand_id: input.brand_id ?? null,
      before: (input.before ?? null) as Record<string, unknown> | null,
      after: (input.after ?? null) as Record<string, unknown> | null,
    });
    if (error) {
      console.error("[writeAuditLog] INSERT 失敗", error.message, { input });
    }
  } catch (e) {
    console.error("[writeAuditLog] 例外（不影響主流程）", e);
  }
}

// ─────────────────────────────────────────────────
// READ（一般 server client，RLS 只允許 admin SELECT）
// ─────────────────────────────────────────────────

/**
 * listAuditLogs — 撈稽核日誌（分頁、多維度過濾）。
 *
 * 呼叫端需持有對應權限（AUDIT_AFTERSALES_VIEW / AUDIT_INVENTORY_VIEW / AUDIT_GROUP_VIEW）。
 * 讀取用一般 server client（admin 身份符合 RLS SELECT 政策）。
 *
 * @param filters  多維度過濾
 * @param page     頁碼（1-based），預設 1
 * @param pageSize 每頁筆數，預設 50
 */
export async function listAuditLogs(
  filters: AuditLogListFilters = {},
  page = 1,
  pageSize = _PAGE_SIZE,
): Promise<{ rows: AuditLogRow[]; totalCount: number }> {
  const supabase = await createClient();

  const from = (Math.max(1, page) - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("audit_logs")
    .select("id, table_name, record_id, action, actor_id, brand_id, before, after, created_at", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.brand_id && filters.brand_id !== "all") {
    q = q.eq("brand_id", filters.brand_id);
  }
  if (filters.table_name && filters.table_name !== "all") {
    q = q.eq("table_name", filters.table_name);
  }
  if (filters.action && filters.action !== "all") {
    q = q.eq("action", filters.action);
  }
  if (filters.record_id?.trim()) {
    q = q.ilike("record_id", `%${filters.record_id.trim()}%`);
  }
  if (filters.actor_id?.trim()) {
    q = q.ilike("actor_id", `%${filters.actor_id.trim()}%`);
  }
  if (filters.keyword?.trim()) {
    // 跨欄關鍵字搜尋：record_id 或 actor_id 含關鍵字
    const kw = `%${filters.keyword.trim()}%`;
    q = q.or(`record_id.ilike.${kw},actor_id.ilike.${kw}`);
  }
  if (filters.date_from) {
    q = q.gte("created_at", `${filters.date_from}T00:00:00+08:00`);
  }
  if (filters.date_to) {
    q = q.lte("created_at", `${filters.date_to}T23:59:59+08:00`);
  }

  const { data, count, error } = await q;
  if (error) {
    console.error("[listAuditLogs] query 失敗", error.message);
    return { rows: [], totalCount: 0 };
  }

  const rawRows = (data ?? []) as AuditLogRow[];

  // 批次撈 actor 顯示名稱
  const actorIds = [...new Set(rawRows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const actorNameMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, name")
      .in("id", actorIds);
    for (const p of profiles ?? []) {
      const raw = p as { id: string; display_name?: string | null; name?: string | null };
      actorNameMap.set(raw.id, raw.display_name ?? raw.name ?? raw.id.slice(0, 8));
    }
  }

  const rows: AuditLogRow[] = rawRows.map((r) => ({
    ...r,
    actor_name: r.actor_id ? (actorNameMap.get(r.actor_id) ?? r.actor_id.slice(0, 8)) : null,
  }));

  return { rows, totalCount: count ?? 0 };
}

// ─────────────────────────────────────────────────
// 售後稽核：限定在 aftersales 相關表 + repair_order_events 混合
// ─────────────────────────────────────────────────

const AFTERSALES_TABLES = [
  "repair_orders",
  "ro_checkouts",
  "repair_order_addons",
  "repair_order_lines",
  "final_inspections",
];

export type AftersalesAuditRow = {
  id: string; // "AL-{number}" 或 "EV-{number}"（混合顯示用）
  source: "audit_log" | "ro_event";
  table_name: string;
  record_id: string | null;
  action: string;
  actor_id: string | null;
  /** JOIN profiles 取出的顯示名稱，fallback 到 UUID 前 8 碼 */
  actor_name: string | null;
  brand_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

/**
 * listAftersalesAudit — 售後稽核日誌（audit_logs 限定 aftersales 表 + repair_order_events 合併）
 *
 * 呼叫端需持有 AUDIT_AFTERSALES_VIEW 權限。
 */
export async function listAftersalesAudit(
  filters: AuditLogListFilters = {},
  page = 1,
  pageSize = _PAGE_SIZE,
): Promise<{ rows: AftersalesAuditRow[]; totalCount: number }> {
  await requirePermission(PERMISSIONS.AUDIT_AFTERSALES_VIEW);

  const scope = await getActiveScope();
  const brandId = filters.brand_id && filters.brand_id !== "all" ? filters.brand_id : scope.brand_id;

  // 並行撈 audit_logs（aftersales 表限定）＋ repair_order_events
  const supabase = await createClient();

  const from = (Math.max(1, page) - 1) * pageSize;
  const to = from + pageSize - 1;

  let alQ = supabase
    .from("audit_logs")
    .select("id, table_name, record_id, action, actor_id, brand_id, before, after, created_at", {
      count: "exact",
    })
    .in("table_name", AFTERSALES_TABLES)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (filters.table_name && filters.table_name !== "all") {
    alQ = alQ.eq("table_name", filters.table_name);
  }
  if (filters.action && filters.action !== "all") {
    alQ = alQ.eq("action", filters.action);
  }
  if (filters.record_id?.trim()) {
    alQ = alQ.ilike("record_id", `%${filters.record_id.trim()}%`);
  }
  if (filters.date_from) {
    alQ = alQ.gte("created_at", `${filters.date_from}T00:00:00+08:00`);
  }
  if (filters.date_to) {
    alQ = alQ.lte("created_at", `${filters.date_to}T23:59:59+08:00`);
  }

  let evQ = supabase
    .from("repair_order_events")
    .select("id, ro_id, action, actor_id, brand_id, payload, occurred_at")
    .eq("brand_id", brandId)
    .order("occurred_at", { ascending: false });

  if (filters.action && filters.action !== "all") {
    evQ = evQ.eq("action", filters.action);
  }
  if (filters.record_id?.trim()) {
    evQ = evQ.ilike("ro_id", `%${filters.record_id.trim()}%`);
  }
  if (filters.date_from) {
    evQ = evQ.gte("occurred_at", `${filters.date_from}T00:00:00+08:00`);
  }
  if (filters.date_to) {
    evQ = evQ.lte("occurred_at", `${filters.date_to}T23:59:59+08:00`);
  }

  const [alRes, evRes] = await Promise.all([alQ, evQ]);

  const alRows: Omit<AftersalesAuditRow, "actor_name">[] = ((alRes.data ?? []) as {
    id: number;
    table_name: string;
    record_id: string | null;
    action: string;
    actor_id: string | null;
    brand_id: string | null;
    before: Record<string, unknown> | null;
    after: Record<string, unknown> | null;
    created_at: string;
  }[]).map((r) => ({
    id: `AL-${r.id}`,
    source: "audit_log" as const,
    table_name: r.table_name,
    record_id: r.record_id,
    action: r.action,
    actor_id: r.actor_id,
    brand_id: r.brand_id,
    before: r.before,
    after: r.after,
    created_at: r.created_at,
  }));

  const evRows: Omit<AftersalesAuditRow, "actor_name">[] = ((evRes.data ?? []) as {
    id: number;
    ro_id: string;
    action: string;
    actor_id: string | null;
    brand_id: string | null;
    payload: Record<string, unknown> | null;
    occurred_at: string;
  }[]).map((r) => ({
    id: `EV-${r.id}`,
    source: "ro_event" as const,
    table_name: "repair_order_events",
    record_id: r.ro_id,
    action: r.action,
    actor_id: r.actor_id,
    brand_id: r.brand_id,
    before: null,
    after: (r.payload ?? null) as Record<string, unknown> | null,
    created_at: r.occurred_at,
  }));

  // 合併、依時間降序、分頁
  const merged = [...alRows, ...evRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const totalCount = merged.length;
  const pagedRows = merged.slice(from, to + 1);

  // 批次撈 actor 顯示名稱（去重後查 profiles）
  const actorIds = [...new Set(pagedRows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const actorNameMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, name")
      .in("id", actorIds);
    for (const p of profiles ?? []) {
      const raw = p as { id: string; display_name?: string | null; name?: string | null };
      actorNameMap.set(raw.id, raw.display_name ?? raw.name ?? raw.id.slice(0, 8));
    }
  }

  const rows: AftersalesAuditRow[] = pagedRows.map((r) => ({
    ...r,
    actor_name: r.actor_id ? (actorNameMap.get(r.actor_id) ?? r.actor_id.slice(0, 8)) : null,
  }));

  return { rows, totalCount };
}

/**
 * listInventoryAudit — 庫存稽核日誌（倉管相關表）
 *
 * 呼叫端需持有 AUDIT_INVENTORY_VIEW 權限。
 */
export async function listInventoryAudit(
  filters: AuditLogListFilters = {},
  page = 1,
  pageSize = _PAGE_SIZE,
): Promise<{ rows: AuditLogRow[]; totalCount: number }> {
  await requirePermission(PERMISSIONS.AUDIT_INVENTORY_VIEW);
  const scope = await getActiveScope();
  const brandId = filters.brand_id && filters.brand_id !== "all" ? filters.brand_id : scope.brand_id;
  return listAuditLogs({ ...filters, brand_id: brandId }, page, pageSize);
}

/**
 * listGroupAudit — 集團稽核日誌（全品牌，不綁 scope）
 *
 * 呼叫端需持有 AUDIT_GROUP_VIEW 權限。
 */
export async function listGroupAudit(
  filters: AuditLogListFilters = {},
  page = 1,
  pageSize = _PAGE_SIZE,
): Promise<{ rows: AuditLogRow[]; totalCount: number }> {
  await requirePermission(PERMISSIONS.AUDIT_GROUP_VIEW);
  // 集團稽核不強制套 brand scope（可跨 brand 查）
  return listAuditLogs(filters, page, pageSize);
}

// ─────────────────────────────────────────────────
// 售後稽核：本月主管授權統計
// ─────────────────────────────────────────────────

export type MonthlyApprovalRow = {
  id: string;
  action: string;
  record_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  /** 授權結果：approved / rejected */
  result: "approved" | "rejected";
  /** 相關說明（from after JSON） */
  note: string | null;
  created_at: string;
};

/**
 * listMonthlyApprovals — 撈本月主管授權記錄
 *
 * 呼叫端需持有 AUDIT_AFTERSALES_VIEW 權限。
 * @param brandId  品牌 ID
 * @param yearMonth 格式 "YYYY-MM"，不傳則取當月
 */
export async function listMonthlyApprovals(
  brandId: string,
  yearMonth?: string,
): Promise<MonthlyApprovalRow[]> {
  await requirePermission(PERMISSIONS.AUDIT_AFTERSALES_VIEW);
  const supabase = await createClient();

  // 計算本月範圍（Asia/Taipei）
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const ym = yearMonth ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dateFrom = `${ym}-01T00:00:00+08:00`;
  // 下個月第一天
  const [y, m] = ym.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const dateTo = `${nextMonth}-01T00:00:00+08:00`;

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, record_id, actor_id, after, created_at")
    .eq("brand_id", brandId)
    .in("action", ["approval_approved", "approval_rejected"])
    .gte("created_at", dateFrom)
    .lt("created_at", dateTo)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listMonthlyApprovals] query 失敗", error.message);
    return [];
  }

  // 批次撈 actor 名稱
  const rows = (data ?? []) as {
    id: number;
    action: string;
    record_id: string | null;
    actor_id: string | null;
    after: Record<string, unknown> | null;
    created_at: string;
  }[];

  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const actorNameMap = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, name")
      .in("id", actorIds);
    for (const p of profiles ?? []) {
      const raw = p as { id: string; display_name?: string | null; name?: string | null };
      actorNameMap.set(raw.id, raw.display_name ?? raw.name ?? raw.id.slice(0, 8));
    }
  }

  return rows.map((r) => ({
    id: String(r.id),
    action: r.action,
    record_id: r.record_id,
    actor_id: r.actor_id,
    actor_name: r.actor_id ? (actorNameMap.get(r.actor_id) ?? r.actor_id.slice(0, 8)) : null,
    result: r.action === "approval_approved" ? "approved" : "rejected",
    note: (r.after?.note as string) ?? (r.after?.reason as string) ?? null,
    created_at: r.created_at,
  }));
}

// ─────────────────────────────────────────────────
// 售後稽核：本週損耗核銷記錄
// ─────────────────────────────────────────────────

export type WeeklyWriteoffRow = {
  id: string;
  record_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  item_name: string | null;
  item_code: string | null;
  qty: number | null;
  reason: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  created_at: string;
};

/**
 * listWeeklyWriteoffs — 撈本週損耗核銷記錄（audit_logs action=addon_cancelled + write_off）
 *
 * 呼叫端需持有 AUDIT_AFTERSALES_VIEW 權限。
 */
export async function listWeeklyWriteoffs(brandId: string): Promise<WeeklyWriteoffRow[]> {
  await requirePermission(PERMISSIONS.AUDIT_AFTERSALES_VIEW);
  const supabase = await createClient();

  // 計算本週一 0:00 至本週日 23:59（Asia/Taipei）
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const dayOfWeek = now.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const dateFrom = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}T00:00:00+08:00`;

  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, record_id, actor_id, after, created_at")
    .eq("brand_id", brandId)
    .in("action", ["addon_cancelled", "write_off", "loss_writeoff"])
    .gte("created_at", dateFrom)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[listWeeklyWriteoffs] query 失敗", error.message);
    return [];
  }

  const rows = (data ?? []) as {
    id: number;
    action: string;
    record_id: string | null;
    actor_id: string | null;
    after: Record<string, unknown> | null;
    created_at: string;
  }[];

  // 批次撈 actor 名稱（SA 確認者）及 approved_by 名稱（主管授權者）
  const allActorIds = [
    ...new Set([
      ...rows.map((r) => r.actor_id).filter(Boolean),
      ...rows.map((r) => r.after?.approved_by as string).filter(Boolean),
    ]),
  ] as string[];
  const actorNameMap = new Map<string, string>();
  if (allActorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, name")
      .in("id", allActorIds);
    for (const p of profiles ?? []) {
      const raw = p as { id: string; display_name?: string | null; name?: string | null };
      actorNameMap.set(raw.id, raw.display_name ?? raw.name ?? raw.id.slice(0, 8));
    }
  }

  return rows.map((r) => {
    const af = r.after ?? {};
    const approvedById = af.approved_by as string | null;
    return {
      id: String(r.id),
      record_id: r.record_id,
      actor_id: r.actor_id,
      actor_name: r.actor_id ? (actorNameMap.get(r.actor_id) ?? r.actor_id.slice(0, 8)) : null,
      item_name: (af.item_name as string) ?? (af.part_name as string) ?? null,
      item_code: (af.item_code as string) ?? (af.part_no as string) ?? null,
      qty: typeof af.qty === "number" ? af.qty : typeof af.quantity === "number" ? af.quantity : null,
      reason: (af.reason as string) ?? (af.note as string) ?? null,
      approved_by: approvedById,
      approved_by_name: approvedById ? (actorNameMap.get(approvedById) ?? approvedById.slice(0, 8)) : null,
      created_at: r.created_at,
    };
  });
}

// ─────────────────────────────────────────────────
// 庫存稽核：本月統計 KPI
// ─────────────────────────────────────────────────

export type InventoryAuditStats = {
  stock_in: number;
  stock_out: number;
  return_stock: number;
  write_off: number;
};

/**
 * listInventoryAuditStats — 本月庫存稽核各事件類型筆數統計
 *
 * 呼叫端需持有 AUDIT_INVENTORY_VIEW 權限。
 */
export async function listInventoryAuditStats(brandId: string): Promise<InventoryAuditStats> {
  await requirePermission(PERMISSIONS.AUDIT_INVENTORY_VIEW);
  const supabase = await createClient();

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dateFrom = `${ym}-01T00:00:00+08:00`;
  const [y, m] = ym.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const dateTo = `${nextMonth}-01T00:00:00+08:00`;

  const { data, error } = await supabase
    .from("audit_logs")
    .select("action")
    .eq("brand_id", brandId)
    .gte("created_at", dateFrom)
    .lt("created_at", dateTo);

  if (error) {
    console.error("[listInventoryAuditStats] query 失敗", error.message);
    return { stock_in: 0, stock_out: 0, return_stock: 0, write_off: 0 };
  }

  const stats: InventoryAuditStats = { stock_in: 0, stock_out: 0, return_stock: 0, write_off: 0 };
  for (const r of data ?? []) {
    const action = (r as { action: string }).action;
    if (action.includes("stock_in") || action.includes("received") || action.includes("receipt"))
      stats.stock_in++;
    else if (action.includes("stock_out") || action.includes("issue") || action.includes("issued"))
      stats.stock_out++;
    else if (action.includes("return") || action.includes("return_stock"))
      stats.return_stock++;
    else if (action.includes("write_off") || action.includes("addon_cancelled") || action.includes("loss"))
      stats.write_off++;
  }
  return stats;
}

// ─────────────────────────────────────────────────
// 集團稽核：跨門店異常統計（本月）
// ─────────────────────────────────────────────────

export type GroupAnomalySummaryRow = {
  brand_id: string;
  /** 主管授權次數 */
  approval_count: number;
  /** 損耗核銷次數 */
  writeoff_count: number;
  /** 費用爭議次數 */
  dispute_count: number;
  /** 投訴件數 */
  complaint_count: number;
  /** 異常等級：normal / warning / critical */
  anomaly_level: "normal" | "warning" | "critical";
};

/**
 * listGroupAnomalySummary — 集團本月各品牌異常統計
 *
 * 呼叫端需持有 AUDIT_GROUP_VIEW 權限。
 */
export async function listGroupAnomalySummary(): Promise<GroupAnomalySummaryRow[]> {
  await requirePermission(PERMISSIONS.AUDIT_GROUP_VIEW);
  const supabase = await createClient();

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dateFrom = `${ym}-01T00:00:00+08:00`;
  const [y, m] = ym.split("-").map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
  const dateTo = `${nextMonth}-01T00:00:00+08:00`;

  const { data, error } = await supabase
    .from("audit_logs")
    .select("brand_id, action")
    .gte("created_at", dateFrom)
    .lt("created_at", dateTo)
    .not("brand_id", "is", null);

  if (error) {
    console.error("[listGroupAnomalySummary] query 失敗", error.message);
    return [];
  }

  // 按 brand_id 分組統計
  const brandMap = new Map<
    string,
    { approval_count: number; writeoff_count: number; dispute_count: number; complaint_count: number }
  >();

  for (const r of data ?? []) {
    const row = r as { brand_id: string; action: string };
    const key = row.brand_id;
    if (!brandMap.has(key)) {
      brandMap.set(key, { approval_count: 0, writeoff_count: 0, dispute_count: 0, complaint_count: 0 });
    }
    const counts = brandMap.get(key)!;
    const action = row.action;
    if (action.includes("approval")) counts.approval_count++;
    else if (action.includes("write_off") || action.includes("loss") || action.includes("addon_cancelled"))
      counts.writeoff_count++;
    else if (action.includes("dispute") || action.includes("discount")) counts.dispute_count++;
    else if (action.includes("complaint")) counts.complaint_count++;
  }

  return Array.from(brandMap.entries()).map(([brand_id, counts]) => {
    const total = counts.approval_count + counts.writeoff_count + counts.dispute_count + counts.complaint_count;
    const anomaly_level: "normal" | "warning" | "critical" =
      total >= 20 ? "critical" : total >= 5 ? "warning" : "normal";
    return { brand_id, ...counts, anomaly_level };
  });
}

// ─────────────────────────────────────────────────
// 集團稽核：動態品牌清單
// ─────────────────────────────────────────────────

export type AuditBrandOption = {
  value: string;
  label: string;
};

/**
 * listBrandsForAudit — 撈所有品牌清單供集團稽核篩選用
 *
 * 呼叫端需持有 AUDIT_GROUP_VIEW 權限。
 */
export async function listBrandsForAudit(): Promise<AuditBrandOption[]> {
  await requirePermission(PERMISSIONS.AUDIT_GROUP_VIEW);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("brands")
    .select("id, name")
    .order("id");
  if (error) {
    console.error("[listBrandsForAudit] query 失敗", error.message);
    return [];
  }
  return (data ?? []).map((b) => {
    const raw = b as { id: string; name: string };
    return { value: raw.id, label: raw.name };
  });
}
