import "server-only";

/**
 * Domain Helper — Discount Approvals（成交折扣超授權審核，RS04）
 *
 * 對應頁面：
 *   /admin/approvals/discount  — 主管審核佇列（RS_M5）
 *   /sales/manager/...         — 折扣門檻 + 代理審核人設定（RS_M3）
 *   /sales/orders/[id]         — 業務員建單觸發審核 + 反價回覆 + 主動取消（RS04）
 *
 * RS04（2026-07-03 Russell 裁示）業務原則：
 *   報價階段完全不涉及折扣；業務員建立銷售訂單（輸入實際成交金額）才是
 *   折扣審核唯一觸發點。checkSalesDiscountAuthority() 角色感知（業務員 vs 店長），
 *   讀 business_rules.rule_kind='discount_authority' 依 scope_role_code 分流。
 *
 * 天條：UI 嚴禁 import @/lib/supabase；一律透過此 helper。
 * "use server" 不加在此處（純 import helper，不是 server action 檔）。
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getCurrentUserDepartment } from "@/lib/rbac/department";
import { writeAuditLog } from "@/domain/audit-logs";

import {
  calcDeadlineAt,
  calcCounterOfferDeadlineAt,
  DEADLINE_MINUTES_IN_STORE,
  DEADLINE_MINUTES_NORMAL,
  COUNTER_OFFER_TIMEOUT_HOURS_DEFAULT,
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

export { calcDeadlineAt, calcCounterOfferDeadlineAt } from "./discount-approvals.constants";

export const DISCOUNT_APPROVALS_PAGE_SIZE = 50;

// ─────────────────────────────────────────────────────────────
// Authority check — 角色感知，讀 business_rules.discount_authority
// ─────────────────────────────────────────────────────────────

type DiscountAuthorityConfig = {
  max_overall_pct?: number | null;
  approver_role_code?: string | null;
  role_label?: string | null;
};

/**
 * 判斷 discountPct 是否在呼叫者授權範圍內，角色感知（業務員 sales_consultant / 店長 rs_manager）。
 *
 * 演算法（兩層授權）：
 *   1. 用 getCurrentUserDepartment() 找出呼叫者的 role_codes，取其中有對應
 *      discount_authority 規則、且 max_overall_pct 最寬鬆（最大）的一筆當「自己這層」上限。
 *      呼叫者不只一個角色時取最寬鬆值，避免多角色帳號被最嚴格規則誤擋。
 *   2. discountPct 在自己上限內 → situation A（直接放行）
 *   3. 超過自己上限 → 查自己這層規則的 approver_role_code 對應到哪層（通常是店長），
 *      取該層 max_overall_pct 為「上層上限」：
 *        在上層上限內 → situation B（需送審）
 *        超過上層上限 → situation exceeds_top（無法送審，需重新談判）
 *   4. 若呼叫者角色在 business_rules 裡查無對應規則（例如非業務部門帳號）
 *      或此 brand 完全沒設定折扣授權規則 → 視為不限（situation A, own_max_pct=null）
 */
