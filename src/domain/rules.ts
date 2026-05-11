"use server";

/**
 * Domain Helper — Business Rules（業務規則）
 *
 * 涵蓋規則類設定一張打天下：
 *   - purchase_authority   採購權限（角色 × 上限 × 是否需主管審核）
 *   - purchase_workflow    採購類型審核流程（計畫 / 緊急 / 超額）
 *   - 後續：count_return（盤點回傳）/ alert_threshold（告警階層）/ abc_classification 等
 *
 * 提案：docs/proposals/feature-purchase-permissions-2026-05-10.md
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { bulkSetRolePermissions } from "@/domain/rbac";
import { ITEM_CAPABILITY_TO_RBAC } from "@/domain/rbac.constants";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type BusinessRuleRow = Tables["business_rules"]["Row"];
export type RoleRow = Tables["roles"]["Row"];

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "重複資料：相同範圍已存在規則";
  if (error.code === "23503") return "參照的角色 / 門店不存在";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  if (error.code === "P0001") return error.message;
  return `${fallback}：${error.message}`;
}

const REVALIDATE_PATHS = ["/parts/setup/purchase-permissions"];
function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

// ──────────────────────────────────────────────────────────────────────────
// Config 型別（每個 rule_kind 對應一組 jsonb shape）
// ──────────────────────────────────────────────────────────────────────────

export type PurchaseAuthorityConfig = {
  max_single_amount: number | null;       // null = 無上限
  max_monthly_amount: number | null;
  require_supervisor_approval: boolean;
};

export type PurchaseWorkflowStep = {
  label: string;
  kind: "done" | "navy" | "teal" | "pend" | "red" | "gry";
};

export type PurchaseWorkflowConfig = {
  category: "planned" | "urgent" | "overspend";
  label: string;
  description: string;
  tone: "neutral" | "amber" | "red";
  steps: PurchaseWorkflowStep[];
};

// item_permission（商品管理權限矩陣）
//   常數 ITEM_PERMISSION_CAPABILITIES 已拆到 ./rules.constants.ts
//   ('use server' module 不能 export 非 async value)
export type ItemPermissionConfig = Record<string, boolean>;

// alert_escalation（告警階層）
export type AlertEscalationConfig = {
  level: number;
  label: string;
  timeout_min: number;
  recipients: string[];
  channels: string[];
};

// alert_rule（告警類型與規則）
export type AlertRuleConfig = {
  code: string;
  label: string;
  description: string;
  priority: "critical" | "high" | "normal" | "low";
  tone: "red" | "amber" | "navy" | "neutral";
  channels: string[];
};

// serial_tracking（序列號追蹤規則 A/B/C）
export type SerialTrackingConfig = {
  item_class: "A" | "B" | "C";
  required: boolean;
  by_category?: boolean;
  label: string;
  description: string;
  tone: "red" | "amber" | "neutral";
};

// warehouse_layer（倉儲四層架構說明）
export type WarehouseLayerBadge = {
  label: string;
  kind: "navy" | "teal" | "amber" | "red" | "gry";
};
export type WarehouseLayerConfig = {
  layer_index: number;
  icon: string;
  layer_title: string;
  layer_name: string;
  description: string;
  badge: WarehouseLayerBadge;
  accent: "navy" | "blue" | "teal" | "purple";
};

// control_type（管控類型定義 A/B/C 類）
export type ControlTypeBadge = {
  label: string;
  kind: "red" | "pend" | "gry" | "done";
};
export type ControlTypeConfig = {
  class_label: string;
  tier_label: string;
  accent: "red" | "amber" | "teal";
  amount_basis: string;
  count_frequency: string;
  serial_tracking: ControlTypeBadge;
  issue_approval: ControlTypeBadge;
  tolerance_pct: number;
  examples: string;
};

// count_tolerance / count_workflow（盤點回傳規則）
export type CountToleranceConfig = {
  abc_tolerance_pcts: { A: number; B: number; C: number };
};
export type CountWorkflowConfig = {
  category: "within" | "overflow" | "a_class_force";
  label: string;
  description: string;
  tone: "neutral" | "amber" | "red";
  badge: { label: string; kind: "teal" | "pend" | "red" };
};

// ──────────────────────────────────────────────────────────────────────────
// READ
// ──────────────────────────────────────────────────────────────────────────

/** 撈某 brand 的某 rule_kind 全部規則（含未啟用，預設只回啟用）。 */
export async function listRulesByKind(
  ruleKind: string,
  options: { onlyActive?: boolean } = {},
): Promise<BusinessRuleRow[]> {
  const { onlyActive = true } = options;
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("business_rules")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", ruleKind);
  if (onlyActive) q = q.eq("is_active", true);
  const { data, error } = await q.order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 撈當前使用者所有 system role（給左卡角色 dropdown 用）。 */
export async function listRoles(): Promise<RoleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("roles")
    .select("*")
    .order("id", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** 採購權限頁面同時要的兩組規則 + role 清單。 */
export async function getPurchasePermissionsPageData(): Promise<{
  authorityRules: BusinessRuleRow[];
  workflowRules: BusinessRuleRow[];
  roles: RoleRow[];
  canEdit: boolean;
  brandId: string;
}> {
  const [authorityRules, workflowRules, roles, canEdit, scope] = await Promise.all([
    listRulesByKind("purchase_authority"),
    listRulesByKind("purchase_workflow"),
    listRoles(),
    hasPermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_EDIT),
    getActiveScope(),
  ]);
  return { authorityRules, workflowRules, roles, canEdit, brandId: scope.brand_id };
}

// ──────────────────────────────────────────────────────────────────────────
// WRITE — 採購權限規則批次儲存（左卡「儲存」按鈕）
// ──────────────────────────────────────────────────────────────────────────

export type PurchaseAuthorityRuleInput = {
  /** 既有 row 帶 id；新 row 留 undefined */
  id?: string;
  scope_role_code: string;
  config: PurchaseAuthorityConfig;
  sort_order?: number;
};

/**
 * 一次性儲存整張左卡的採購權限規則：
 *  - 帶 id 的 row → UPDATE
 *  - 沒 id 的 row → INSERT（brand_id 從 active scope 取）
 *  - 既有但本次沒在清單裡的 row → DELETE（user 從 UI 拿掉）
 *
 * 全部跑在同一個 supabase client、無事務（POC 階段；失敗 user 重試即可）
 */
export async function savePurchaseAuthorityRules(
  inputs: PurchaseAuthorityRuleInput[],
): Promise<Result<{ saved: number }>> {
  await requirePermission(PERMISSIONS.PARTS_PURCHASE_PERMISSION_EDIT);

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  // 1. 撈現有 row id 集合（用來算要刪哪些）
  const existing = await supabase
    .from("business_rules")
    .select("id, scope_role_code")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "purchase_authority");
  if (existing.error) {
    return { ok: false, error: mapDbError(existing.error, "撈既有規則失敗") };
  }
  const existingIds = new Set((existing.data ?? []).map((r) => r.id));
  const submittedIds = new Set(inputs.filter((i) => i.id).map((i) => i.id as string));
  const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));

  // 2. 角色重複檢查（同 brand + 同 rule_kind 不允許同 role 多筆 — 業務規則）
  const roleCodes = inputs.map((i) => i.scope_role_code);
  const dupRole = roleCodes.find((c, idx) => roleCodes.indexOf(c) !== idx);
  if (dupRole) return { ok: false, error: `角色 ${dupRole} 出現兩次，請合併` };

  // 3. 拆兩段：有 id → UPDATE；沒 id → INSERT（讓 DB DEFAULT gen_random_uuid 補）
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
      rule_kind: "purchase_authority",
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
    if (error) return { ok: false, error: mapDbError(error, "更新規則失敗") };
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from("business_rules").insert(inserts);
    if (error) return { ok: false, error: mapDbError(error, "新增規則失敗") };
  }

  // 4. DELETE 移除的 row
  if (toDelete.length > 0) {
    const { error } = await supabase
      .from("business_rules")
      .delete()
      .in("id", toDelete);
    if (error) return { ok: false, error: mapDbError(error, "刪除規則失敗") };
  }

  revalidateAll();
  return { ok: true, data: { saved: updates.length + inserts.length } };
}

