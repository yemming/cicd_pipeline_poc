"use server";

/**
 * Domain Helper — Aftersales Discount Authority（崗位折扣審批）
 *
 * 涵蓋兩種 rule_kind（都寫在 business_rules 一張表）：
 *   - discount_authority   崗位折扣權限（角色 × 全場/商品/人工最高折扣% × 超限審批人）
 *   - discount_workflow    折扣超限審批流（一筆 jsonb：兩級審批 + 期限 + 逾期處理）
 *
 * 範式參照：domain/rules.ts purchase_authority。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type BusinessRuleRow = Tables["business_rules"]["Row"];
export type RoleRow = Tables["roles"]["Row"];

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "重複資料：相同範圍已存在規則";
  if (error.code === "23503") return "參照的角色不存在";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  if (error.code === "P0001") return error.message;
  return `${fallback}：${error.message}`;
}

const REVALIDATE_PATHS = ["/parts/aftersales/management/discounts"];
function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

// ──────────────────────────────────────────────────────────────────────────
// Config 型別
// ──────────────────────────────────────────────────────────────────────────

/** 崗位折扣權限 — 一筆代表一個角色的折扣上限 */
export type DiscountAuthorityConfig = {
  role_label: string;                   // 顯示用中文（"售後接待(SA)"）
  max_overall_pct: number | null;       // 全場最高折扣%（null = 不允許）
  max_goods_pct: number | null;         // 商品最高折扣%
  max_labor_pct: number | null;         // 人工費最高折扣%
  approver_role_code: string | null;    // 超限審批人 role.id（null = 不允許申請）
  approver_label: string;               // 顯示用中文
};

/** 折扣審批流 — 一筆 jsonb（每 brand 只有一筆 active） */
export type DiscountWorkflowConfig = {
  label: string;                        // "折扣超限審批流"
  first_approver_role: string;          // SA 超限的審批人
  first_approver_label: string;
  second_approver_role: string;         // 主管超限的審批人
  second_approver_label: string;
  deadline_label: string;               // "當日內完成" / "2 小時內" / ...
  overdue_action: string;               // "return_to_applicant" / "notify_next_level" / "auto_approve"
  overdue_label: string;
};

// ──────────────────────────────────────────────────────────────────────────
// READ
// ──────────────────────────────────────────────────────────────────────────

async function listDiscountAuthority(): Promise<BusinessRuleRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("business_rules")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "discount_authority")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

