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
    q = q.ilike("action", `%${filters.action}%`);
  }
  if (filters.record_id?.trim()) {
    q = q.eq("record_id", filters.record_id.trim());
  }
  if (filters.actor_id?.trim()) {
    q = q.eq("actor_id", filters.actor_id.trim());
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

  return {
    rows: (data ?? []) as AuditLogRow[],
    totalCount: count ?? 0,
  };
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
    alQ = alQ.ilike("action", `%${filters.action}%`);
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
    evQ = evQ.ilike("action", `%${filters.action}%`);
  }
  if (filters.date_from) {
    evQ = evQ.gte("occurred_at", `${filters.date_from}T00:00:00+08:00`);
  }
  if (filters.date_to) {
    evQ = evQ.lte("occurred_at", `${filters.date_to}T23:59:59+08:00`);
  }

  const [alRes, evRes] = await Promise.all([alQ, evQ]);

  const alRows: AftersalesAuditRow[] = ((alRes.data ?? []) as {
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

  const evRows: AftersalesAuditRow[] = ((evRes.data ?? []) as {
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

  return { rows: pagedRows, totalCount };
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
