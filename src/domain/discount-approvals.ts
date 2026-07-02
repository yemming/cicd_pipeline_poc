import "server-only";

/**
 * Domain Helper — Discount Approvals（報價折扣超授權審核）
 *
 * 對應頁面：
 *   /admin/approvals/discount  — 主管審核佇列（RS_M5）
 *   /sales/manager/...         — 代理審核人設定（RS_M3）
 *   /sales/quote/[id]          — 業務員送審 + 倒數提示（輪5-2 / 輪5-5）
 *
 * 天條：UI 嚴禁 import @/lib/supabase；一律透過此 helper。
 * "use server" 不加在此處（純 import helper，不是 server action 檔）。
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import {
  calcDeadlineAt,
  type CreateDiscountApprovalInput,
  type DecideDiscountApprovalInput,
  type DiscountApprovalRow,
  type DiscountApprovalStatus,
  type DiscountApprovalBackupRow,
  type DiscountAuthorityResult,
  type ListDiscountApprovalsFilter,
  type UpsertBackupApproverInput,
} from "./discount-approvals.constants";

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Re-export types
export type {
  CreateDiscountApprovalInput,
  DecideDiscountApprovalInput,
  DiscountApprovalRow,
  DiscountApprovalStatus,
  DiscountApprovalBackupRow,
  DiscountAuthorityResult,
  ListDiscountApprovalsFilter,
  UpsertBackupApproverInput,
} from "./discount-approvals.constants";

export { calcDeadlineAt } from "./discount-approvals.constants";

export const DISCOUNT_APPROVALS_PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────
// Authority check — 讀 business_rules.discount_authority
// 折扣是否超授權（比例判斷：discount_amount / vehicle_amount）
// ─────────────────────────────────────────────────────────────

/**
 * 查此 brand 的 discount_authority 業務規則，判斷 discountPct 是否超過 SA 授權上限。
 * 套 max_overall_pct（整體%）。回傳 { within_authority, max_pct, approver_role_code }。
 *
 * 邏輯：取所有 is_active=true 規則中最保守（max_overall_pct 最低且非 null）的值為上限。
 * 若無任何規則 → within_authority=true（未設定=不限）。
 */
export async function checkDiscountAuthority(
  discountPct: number,
): Promise<DiscountAuthorityResult> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("business_rules")
    .select("config")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "discount_authority")
    .eq("is_active", true);

  if (error || !data || data.length === 0) {
    return { within_authority: true, max_pct: null };
  }

  // 從所有規則中找出有設定 max_overall_pct 的最低值（最嚴格 SA 上限）
  let minPct: number | null = null;
  let approverRoleCode: string | null = null;

  for (const row of data as Array<{ config: Record<string, unknown> }>) {
    const cfg = row.config as {
      max_overall_pct?: number | null;
      approver_role_code?: string | null;
    };
    if (typeof cfg.max_overall_pct === "number" && cfg.max_overall_pct >= 0) {
      if (minPct === null || cfg.max_overall_pct < minPct) {
        minPct = cfg.max_overall_pct;
        approverRoleCode = cfg.approver_role_code ?? null;
      }
    }
  }

  if (minPct === null) {
    return { within_authority: true, max_pct: null };
  }

  if (discountPct <= minPct) {
    return { within_authority: true, max_pct: minPct };
  }

  return {
    within_authority: false,
    max_pct: minPct,
    approver_role_code: approverRoleCode,
  };
}

// ─────────────────────────────────────────────────────────────
// List（主管審核佇列）
// ─────────────────────────────────────────────────────────────