// ──────────────────────────────────────────────────────────────────────────
// item_permission helpers
// ──────────────────────────────────────────────────────────────────────────

const ITEM_PERMISSIONS_REVALIDATE = ["/parts/setup/item-permissions"];

export async function getItemPermissionsPageData(): Promise<{
  rules: BusinessRuleRow[];
  roles: RoleRow[];
  canEdit: boolean;
  brandId: string;
}> {
  const [rules, roles, canEdit, scope] = await Promise.all([
    listRulesByKind("item_permission"),
    listRoles(),
    hasPermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT),
    getActiveScope(),
  ]);
  return { rules, roles, canEdit, brandId: scope.brand_id };
}

export type ItemPermissionRuleInput = {
  id?: string;
  scope_role_code: string;
  config: ItemPermissionConfig;
  sort_order?: number;
};

export async function saveItemPermissionRules(
  inputs: ItemPermissionRuleInput[],
): Promise<Result<{ saved: number }>> {
  await requirePermission(PERMISSIONS.PARTS_ITEM_PERMISSION_EDIT);

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  const updates = inputs
    .filter((i) => i.id)
    .map((i, idx) => ({
      id: i.id as string,
      config: i.config as unknown as Database["public"]["Tables"]["business_rules"]["Update"]["config"],
      sort_order: i.sort_order ?? idx + 1,
      updated_by: userId ?? null,
    }));
  const inserts = inputs
    .filter((i) => !i.id)
    .map((i, idx) => ({
      brand_id: scope.brand_id,
      rule_kind: "item_permission",
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
        config: u.config,
        sort_order: u.sort_order,
        updated_by: u.updated_by,
      })
      .eq("id", u.id);
    if (error) return { ok: false, error: mapDbError(error, "更新商品權限失敗") };
  }
  if (inserts.length > 0) {
    const { error } = await supabase.from("business_rules").insert(inserts);
    if (error) return { ok: false, error: mapDbError(error, "新增商品權限失敗") };
  }

  // 雙寫第二段：同步寫 RBAC role_permissions
  // 把 9 個 capability key 翻成對應 RBAC code、依 boolean 決定 grant/revoke
  const rbacUpdates: Array<{ role_id: string; code: string; granted: boolean }> = [];
  for (const input of inputs) {
    for (const [capKey, rbacCode] of Object.entries(ITEM_CAPABILITY_TO_RBAC)) {
      rbacUpdates.push({
        role_id: input.scope_role_code,
        code: rbacCode,
        granted: !!input.config[capKey],
      });
    }
  }
  const rbacRes = await bulkSetRolePermissions(rbacUpdates);
  if (!rbacRes.ok) return { ok: false, error: `RBAC 同步失敗：${rbacRes.error}` };

  for (const p of ITEM_PERMISSIONS_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { saved: updates.length + inserts.length } };
}