async function getDiscountWorkflow(): Promise<BusinessRuleRow | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("business_rules")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "discount_workflow")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function listRoles(): Promise<RoleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getAftersalesDiscountsPageData(): Promise<{
  authorityRules: BusinessRuleRow[];
  workflowRule: BusinessRuleRow | null;
  roles: RoleRow[];
  canEdit: boolean;
  brandId: string;
}> {
  const [authorityRules, workflowRule, roles, canEdit, scope] = await Promise.all([
    listDiscountAuthority(),
    getDiscountWorkflow(),
    listRoles(),
    hasPermission(PERMISSIONS.AFTERSALES_DISCOUNT_EDIT),
    getActiveScope(),
  ]);
  return {
    authorityRules,
    workflowRule,
    roles,
    canEdit,
    brandId: scope.brand_id,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// WRITE — 崗位折扣權限批次儲存
// ──────────────────────────────────────────────────────────────────────────

export type DiscountAuthorityRuleInput = {
  id?: string;
  scope_role_code: string;
  config: DiscountAuthorityConfig;
  sort_order?: number;
};

function validatePct(n: number | null, label: string): string | null {
  if (n === null) return null;
  if (!Number.isFinite(n)) return `${label} 必須為數字或留空`;
  if (n < 0 || n > 100) return `${label} 必須介於 0-100`;
  return null;
}

export async function saveDiscountAuthorityRules(
  inputs: DiscountAuthorityRuleInput[],
): Promise<Result<{ saved: number }>> {
  await requirePermission(PERMISSIONS.AFTERSALES_DISCOUNT_EDIT);

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  // 1. 撈現有 row id
  const existing = await supabase
    .from("business_rules")
    .select("id")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "discount_authority");
  if (existing.error) {
    return { ok: false, error: mapDbError(existing.error, "撈既有規則失敗") };
  }
  const existingIds = new Set((existing.data ?? []).map((r) => r.id));
  const submittedIds = new Set(inputs.filter((i) => i.id).map((i) => i.id as string));
  const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));

  // 2. 角色重複檢查
  const roleCodes = inputs.map((i) => i.scope_role_code);
  const dupRole = roleCodes.find((c, idx) => roleCodes.indexOf(c) !== idx);
  if (dupRole) return { ok: false, error: `角色 ${dupRole} 出現兩次，請合併` };

  // 3. config 驗證
  for (let i = 0; i < inputs.length; i++) {
    const cfg = inputs[i].config;
    if (!inputs[i].scope_role_code) {
      return { ok: false, error: `第 ${i + 1} 列未選角色` };
    }
    const errs = [
      validatePct(cfg.max_overall_pct, "全場最高折扣"),
      validatePct(cfg.max_goods_pct, "商品最高折扣"),
      validatePct(cfg.max_labor_pct, "人工費最高折扣"),
    ].filter(Boolean);
    if (errs.length > 0) {
      return { ok: false, error: `第 ${i + 1} 列：${errs.join("、")}` };
    }
  }

  // 4. UPDATE / INSERT
  const updates = inputs
    .filter((i) => i.id)
    .map((i, idx) => ({
      id: i.id as string,
      scope_role_code: i.scope_role_code,
      config: i.config as unknown as Database["public"]["Tables"]["business_rules"]["Update"]["config"],
      sort_order: i.sort_order ?? idx + 1,
      is_active: true,
      updated_by: userId ?? null,
    }));
  const inserts = inputs
    .filter((i) => !i.id)
    .map((i, idx) => ({
      brand_id: scope.brand_id,
      rule_kind: "discount_authority",
      scope_role_code: i.scope_role_code,
      scope_store_id: null,
      config: i.config as unknown as Database["public"]["Tables"]["business_rules"]["Insert"]["config"],
      sort_order: i.sort_order ?? updates.length + idx + 1,
      is_active: true,
      created_by: userId ?? null,
      updated_by: userId ?? null,
    }));

  for (const u of updates) {
    const { error } = await supabase
      .from("business_rules")
      .update({
        scope_role_code: u.scope_role_code,
        config: u.config,
        sort_order: u.sort_order,
        is_active: u.is_active,
        updated_by: u.updated_by,
      })
      .eq("id", u.id);
    if (error) return { ok: false, error: mapDbError(error, "更新折扣權限失敗") };
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from("business_rules").insert(inserts);
    if (error) return { ok: false, error: mapDbError(error, "新增折扣權限失敗") };
  }

  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("business_rules")
      .delete()
      .in("id", toDelete);
    if (error) return { ok: false, error: mapDbError(error, "刪除折扣權限失敗") };
  }

  revalidateAll();
  return { ok: true, data: { saved: updates.length + inserts.length } };
}

// ──────────────────────────────────────────────────────────────────────────
// WRITE — 折扣審批流 upsert（每 brand 一筆）
// ──────────────────────────────────────────────────────────────────────────

export async function saveDiscountWorkflow(
  config: DiscountWorkflowConfig,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.AFTERSALES_DISCOUNT_EDIT);

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  if (!config.first_approver_role) return { ok: false, error: "第一級審批人必填" };
  if (!config.second_approver_role) return { ok: false, error: "第二級審批人必填" };
  if (!config.deadline_label) return { ok: false, error: "審批期限必填" };
  if (!config.overdue_action) return { ok: false, error: "逾期處理方式必填" };

  const existing = await supabase
    .from("business_rules")
    .select("id")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "discount_workflow")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    return { ok: false, error: mapDbError(existing.error, "讀取既有審批流失敗") };
  }

  if (existing.data?.id) {
    const { error } = await supabase
      .from("business_rules")
      .update({
        config: config as unknown as Database["public"]["Tables"]["business_rules"]["Update"]["config"],
        updated_by: userId ?? null,
      })
      .eq("id", existing.data.id);
    if (error) return { ok: false, error: mapDbError(error, "更新審批流失敗") };
    revalidateAll();
    return { ok: true, data: { id: existing.data.id } };
  }

  const { data, error } = await supabase
    .from("business_rules")
    .insert({
      brand_id: scope.brand_id,
      rule_kind: "discount_workflow",
      scope_role_code: null,
      scope_store_id: null,
      config: config as unknown as Database["public"]["Tables"]["business_rules"]["Insert"]["config"],
      sort_order: 1,
      is_active: true,
      created_by: userId ?? null,
      updated_by: userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "建立審批流失敗") };
  revalidateAll();
  return { ok: true, data: { id: data.id } };
}