export async function checkSalesDiscountAuthority(
  discountPct: number,
): Promise<DiscountAuthorityResult> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const dept = await getCurrentUserDepartment();

  const { data, error } = await supabase
    .from("business_rules")
    .select("scope_role_code, config")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "discount_authority")
    .eq("is_active", true);

  if (error || !data || data.length === 0) {
    return { situation: "A", within_authority: true, role_code: null, own_max_pct: null };
  }

  const rules = data as Array<{ scope_role_code: string | null; config: DiscountAuthorityConfig }>;
  const byRole = new Map<string, DiscountAuthorityConfig>(
    rules.filter((r) => r.scope_role_code).map((r) => [r.scope_role_code as string, r.config]),
  );

  const callerRoles = dept.role_codes.filter((r) => byRole.has(r));
  if (callerRoles.length === 0) {
    return { situation: "A", within_authority: true, role_code: null, own_max_pct: null };
  }

  // 取多角色中「自己上限最寬鬆」的一筆
  let ownRoleCode = callerRoles[0];
  let ownCfg = byRole.get(ownRoleCode)!;
  for (const r of callerRoles) {
    const cfg = byRole.get(r)!;
    const pct = typeof cfg.max_overall_pct === "number" ? cfg.max_overall_pct : -Infinity;
    const curPct = typeof ownCfg.max_overall_pct === "number" ? ownCfg.max_overall_pct : -Infinity;
    if (pct > curPct) {
      ownRoleCode = r;
      ownCfg = cfg;
    }
  }

  const ownMaxPct = typeof ownCfg.max_overall_pct === "number" ? ownCfg.max_overall_pct : null;

  if (ownMaxPct === null || discountPct <= ownMaxPct) {
    return { situation: "A", within_authority: true, role_code: ownRoleCode, own_max_pct: ownMaxPct };
  }

  const approverRoleCode =
    typeof ownCfg.approver_role_code === "string" && ownCfg.approver_role_code.length > 0
      ? ownCfg.approver_role_code
      : null;
  const topCfg = approverRoleCode ? byRole.get(approverRoleCode) : undefined;
  const topMaxPct = topCfg && typeof topCfg.max_overall_pct === "number" ? topCfg.max_overall_pct : null;

  if (!approverRoleCode || topMaxPct === null) {
    // 呼叫者本身已是最高層級（或無上層規則可送審）→ 超過即無法送審
    return {
      situation: "exceeds_top",
      within_authority: false,
      role_code: ownRoleCode,
      own_max_pct: ownMaxPct,
      top_max_pct: ownMaxPct,
    };
  }

  if (discountPct <= topMaxPct) {
    return {
      situation: "B",
      within_authority: false,
      role_code: ownRoleCode,
      own_max_pct: ownMaxPct,
      top_max_pct: topMaxPct,
      approver_role_code: approverRoleCode,
    };
  }

  return {
    situation: "exceeds_top",
    within_authority: false,
    role_code: ownRoleCode,
    own_max_pct: ownMaxPct,
    top_max_pct: topMaxPct,
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

  const rows = (data ?? []) as DiscountApprovalRow[];
  const quoteIds = rows.map((r) => r.quote_id).filter(Boolean) as string[];
  const orderIds = rows.map((r) => r.order_id).filter(Boolean) as string[];
  const userIds = Array.from(
    new Set([
      ...rows.map((r) => r.requested_by).filter(Boolean),
      ...rows.map((r) => r.approver_id).filter(Boolean),
      ...rows.map((r) => r.escalated_to).filter(Boolean),
    ] as string[]),
  );

  const [quotesRes, ordersRes, usersRes] = await Promise.all([
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
    orderIds.length > 0
      ? supabase
          .from("sales_orders")
          .select("id, order_no, vehicle_model_name, deal_price")
          .in("id", orderIds)
      : Promise.resolve({ data: [] as Array<{
          id: string;
          order_no: string;
          vehicle_model_name: string | null;
          deal_price: number | null;
        }> }),
    userIds.length > 0
      ? supabase
          .from("employees")
          .select("user_id, name")
          .in("user_id", userIds)
      : Promise.resolve({ data: [] as Array<{ user_id: string; name: string }> }),
  ]);

  const quoteMap = new Map((quotesRes.data ?? []).map((q) => [q.id, q]));
  const orderMap = new Map((ordersRes.data ?? []).map((o) => [o.id, o]));
  const userMap = new Map(
    (usersRes.data ?? []).map((u) => [u.user_id, (u as { user_id: string; name: string }).name]),
  );

  return {
    rows: rows.map((r) => {
      const quote = r.quote_id ? quoteMap.get(r.quote_id) : undefined;
      const order = r.order_id ? orderMap.get(r.order_id) : undefined;
      return {
        ...r,
        discount_pct: r.discount_pct ? Number(r.discount_pct) : null,
        discount_amount: r.discount_amount ? Number(r.discount_amount) : null,
        counter_offer_amount: r.counter_offer_amount ? Number(r.counter_offer_amount) : null,
        counter_offer_pct: r.counter_offer_pct ? Number(r.counter_offer_pct) : null,
        requester_name: r.requested_by ? (userMap.get(r.requested_by) ?? null) : null,
        approver_name: r.approver_id ? (userMap.get(r.approver_id) ?? null) : null,
        escalated_to_name: r.escalated_to ? (userMap.get(r.escalated_to) ?? null) : null,
        quote_no: quote?.quote_no ?? null,
        order_no: order?.order_no ?? null,
        vehicle_model_name: quote?.vehicle_model_name ?? order?.vehicle_model_name ?? null,
        vehicle_amount:
          quote?.vehicle_amount != null
            ? Number(quote.vehicle_amount)
            : order?.deal_price != null
              ? Number(order.deal_price)
              : null,
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

  const [quoteRes, orderRes, usersRes] = await Promise.all([
    row.quote_id
      ? supabase
          .from("sales_quotes")
          .select("id, quote_no, vehicle_model_name, vehicle_amount")
          .eq("id", row.quote_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    row.order_id
      ? supabase
          .from("sales_orders")
          .select("id, order_no, vehicle_model_name, deal_price")
          .eq("id", row.order_id)
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

  const o = orderRes.data as {
    id: string;
    order_no: string;
    vehicle_model_name: string | null;
    deal_price: number | null;
  } | null;

  return {
    ...row,
    discount_pct: row.discount_pct ? Number(row.discount_pct) : null,
    discount_amount: row.discount_amount ? Number(row.discount_amount) : null,
    counter_offer_amount: row.counter_offer_amount ? Number(row.counter_offer_amount) : null,
    counter_offer_pct: row.counter_offer_pct ? Number(row.counter_offer_pct) : null,
    requester_name: row.requested_by ? (uMap.get(row.requested_by) ?? null) : null,
    approver_name: row.approver_id ? (uMap.get(row.approver_id) ?? null) : null,
    escalated_to_name: row.escalated_to ? (uMap.get(row.escalated_to) ?? null) : null,
    quote_no: q?.quote_no ?? null,
    order_no: o?.order_no ?? null,
    vehicle_model_name: q?.vehicle_model_name ?? o?.vehicle_model_name ?? null,
    vehicle_amount:
      q?.vehicle_amount != null ? Number(q.vehicle_amount) : o?.deal_price != null ? Number(o.deal_price) : null,
  };
}

// ─────────────────────────────────────────────────────────────
// 查某張報價單的最新 pending/escalated 申請（歷史相容；RS04 後新流程不再產生）
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
// 歷史相容；RS04 後報價階段不再涉及折扣審核。
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
// 查某張訂單目前進行中的折扣審核申請（RS04 主流程：情況B/店長三選擇）
// ─────────────────────────────────────────────────────────────

export async function getPendingApprovalForOrder(
  orderId: string,
): Promise<DiscountApprovalRow | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("discount_approval_requests")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("order_id", orderId)
    .in("status", ["pending", "escalated", "counter_offered"])
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const row = data as DiscountApprovalRow;
  return {
    ...row,
    discount_pct: row.discount_pct ? Number(row.discount_pct) : null,
    discount_amount: row.discount_amount ? Number(row.discount_amount) : null,
    counter_offer_amount: row.counter_offer_amount ? Number(row.counter_offer_amount) : null,
    counter_offer_pct: row.counter_offer_pct ? Number(row.counter_offer_pct) : null,
  };
}

// ─────────────────────────────────────────────────────────────
// Create（訂單超授權自動送審 — RS04 唯一入口，由 createSalesOrder() 呼叫）
// ─────────────────────────────────────────────────────────────

export async function createDiscountApproval(
  input: CreateDiscountApprovalInput,
): Promise<Result<{ id: string }>> {
  if (!input.quote_id && !input.order_id) {
    return { ok: false, error: "quote_id 或 order_id 至少需擇一" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 重複防護：同一 quote/order 已有 pending/escalated/counter_offered 就不再新建
  let existingQ = supabase
    .from("discount_approval_requests")
    .select("id, status")
    .eq("brand_id", scope.brand_id)
    .in("status", ["pending", "escalated", "counter_offered"])
    .limit(1);
  existingQ = input.order_id
    ? existingQ.eq("order_id", input.order_id)
    : existingQ.eq("quote_id", input.quote_id as string);
  const { data: existing } = await existingQ.maybeSingle();

  if (existing) {
    return { ok: false, error: "已有進行中的折扣審核申請，請勿重複送審" };
  }

  const deadlineAt = calcDeadlineAt(input.in_store_waiting);

  const { data, error } = await supabase
    .from("discount_approval_requests")
    .insert({
      brand_id: scope.brand_id,
      quote_id: input.quote_id ?? null,
      order_id: input.order_id ?? null,
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
  if (input.quote_id) revalidatePath(`/sales/quote/${input.quote_id}`);
  if (input.order_id) revalidatePath(`/sales/orders/${input.order_id}`);
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────────────────────────
// 訂單 + 車輛狀態同步 helper（approve/reject 決定後套用，RS04 情況A/B）
// ─────────────────────────────────────────────────────────────

async function applyOrderDiscountDecision(
  orderId: string,
  decision: "approved" | "rejected",
  brandId: string,
): Promise<void> {
  const supabase = await createClient();

  const { data: order } = await supabase
    .from("sales_orders")
    .select("id, new_vehicle_id")
    .eq("id", orderId)
    .eq("brand_id", brandId)
    .maybeSingle();

  if (!order) return;

  const now = new Date().toISOString();

  if (decision === "approved") {
    await supabase
      .from("sales_orders")
      .update({ status: "draft" })
      .eq("id", orderId)
      .eq("status", "pending_discount_approval");

    if (order.new_vehicle_id) {
      await supabase
        .from("new_car_inventory")
        .update({ status: "reserved", reserved_date: now })
        .eq("id", order.new_vehicle_id)
        .eq("status", "frozen");
    }
  } else {
    await supabase
      .from("sales_orders")
      .update({ status: "cancelled" })
      .eq("id", orderId)
      .eq("status", "pending_discount_approval");

    if (order.new_vehicle_id) {
      await supabase
        .from("new_car_inventory")
        .update({ status: "displayed", linked_sales_order_id: null })
        .eq("id", order.new_vehicle_id)
        .eq("status", "frozen");
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Decide（店長三選擇：approve / reject / counter_offer）
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
    .select("status, quote_id, order_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (!current) return { ok: false, error: "找不到審核申請" };
  if (current.status !== "pending" && current.status !== "escalated") {
    return { ok: false, error: "此申請已決定，不可再次操作" };
  }

  const now = new Date().toISOString();

  if (input.decision === "counter_offer") {
    // RS04：反價等待逾時可由 RS_M3 設定（rs_manager 規則的 config.counter_offer_timeout_hours），無設定則用預設 24hr
    const { data: rmRule } = await supabase
      .from("business_rules")
      .select("config")
      .eq("brand_id", scope.brand_id)
      .eq("rule_kind", "discount_authority")
      .eq("scope_role_code", "rs_manager")
      .eq("is_active", true)
      .maybeSingle();
    const configuredHours = (rmRule?.config as Record<string, unknown> | null)
      ?.counter_offer_timeout_hours;
    const timeoutHours =
      typeof configuredHours === "number" ? configuredHours : COUNTER_OFFER_TIMEOUT_HOURS_DEFAULT;
    const deadline = calcCounterOfferDeadlineAt(timeoutHours);
    const { error } = await supabase
      .from("discount_approval_requests")
      .update({
        status: "counter_offered",
        approver_id: user?.id ?? null,
        counter_offer_amount: input.counter_offer_amount,
        counter_offer_pct: input.counter_offer_pct,
        counter_offered_at: now,
        counter_offer_deadline_at: deadline.toISOString(),
        decision_reason: input.reason ?? null,
      })
      .eq("id", id)
      .eq("brand_id", scope.brand_id);

    if (error) return { ok: false, error: `反價失敗：${error.message}` };

    revalidatePath("/admin/approvals/discount");
    if (current.quote_id) revalidatePath(`/sales/quote/${current.quote_id}`);
    if (current.order_id) revalidatePath(`/sales/orders/${current.order_id}`);
    return { ok: true, data: { id } };
  }

  const { error } = await supabase
    .from("discount_approval_requests")
    .update({
      status: input.decision,
      approver_id: user?.id ?? null,
      decided_at: now,
      decision_reason: input.reason ?? null,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `決定失敗：${error.message}` };

  if (current.order_id) {
    await applyOrderDiscountDecision(current.order_id, input.decision, scope.brand_id);
  }

  revalidatePath("/admin/approvals/discount");
  if (current.quote_id) revalidatePath(`/sales/quote/${current.quote_id}`);
  if (current.order_id) revalidatePath(`/sales/orders/${current.order_id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// 業務員回覆店長反價（客戶接受 / 不接受）— RS04 新流程
// ─────────────────────────────────────────────────────────────

export async function acceptCounterOffer(id: string): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: current } = await supabase
    .from("discount_approval_requests")
    .select("status, order_id, counter_offer_amount, counter_offer_pct")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (!current) return { ok: false, error: "找不到審核申請" };
  if (current.status !== "counter_offered") {
    return { ok: false, error: "此申請目前非反價待回覆狀態" };
  }
  if (!current.order_id || current.counter_offer_amount == null || current.counter_offer_pct == null) {
    return { ok: false, error: "此申請缺少反價金額，無法確認" };
  }

  const now = new Date().toISOString();
  const counterAmount = Number(current.counter_offer_amount);
  const counterPct = Number(current.counter_offer_pct);

  const { error } = await supabase
    .from("discount_approval_requests")
    .update({
      status: "approved",
      customer_response: "accepted",
      customer_response_at: now,
      decided_at: now,
      discount_pct: counterPct,
      discount_amount: counterAmount,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `確認失敗：${error.message}` };

  const { data: order } = await supabase
    .from("sales_orders")
    .select("id, new_vehicle_id, list_price")
    .eq("id", current.order_id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (order) {
    await supabase
      .from("sales_orders")
      .update({
        status: "draft",
        deal_price: counterAmount,
        total_amount: counterAmount,
        discount_pct: counterPct,
        discount_amount: order.list_price != null ? order.list_price - counterAmount : null,
      })
      .eq("id", current.order_id)
      .eq("status", "pending_discount_approval");

    if (order.new_vehicle_id) {
      await supabase
        .from("new_car_inventory")
        .update({ status: "reserved", reserved_date: now })
        .eq("id", order.new_vehicle_id)
        .eq("status", "frozen");
    }
  }

  revalidatePath("/admin/approvals/discount");
  revalidatePath(`/sales/orders/${current.order_id}`);
  return { ok: true, data: { id } };
}

/**
 * 業務員回報客戶不接受店長反價 → 訂單取消、車輛釋出。
 * 戰敗記錄（lost_reason='price'）由 UI 層另行呼叫既有 markLeadLostAction，
 * 業務員在畫面上明確選擇戰敗原因（非本函式自動觸發）。
 */
export async function rejectCounterOffer(id: string): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: current } = await supabase
    .from("discount_approval_requests")
    .select("status, order_id")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (!current) return { ok: false, error: "找不到審核申請" };
  if (current.status !== "counter_offered") {
    return { ok: false, error: "此申請目前非反價待回覆狀態" };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("discount_approval_requests")
    .update({
      status: "rejected",
      customer_response: "rejected",
      customer_response_at: now,
      decided_at: now,
    })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);

  if (error) return { ok: false, error: `回覆失敗：${error.message}` };

  if (current.order_id) {
    const { data: order } = await supabase
      .from("sales_orders")
      .select("new_vehicle_id")
      .eq("id", current.order_id)
      .eq("brand_id", scope.brand_id)
      .maybeSingle();

    await supabase
      .from("sales_orders")
      .update({ status: "cancelled" })
      .eq("id", current.order_id)
      .eq("status", "pending_discount_approval");

    if (order?.new_vehicle_id) {
      await supabase
        .from("new_car_inventory")
        .update({ status: "displayed", linked_sales_order_id: null })
        .eq("id", order.new_vehicle_id)
        .eq("status", "frozen");
    }
  }

  revalidatePath("/admin/approvals/discount");
  if (current.order_id) revalidatePath(`/sales/orders/${current.order_id}`);
  return { ok: true, data: { id } };
}

// ─────────────────────────────────────────────────────────────
// 情況C：業務員主動取消送審中的訂單（客戶臨時說要考慮）
// ─────────────────────────────────────────────────────────────

export async function cancelPendingDiscountOrder(
  orderId: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: order } = await supabase
    .from("sales_orders")
    .select("id, status, new_vehicle_id")
    .eq("id", orderId)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();

  if (!order) return { ok: false, error: "找不到訂單" };
  if (order.status !== "pending_discount_approval") {
    return { ok: false, error: "此訂單目前非待審核狀態，無法用此方式取消" };
  }

  const { error } = await supabase
    .from("sales_orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("status", "pending_discount_approval");

  if (error) return { ok: false, error: `取消失敗：${error.message}` };

  if (order.new_vehicle_id) {
    await supabase
      .from("new_car_inventory")
      .update({ status: "displayed", linked_sales_order_id: null })
      .eq("id", order.new_vehicle_id)
      .eq("status", "frozen");
  }

  // 同步作廢對應的折扣審核申請（若還在 pending/escalated/counter_offered）
  await supabase
    .from("discount_approval_requests")
    .update({
      status: "rejected",
      decision_reason: `業務員主動取消：${reason}`,
      decided_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("brand_id", scope.brand_id)
    .in("status", ["pending", "escalated", "counter_offered"]);

  await writeAuditLog({
    table_name: "sales_orders",
    record_id: orderId,
    action: "discount_approval_self_cancelled",
    actor_id: user?.id ?? null,
    brand_id: scope.brand_id,
    before: { status: "pending_discount_approval" },
    after: { status: "cancelled", reason },
  });

  revalidatePath("/admin/approvals/discount");
  revalidatePath(`/sales/orders/${orderId}`);
  revalidatePath("/sales/orders");
  return { ok: true, data: { id: orderId } };
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
    .select("status, quote_id, order_id")
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
  if (current.quote_id) revalidatePath(`/sales/quote/${current.quote_id}`);
  if (current.order_id) revalidatePath(`/sales/orders/${current.order_id}`);
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
// 折扣門檻設定（RS_M3）
// 讀寫 business_rules.rule_kind='discount_authority' 的
// sales_consultant（業務員）/ rs_manager（店長）兩筆規則。
// ─────────────────────────────────────────────────────────────

export type DiscountAuthoritySettings = {
  /** 業務員（RS）折扣授權上限 % */
  sales_consultant_max_pct: number | null;
  /** 店長折扣授權上限 %（同時也是最高層授權，超過即無法送審） */
  rs_manager_max_pct: number | null;
  /** 折扣審核逾時（在場）分鐘 — 沿用現有機制，非本頁可編輯 */
  in_store_timeout_minutes: number;
  /** 折扣審核逾時（不在場）分鐘 — 沿用現有機制，非本頁可編輯 */
  normal_timeout_minutes: number;
  /** 反價等待逾時 小時（RS04 新增，可編輯） */
  counter_offer_timeout_hours: number;
};

export async function getDiscountAuthoritySettings(): Promise<DiscountAuthoritySettings> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data } = await supabase
    .from("business_rules")
    .select("scope_role_code, config")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "discount_authority")
    .in("scope_role_code", ["sales_consultant", "rs_manager"])
    .eq("is_active", true);

  const rows = (data ?? []) as Array<{
    scope_role_code: string;
    config: Record<string, unknown>;
  }>;
  const sc = rows.find((r) => r.scope_role_code === "sales_consultant");
  const rm = rows.find((r) => r.scope_role_code === "rs_manager");

  const scPct = sc?.config.max_overall_pct;
  const rmPct = rm?.config.max_overall_pct;
  const counterHours = rm?.config.counter_offer_timeout_hours;

  return {
    sales_consultant_max_pct: typeof scPct === "number" ? scPct : null,
    rs_manager_max_pct: typeof rmPct === "number" ? rmPct : null,
    in_store_timeout_minutes: DEADLINE_MINUTES_IN_STORE,
    normal_timeout_minutes: DEADLINE_MINUTES_NORMAL,
    counter_offer_timeout_hours:
      typeof counterHours === "number" ? counterHours : COUNTER_OFFER_TIMEOUT_HOURS_DEFAULT,
  };
}

export type UpdateDiscountAuthoritySettingsInput = {
  sales_consultant_max_pct: number;
  rs_manager_max_pct: number;
  counter_offer_timeout_hours: number;
};

export async function updateDiscountAuthoritySettings(
  input: UpdateDiscountAuthoritySettingsInput,
): Promise<Result<{ id: string }>> {
  if (
    !Number.isFinite(input.sales_consultant_max_pct) ||
    input.sales_consultant_max_pct < 0 ||
    input.sales_consultant_max_pct > 100
  ) {
    return { ok: false, error: "業務員折扣授權上限需介於 0–100%" };
  }
  if (
    !Number.isFinite(input.rs_manager_max_pct) ||
    input.rs_manager_max_pct < 0 ||
    input.rs_manager_max_pct > 100
  ) {
    return { ok: false, error: "店長折扣授權上限需介於 0–100%" };
  }
  if (input.rs_manager_max_pct < input.sales_consultant_max_pct) {
    return { ok: false, error: "店長折扣授權上限不可低於業務員授權上限" };
  }
  if (
    !Number.isFinite(input.counter_offer_timeout_hours) ||
    input.counter_offer_timeout_hours <= 0 ||
    input.counter_offer_timeout_hours > 168
  ) {
    return { ok: false, error: "反價等待逾時需介於 1–168 小時" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("business_rules")
    .select("id, scope_role_code, config")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "discount_authority")
    .in("scope_role_code", ["sales_consultant", "rs_manager"]);

  const rows = (data ?? []) as Array<{
    id: string;
    scope_role_code: string;
    config: Record<string, unknown>;
  }>;
  const sc = rows.find((r) => r.scope_role_code === "sales_consultant");
  const rm = rows.find((r) => r.scope_role_code === "rs_manager");

  if (!sc || !rm) {
    return {
      ok: false,
      error: "找不到折扣授權規則（sales_consultant / rs_manager），請聯絡系統管理員",
    };
  }

  const { error: e1 } = await supabase
    .from("business_rules")
    .update({
      config: { ...sc.config, max_overall_pct: input.sales_consultant_max_pct },
      updated_by: user?.id ?? null,
    })
    .eq("id", sc.id);
  if (e1) return { ok: false, error: `更新業務員折扣上限失敗：${e1.message}` };

  const { error: e2 } = await supabase
    .from("business_rules")
    .update({
      config: {
        ...rm.config,
        max_overall_pct: input.rs_manager_max_pct,
        counter_offer_timeout_hours: input.counter_offer_timeout_hours,
      },
      updated_by: user?.id ?? null,
    })
    .eq("id", rm.id);
  if (e2) return { ok: false, error: `更新店長折扣上限失敗：${e2.message}` };

  await writeAuditLog({
    table_name: "business_rules",
    record_id: rm.id,
    action: "discount_authority_settings_updated",
    actor_id: user?.id ?? null,
    brand_id: scope.brand_id,
    before: {
      sales_consultant_max_pct: sc.config.max_overall_pct ?? null,
      rs_manager_max_pct: rm.config.max_overall_pct ?? null,
      counter_offer_timeout_hours: rm.config.counter_offer_timeout_hours ?? null,
    },
    after: input,
  });

  revalidatePath("/sales/manager/discount-approvers");
  return { ok: true, data: { id: rm.id } };
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