// ──────────────────────────────────────────────────────────────────────────
// alert_rule helpers（告警類型與規則）

export async function getAlertRulesPageData(): Promise<{
  rules: BusinessRuleRow[];
}> {
  const rules = await listRulesByKind("alert_rule");
  return { rules };
}

export async function getAlertEscalationPageData(): Promise<{
  rules: BusinessRuleRow[];
}> {
  const rules = await listRulesByKind("alert_escalation");
  return { rules };
}

// ──────────────────────────────────────────────────────────────────────────
// serial_tracking helpers（序列號追蹤）

export async function getSerialTrackingPageData(): Promise<{
  rules: BusinessRuleRow[];
}> {
  const rules = await listRulesByKind("serial_tracking");
  return { rules };
}

// ──────────────────────────────────────────────────────────────────────────
// control_type helpers（管控類型定義 — Phase 1 readonly）
// ──────────────────────────────────────────────────────────────────────────

export async function getControlTypesPageData(): Promise<{
  controlTypes: BusinessRuleRow[];
}> {
  const controlTypes = await listRulesByKind("control_type");
  return { controlTypes };
}

// ──────────────────────────────────────────────────────────────────────────
// count_tolerance / count_workflow helpers（盤點回傳規則）
// ──────────────────────────────────────────────────────────────────────────

const COUNT_RULES_REVALIDATE = ["/parts/setup/count-rules"];

export async function getCountRulesPageData(): Promise<{
  toleranceRule: BusinessRuleRow | null;
  workflowRules: BusinessRuleRow[];
  canEdit: boolean;
}> {
  const [toleranceList, workflowRules, canEdit] = await Promise.all([
    listRulesByKind("count_tolerance"),
    listRulesByKind("count_workflow"),
    hasPermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT),
  ]);
  return {
    toleranceRule: toleranceList[0] ?? null,
    workflowRules,
    canEdit,
  };
}

export async function saveCountToleranceRule(
  config: CountToleranceConfig,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT);

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  // 該 brand 已有 row 就 update、否則 insert
  const existing = await supabase
    .from("business_rules")
    .select("id")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "count_tolerance")
    .maybeSingle();
  if (existing.error) {
    return { ok: false, error: mapDbError(existing.error, "讀取既有規則失敗") };
  }

  if (existing.data?.id) {
    const { error } = await supabase
      .from("business_rules")
      .update({
        config: config as unknown as Database["public"]["Tables"]["business_rules"]["Update"]["config"],
        updated_by: userId ?? null,
      })
      .eq("id", existing.data.id);
    if (error) return { ok: false, error: mapDbError(error, "更新容許率規則失敗") };
    for (const p of COUNT_RULES_REVALIDATE) revalidatePath(p);
    return { ok: true, data: { id: existing.data.id } };
  }

  const { data, error } = await supabase
    .from("business_rules")
    .insert({
      brand_id: scope.brand_id,
      rule_kind: "count_tolerance",
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
  if (error) return { ok: false, error: mapDbError(error, "新增容許率規則失敗") };
  for (const p of COUNT_RULES_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id: data.id } };
}