export async function listDiscountApprovals(
  filter: ListDiscountApprovalsFilter = {},
): Promise<{ rows: DiscountApprovalRow[]; totalCount: number }> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.max(1, filter.pageSize ?? DISCOUNT_APPROVALS_PAGE_SIZE);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("discount_approval_requests")
    .select("*", { count: "exact" })
    .eq("brand_id", scope.brand_id);

  if (filter.status) q = q.eq("status", filter.status as DiscountApprovalStatus);
  if (filter.in_store_waiting === true) q = q.eq("in_store_waiting", true);
  if (filter.my_requests && userId) q = q.eq("requested_by", userId);

  // 佇列排序：in_store_waiting 優先（true 排前），再按 requested_at asc（FIFO）
  q = q
    .order("in_store_waiting", { ascending: false })
    .order("requested_at", { ascending: true })
    .range(from, to);

  const { data, error, count } = await q;
  if (error) {
    console.error("[discount-approvals] listDiscountApprovals failed:", error.message);
    return { rows: [], totalCount: 0 };
  }

  // 批次補充 joined 欄位：requester / approver / quote
  const rows = (data ?? []) as DiscountApprovalRow[];
  const quoteIds = rows.map((r) => r.quote_id).filter(Boolean) as string[];
  const userIds = Array.from(
    new Set([
      ...rows.map((r) => r.requested_by).filter(Boolean),
      ...rows.map((r) => r.approver_id).filter(Boolean),
      ...rows.map((r) => r.escalated_to).filter(Boolean),
    ] as string[]),
  );

  const [quotesRes, usersRes] = await Promise.all([
    quoteIds.length > 0
      ? supabase
          .from("sales_quotes")
          .select("id, quote_no, vehicle_model_name, vehicle_amount")
          .in("id", quoteIds)
      : Promise.resolve({ data: [] as Array<{
          id: string;
          quote_no: string;
          vehicle_model_name: string | null;
          vehicle_amount: number | null;
        }> }),
    userIds.length > 0
      ? supabase
          .from("employees")
          .select("user_id, name")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; name: string }> }),
  ]);

  const quoteMap = new Map(
    (quotesRes.data ?? []).map((q) => [q.id, q]),
  );
  const userMap = new Map(
    (usersRes.data ?? []).map((u) => [u.user_id, (u as { user_id: string; name: string }).name]),
  );

  return {
    rows: rows.map((r) => {
      const quote = r.quote_id ? quoteMap.get(r.quote_id) : undefined;
      return {
        ...r,
        discount_pct: r.discount_pct ? Number(r.discount_pct) : null,
        discount_amount: r.discount_amount ? Number(r.discount_amount) : null,
        requester_name: r.requested_by ? (userMap.get(r.requested_by) ?? null) : null,
        approver_name: r.approver_id ? (userMap.get(r.approver_id) ?? null) : null,
        escalated_to_name: r.escalated_to ? (userMap.get(r.escalated_to) ?? null) : null,
        quote_no: quote?.quote_no ?? null,
        vehicle_model_name: quote?.vehicle_model_name ?? null,
        vehicle_amount: quote?.vehicle_amount != null ? Number(quote.vehicle_amount) : null,
      };
    }),
    totalCount: count ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────
// Get by ID
// ─────────────────────────────────────────────────────────────

export async function getDiscountApprovalById(
  id: string,
): Promise<DiscountApprovalRow | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("discount_approval_requests")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as DiscountApprovalRow;

  // 補 quote + user joined
  const [quoteRes, usersRes] = await Promise.all([
    row.quote_id
      ? supabase
          .from("sales_quotes")
          .select("id, quote_no, vehicle_model_name, vehicle_amount")
          .eq("id", row.quote_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    (() => {
      const ids = [row.requested_by, row.approver_id, row.escalated_to].filter(
        Boolean,
      ) as string[];
      return ids.length > 0
        ? supabase.from("employees").select("user_id, name").in("user_id", ids)
        : Promise.resolve({ data: [] as Array<{ user_id: string; name: string }> });
    })(),
  ]);

  const uMap = new Map(
    (usersRes.data ?? []).map((u) => [
      (u as { user_id: string; name: string }).user_id,
      (u as { user_id: string; name: string }).name,
    ]),
  );

  const q = quoteRes.data as {
    id: string;
    quote_no: string;
    vehicle_model_name: string | null;
    vehicle_amount: number | null;
  } | null;

  return {
    ...row,
    discount_pct: row.discount_pct ? Number(row.discount_pct) : null,
    discount_amount: row.discount_amount ? Number(row.discount_amount) : null,
    requester_name: row.requested_by ? (uMap.get(row.requested_by) ?? null) : null,
    approver_name: row.approver_id ? (uMap.get(row.approver_id) ?? null) : null,
    escalated_to_name: row.escalated_to ? (uMap.get(row.escalated_to) ?? null) : null,
    quote_no: q?.quote_no ?? null,
    vehicle_model_name: q?.vehicle_model_name ?? null,
    vehicle_amount: q?.vehicle_amount != null ? Number(q.vehicle_amount) : null,
  };
}

// ─────────────────────────────────────────────────────────────
// 查某張報價單的最新 pending/escalated 申請
// ─────────────────────────────────────────────────────────────

export async function getPendingApprovalForQuote(
  quoteId: string,
): Promise<DiscountApprovalRow | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("discount_approval_requests")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("quote_id", quoteId)
    .in("status", ["pending", "escalated"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as DiscountApprovalRow;
  return {
    ...row,
    discount_pct: row.discount_pct ? Number(row.discount_pct) : null,
    discount_amount: row.discount_amount ? Number(row.discount_amount) : null,
  };
}

// ─────────────────────────────────────────────────────────────
// 查某張報價單「會擋轉成交」的最新申請（pending/escalated/rejected）
//
// 跟 getPendingApprovalForQuote 的差異：多納入 rejected —
// 主管駁回的超權限折扣從未被核准，若放行轉成交等於繞過折扣授權控管。
// 只給「轉成交」防護用；「避免重複送審」仍應用 getPendingApprovalForQuote
// （rejected 之後業務員要能修正折扣後送出新申請，不該被舊的 rejected 卡住）。
// ─────────────────────────────────────────────────────────────

export async function getBlockingApprovalForQuote(
  quoteId: string,
): Promise<DiscountApprovalRow | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("discount_approval_requests")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("quote_id", quoteId)
    .in("status", ["pending", "escalated", "rejected"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as DiscountApprovalRow;
  return {
    ...row,
    discount_pct: row.discount_pct ? Number(row.discount_pct) : null,
    discount_amount: row.discount_amount ? Number(row.discount_amount) : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Create（業務員送審）
// ─────────────────────────────────────────────────────────────

export async function createDiscountApproval(
  input: CreateDiscountApprovalInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 重複防護：此 quote 已有 pending/escalated 就不再新建
  const { data: existing } = await supabase
    .from("discount_approval_requests")
    .select("id, status")
    .eq("brand_id", scope.brand_id)
    .eq("quote_id", input.quote_id)
    .in("status", ["pending", "escalated"])
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: "此報價單已有進行中的審核申請，請勿重複送審" };
  }

  const deadlineAt = calcDeadlineAt(input.in_store_waiting);

  const { data, error } = await supabase
    .from("discount_approval_requests")
    .insert({
      brand_id: scope.brand_id,
      quote_id: input.quote_id,
      requested_by: user?.id ?? null,
      discount_pct: input.discount_pct,
      discount_amount: input.discount_amount,
      in_store_waiting: input.in_store_waiting,
      status: "pending",
      deadline_at: deadlineAt.toISOString(),
      metadata: {
        notes: input.notes ?? null,
        vehicle_amount: input.vehicle_amount ?? null,
        vehicle_model_name: input.vehicle_model_name ?? null,
      },
    })
    .select("id")
    .single();

  if (error) {
    return { ok: false, error: `送審失敗：${error.message}` };
  }

  revalidatePath("/admin/approvals/discount");
  revalidatePath(`/sales/quote/${input.quote_id}`);
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────────────────────
// Decide（主管 approve / reject）
// ─────────────────────────────────────────────────────────────

export async function decideDiscountApproval(
  id: string,
  input: DecideDiscountApprovalInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: current } = await supabase
    .from("discount_approval_requests")
    .select("status, quote_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (!current) return { ok: false, error: "找不到審核申請" };
  if (current.status !== "pending" && current.status !== "escalated") {
    return { ok: false, error: "此申請已決定，不可再次操作" };
  }

  const { error } = await supabase
    .from("discount_approval_requests")
    .update({
      status: input.decision,
      approver_id: user?.id ?? null,
      decided_at: new Date().toISOString(),
      decision_reason: input.reason ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `決定失敗：${error.message}` };

  revalidatePath("/admin/approvals/discount");
  if (current.quote_id) {
    revalidatePath(`/sales/quote/${current.quote_id}`);
  }
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Escalate（逾時升級到代理審核人）
// ─────────────────────────────────────────────────────────────

export async function escalateDiscountApproval(
  id: string,
  escalatedToUserId: string,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: current } = await supabase
    .from("discount_approval_requests")
    .select("status, quote_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (!current) return { ok: false, error: "找不到審核申請" };
  if (current.status !== "pending") {
    return { ok: false, error: "只有 pending 狀態才可升級" };
  }

  const { error } = await supabase
    .from("discount_approval_requests")
    .update({
      status: "escalated",
      escalated_to: escalatedToUserId,
      escalated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `升級失敗：${error.message}` };

  revalidatePath("/admin/approvals/discount");
  if (current.quote_id) {
    revalidatePath(`/sales/quote/${current.quote_id}`);
  }
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// Backup Approvers（代理審核人設定）
// ─────────────────────────────────────────────────────────────

export async function listBackupApprovers(): Promise<DiscountApprovalBackupRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("discount_approval_backups")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) return [];

  const rows = (data ?? []) as DiscountApprovalBackupRow[];
  const userIds = Array.from(
    new Set([
      ...rows.map((r) => r.manager_id),
      ...rows.map((r) => r.backup_approver_id),
    ]),
  );

  if (userIds.length === 0) return rows;

  const { data: employees } = await supabase
    .from("employees")
    .select("user_id, name")
    .in("user_id", userIds);

  const uMap = new Map(
    (employees ?? []).map((e) => [
      (e as { user_id: string; name: string }).user_id,
      (e as { user_id: string; name: string }).name,
    ]),
  );

  return rows.map((r) => ({
    ...r,
    manager_name: uMap.get(r.manager_id) ?? null,
    backup_name: uMap.get(r.backup_approver_id) ?? null,
  }));
}

export async function upsertBackupApprover(
  input: UpsertBackupApproverInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 先停用舊設定（同一 manager 只保留最新一筆）
  await supabase
    .from("discount_approval_backups")
    .update({ is_active: false })
    .eq("brand_id", scope.brand_id)
    .eq("manager_id", input.manager_id)
    .eq("is_active", true);

  const { data, error } = await supabase
    .from("discount_approval_backups")
    .insert({
      brand_id: scope.brand_id,
      manager_id: input.manager_id,
      backup_approver_id: input.backup_approver_id,
      is_active: true,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: `儲存失敗：${error.message}` };

  revalidatePath("/sales/manager");
  return { ok: true, data: { id: data.id } };
}

export async function removeBackupApprover(id: string): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { error } = await supabase
    .from("discount_approval_backups")
    .update({ is_active: false })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath("/sales/manager");
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// 員工清單（供代理審核設定頁下拉選單）
// ─────────────────────────────────────────────────────────────

export type EmployeeOption = {
  user_id: string;
  name: string;
  position: string | null;
};

/**
 * 撈當前 brand 有 user_id 的在職員工清單，供代理審核設定頁下拉選單用。
 */
export async function listEmployeesForBrand(): Promise<EmployeeOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data } = await supabase
    .from("employees")
    .select("user_id, name, position")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .not("user_id", "is", null)
    .order("name", { ascending: true });

  return (data ?? []).map((e) => ({
    user_id: e.user_id as string,
    name: (e as { user_id: string; name: string; position: string | null }).name,
    position: (e as { user_id: string; name: string; position: string | null }).position,
  }));
}

// ─────────────────────────────────────────────────────────────
// KPIs（佇列頁 badge 計數）
// ─────────────────────────────────────────────────────────────

export async function getDiscountApprovalQueueKpis(): Promise<{
  total_pending: number;
  in_store_waiting: number;
  overdue: number;
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const now = new Date().toISOString();

  const [totalRes, inStoreRes, overdueRes] = await Promise.all([
    supabase
      .from("discount_approval_requests")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .in("status", ["pending", "escalated"]),
    supabase
      .from("discount_approval_requests")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .eq("status", "pending")
      .eq("in_store_waiting", true),
    supabase
      .from("discount_approval_requests")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", scope.brand_id)
      .in("status", ["pending", "escalated"])
      .lt("deadline_at", now),
  ]);

  return {
    total_pending: totalRes.count ?? 0,
    in_store_waiting: inStoreRes.count ?? 0,
    overdue: overdueRes.count ?? 0,
  };
}
