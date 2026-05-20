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
// alert_rule helpers（告警類型與規則）— Design pattern List + Detail
// ──────────────────────────────────────────────────────────────────────────

const ALERT_RULES_REVALIDATE = ["/parts/alerts/rules"];

export type AlertRuleFilter = {
  q?: string;
  priority?: string;
  tone?: string;
  is_active?: boolean;
};

export async function listAlertRules(
  filter: AlertRuleFilter = {},
): Promise<BusinessRuleRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("business_rules")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_rule")
    .order("sort_order", { ascending: true })
    .limit(500);
  if (filter.is_active !== undefined) q = q.eq("is_active", filter.is_active);
  const { data, error } = await q;
  if (error) throw error;
  let rows = data ?? [];
  if (filter.priority) {
    rows = rows.filter((r) => {
      const cfg = (r.config ?? {}) as Partial<AlertRuleConfig>;
      return cfg.priority === filter.priority;
    });
  }
  if (filter.tone) {
    rows = rows.filter((r) => {
      const cfg = (r.config ?? {}) as Partial<AlertRuleConfig>;
      return cfg.tone === filter.tone;
    });
  }
  if (filter.q) {
    const ql = filter.q.toLowerCase();
    rows = rows.filter((r) => {
      const cfg = (r.config ?? {}) as Partial<AlertRuleConfig>;
      return (
        (cfg.code ?? "").toLowerCase().includes(ql) ||
        (cfg.label ?? "").toLowerCase().includes(ql)
      );
    });
  }
  return rows;
}

export async function getAlertRulesPageData(
  filter: AlertRuleFilter = {},
): Promise<{
  rules: BusinessRuleRow[];
  canEdit: boolean;
}> {
  const [rules, canEdit] = await Promise.all([
    listAlertRules(filter),
    hasPermission(PERMISSIONS.ALERT_CONFIG),
  ]);
  return { rules, canEdit };
}

export async function getAlertRuleById(
  id: string,
): Promise<{ row: BusinessRuleRow; canEdit: boolean } | null> {
  if (!id) return null;
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("business_rules")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_rule")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const canEdit = await hasPermission(PERMISSIONS.ALERT_CONFIG);
  return { row: data, canEdit };
}

export type AlertRuleInput = {
  code: string;
  label: string;
  description: string;
  priority: "critical" | "high" | "normal" | "low";
  tone: "red" | "amber" | "navy" | "neutral";
  channels: string[];
  sort_order?: number;
};

function validateAlertRuleInput(input: AlertRuleInput): string | null {
  if (!input.code?.trim()) return "code 必填";
  if (!input.label?.trim()) return "名稱必填";
  if (!["critical", "high", "normal", "low"].includes(input.priority)) {
    return "priority 不合法";
  }
  if (!["red", "amber", "navy", "neutral"].includes(input.tone)) {
    return "tone 不合法";
  }
  return null;
}

export async function createAlertRuleAction(
  input: AlertRuleInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const err = validateAlertRuleInput(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  // 同 brand 不允許同 code 重複
  const dup = await supabase
    .from("business_rules")
    .select("id")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_rule")
    .contains("config", { code: input.code.trim() })
    .maybeSingle();
  if (dup.data?.id) return { ok: false, error: `code「${input.code}」已存在` };

  const config: AlertRuleConfig = {
    code: input.code.trim(),
    label: input.label.trim(),
    description: input.description?.trim() ?? "",
    priority: input.priority,
    tone: input.tone,
    channels: input.channels ?? [],
  };

  const { data, error } = await supabase
    .from("business_rules")
    .insert({
      brand_id: scope.brand_id,
      rule_kind: "alert_rule",
      scope_role_code: null,
      scope_store_id: null,
      config: config as unknown as Database["public"]["Tables"]["business_rules"]["Insert"]["config"],
      sort_order: input.sort_order ?? 99,
      is_active: true,
      created_by: userId ?? null,
      updated_by: userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "新增告警規則失敗") };
  for (const p of ALERT_RULES_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id: data.id } };
}

export async function updateAlertRuleAction(
  id: string,
  patch: Partial<AlertRuleInput>,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  // 撈現況
  const cur = await supabase
    .from("business_rules")
    .select("config")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_rule")
    .maybeSingle();
  if (cur.error) return { ok: false, error: mapDbError(cur.error, "讀取現況失敗") };
  if (!cur.data) return { ok: false, error: "規則不存在" };

  const currentCfg = (cur.data.config ?? {}) as Partial<AlertRuleConfig>;
  const next: AlertRuleConfig = {
    code: (patch.code ?? currentCfg.code ?? "").trim(),
    label: (patch.label ?? currentCfg.label ?? "").trim(),
    description: (patch.description ?? currentCfg.description ?? "").trim(),
    priority: (patch.priority ?? currentCfg.priority ?? "normal") as AlertRuleConfig["priority"],
    tone: (patch.tone ?? currentCfg.tone ?? "neutral") as AlertRuleConfig["tone"],
    channels: patch.channels ?? currentCfg.channels ?? [],
  };

  const err = validateAlertRuleInput({
    code: next.code,
    label: next.label,
    description: next.description,
    priority: next.priority,
    tone: next.tone,
    channels: next.channels,
  });
  if (err) return { ok: false, error: err };

  // 若 code 改了、檢查不重複
  if (next.code !== currentCfg.code) {
    const dup = await supabase
      .from("business_rules")
      .select("id")
      .eq("brand_id", scope.brand_id)
      .eq("rule_kind", "alert_rule")
      .neq("id", id)
      .contains("config", { code: next.code })
      .maybeSingle();
    if (dup.data?.id) return { ok: false, error: `code「${next.code}」已存在` };
  }

  const updates: Record<string, unknown> = {
    config: next as unknown as Database["public"]["Tables"]["business_rules"]["Update"]["config"],
    updated_by: userId ?? null,
  };
  if (patch.sort_order !== undefined) updates.sort_order = patch.sort_order;

  const { error } = await supabase
    .from("business_rules")
    .update(updates)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "更新告警規則失敗") };
  for (const p of ALERT_RULES_REVALIDATE) revalidatePath(p);
  revalidatePath(`/parts/alerts/rules/${id}`);
  return { ok: true, data: { id } };
}

export async function setAlertRuleActiveAction(
  id: string,
  active: boolean,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("business_rules")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_rule");
  if (error) return { ok: false, error: mapDbError(error, "切換啟用狀態失敗") };
  for (const p of ALERT_RULES_REVALIDATE) revalidatePath(p);
  revalidatePath(`/parts/alerts/rules/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteAlertRuleAction(
  id: string,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("business_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_rule");
  if (error) return { ok: false, error: mapDbError(error, "刪除告警規則失敗") };
  for (const p of ALERT_RULES_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// alert_escalation helpers（告警階層 / 升級規則）— Design pattern List + Detail
// ──────────────────────────────────────────────────────────────────────────

const ALERT_ESCALATION_REVALIDATE = ["/parts/alerts/escalation"];

export type AlertEscalationFilter = {
  q?: string;
  level?: number;
  is_active?: boolean;
};

export async function listAlertEscalations(
  filter: AlertEscalationFilter = {},
): Promise<BusinessRuleRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("business_rules")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_escalation")
    .order("sort_order", { ascending: true })
    .limit(500);
  if (filter.is_active !== undefined) q = q.eq("is_active", filter.is_active);
  const { data, error } = await q;
  if (error) throw error;
  let rows = data ?? [];
  if (filter.level !== undefined && !Number.isNaN(filter.level)) {
    rows = rows.filter((r) => {
      const cfg = (r.config ?? {}) as Partial<AlertEscalationConfig>;
      return cfg.level === filter.level;
    });
  }
  if (filter.q) {
    const ql = filter.q.toLowerCase();
    rows = rows.filter((r) => {
      const cfg = (r.config ?? {}) as Partial<AlertEscalationConfig>;
      return (cfg.label ?? "").toLowerCase().includes(ql);
    });
  }
  return rows;
}

export async function getAlertEscalationPageData(
  filter: AlertEscalationFilter = {},
): Promise<{
  rules: BusinessRuleRow[];
  canEdit: boolean;
}> {
  const [rules, canEdit] = await Promise.all([
    listAlertEscalations(filter),
    hasPermission(PERMISSIONS.ALERT_CONFIG),
  ]);
  return { rules, canEdit };
}

export async function getAlertEscalationById(
  id: string,
): Promise<{ row: BusinessRuleRow; canEdit: boolean } | null> {
  if (!id) return null;
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("business_rules")
    .select("*")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_escalation")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const canEdit = await hasPermission(PERMISSIONS.ALERT_CONFIG);
  return { row: data, canEdit };
}

export type AlertEscalationInput = {
  level: number;
  label: string;
  timeout_min: number;
  recipients: string[];
  channels: string[];
  sort_order?: number;
};

function validateAlertEscalationInput(input: AlertEscalationInput): string | null {
  if (!input.label?.trim()) return "名稱必填";
  if (!Number.isFinite(input.level) || input.level < 1) return "層級必須為正整數";
  if (!Number.isFinite(input.timeout_min) || input.timeout_min < 0) {
    return "升級延遲必須為 0 或正整數分鐘";
  }
  if (!Array.isArray(input.recipients) || input.recipients.length === 0) {
    return "通知對象至少選一項";
  }
  if (!Array.isArray(input.channels) || input.channels.length === 0) {
    return "通知通道至少選一項";
  }
  return null;
}

export async function createAlertEscalationAction(
  input: AlertEscalationInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const err = validateAlertEscalationInput(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  // 同 brand 內 level 不可重複
  const dup = await supabase
    .from("business_rules")
    .select("id")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_escalation")
    .contains("config", { level: input.level })
    .maybeSingle();
  if (dup.data?.id) return { ok: false, error: `層級 L${input.level} 已存在` };

  const config: AlertEscalationConfig = {
    level: input.level,
    label: input.label.trim(),
    timeout_min: input.timeout_min,
    recipients: input.recipients,
    channels: input.channels,
  };

  const { data, error } = await supabase
    .from("business_rules")
    .insert({
      brand_id: scope.brand_id,
      rule_kind: "alert_escalation",
      scope_role_code: null,
      scope_store_id: null,
      config: config as unknown as Database["public"]["Tables"]["business_rules"]["Insert"]["config"],
      sort_order: input.sort_order ?? input.level,
      is_active: true,
      created_by: userId ?? null,
      updated_by: userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "新增告警階層失敗") };
  for (const p of ALERT_ESCALATION_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id: data.id } };
}

export async function updateAlertEscalationAction(
  id: string,
  patch: Partial<AlertEscalationInput>,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  const cur = await supabase
    .from("business_rules")
    .select("config")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_escalation")
    .maybeSingle();
  if (cur.error) return { ok: false, error: mapDbError(cur.error, "讀取現況失敗") };
  if (!cur.data) return { ok: false, error: "規則不存在" };

  const currentCfg = (cur.data.config ?? {}) as Partial<AlertEscalationConfig>;
  const next: AlertEscalationConfig = {
    level: patch.level ?? currentCfg.level ?? 1,
    label: (patch.label ?? currentCfg.label ?? "").trim(),
    timeout_min: patch.timeout_min ?? currentCfg.timeout_min ?? 0,
    recipients: patch.recipients ?? currentCfg.recipients ?? [],
    channels: patch.channels ?? currentCfg.channels ?? [],
  };

  const err = validateAlertEscalationInput(next);
  if (err) return { ok: false, error: err };

  // level 改了 → 不可跟其他 row 撞
  if (next.level !== currentCfg.level) {
    const dup = await supabase
      .from("business_rules")
      .select("id")
      .eq("brand_id", scope.brand_id)
      .eq("rule_kind", "alert_escalation")
      .neq("id", id)
      .contains("config", { level: next.level })
      .maybeSingle();
    if (dup.data?.id) return { ok: false, error: `層級 L${next.level} 已存在` };
  }

  const updates: Record<string, unknown> = {
    config: next as unknown as Database["public"]["Tables"]["business_rules"]["Update"]["config"],
    updated_by: userId ?? null,
  };
  if (patch.sort_order !== undefined) updates.sort_order = patch.sort_order;

  const { error } = await supabase
    .from("business_rules")
    .update(updates)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "更新告警階層失敗") };
  for (const p of ALERT_ESCALATION_REVALIDATE) revalidatePath(p);
  revalidatePath(`/parts/alerts/escalation/${id}`);
  return { ok: true, data: { id } };
}

export async function setAlertEscalationActiveAction(
  id: string,
  active: boolean,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("business_rules")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_escalation");
  if (error) return { ok: false, error: mapDbError(error, "切換啟用狀態失敗") };
  for (const p of ALERT_ESCALATION_REVALIDATE) revalidatePath(p);
  revalidatePath(`/parts/alerts/escalation/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteAlertEscalationAction(
  id: string,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.ALERT_CONFIG))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("business_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "alert_escalation");
  if (error) return { ok: false, error: mapDbError(error, "刪除告警階層失敗") };
  for (const p of ALERT_ESCALATION_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// serial_tracking helpers（序列號追蹤）

const SERIAL_TRACKING_REVALIDATE = ["/parts/setup/serial"];

export async function getSerialTrackingPageData(): Promise<{
  rules: BusinessRuleRow[];
  canEdit: boolean;
}> {
  const [rules, canEdit] = await Promise.all([
    listRulesByKind("serial_tracking"),
    hasPermission(PERMISSIONS.PARTS_SERIAL_RULE_EDIT),
  ]);
  return { rules, canEdit };
}

export type SerialTrackingRuleInput = {
  /** 必填 — A/B/C 三類是 domain enum、不允許 INSERT/DELETE，只 UPDATE 既有 row */
  id: string;
  config: SerialTrackingConfig;
};

/**
 * 一次性儲存序列號追蹤規則。
 *
 * 紀律：
 *  - 只 UPDATE，不 INSERT/DELETE（A/B/C 是 domain enum、由 seed 固定 6 筆）
 *  - 不連動 items.serial_tracking_required（Stage 3 Q1 拍板：規則只是宣告層）
 *  - 不寫 audit log、不推通知（Stage 3 Q4 拍板）
 */
export async function saveSerialTrackingRules(
  inputs: SerialTrackingRuleInput[],
): Promise<Result<{ saved: number }>> {
  await requirePermission(PERMISSIONS.PARTS_SERIAL_RULE_EDIT);

  const supabase = await createClient();
  const { userId } = await getCurrentUserAndAdmin();

  for (const input of inputs) {
    if (!input.id) {
      return { ok: false, error: "缺少規則 id，無法更新" };
    }
    if (input.config.item_class === "A" && input.config.required !== true) {
      return { ok: false, error: "A 類商品必須強制序列號，不可關閉" };
    }
    const { error } = await supabase
      .from("business_rules")
      .update({
        config: input.config as unknown as Database["public"]["Tables"]["business_rules"]["Update"]["config"],
        updated_by: userId ?? null,
      })
      .eq("id", input.id)
      .eq("rule_kind", "serial_tracking");
    if (error) return { ok: false, error: mapDbError(error, "更新序列號規則失敗") };
  }

  for (const p of SERIAL_TRACKING_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { saved: inputs.length } };
}

// ──────────────────────────────────────────────────────────────────────────
// control_type helpers（管控類型定義 — A 級：含 SKU 統計與相關規則 drill-down）
// ──────────────────────────────────────────────────────────────────────────

export async function getControlTypesPageData(): Promise<{
  controlTypes: BusinessRuleRow[];
  skuCounts: { code: string; count: number }[];
  totalSkus: number;
  inactiveSkus: number;
  relatedRules: {
    purchase_authority: number;
    alert_rule: number;
    count_tolerance: number;
    count_workflow: number;
  };
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [controlTypes, skuRes, inactiveRes, purchaseAuthRes, alertRuleRes, countTolRes, countWfRes] =
    await Promise.all([
      listRulesByKind("control_type"),
      supabase
        .from("items")
        .select("control_type", { count: "exact" })
        .eq("brand_id", scope.brand_id)
        .eq("is_active", true),
      supabase
        .from("items")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .eq("is_active", false),
      supabase
        .from("business_rules")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .eq("rule_kind", "purchase_authority")
        .eq("is_active", true),
      supabase
        .from("business_rules")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .eq("rule_kind", "alert_rule")
        .eq("is_active", true),
      supabase
        .from("business_rules")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .eq("rule_kind", "count_tolerance")
        .eq("is_active", true),
      supabase
        .from("business_rules")
        .select("id", { count: "exact", head: true })
        .eq("brand_id", scope.brand_id)
        .eq("rule_kind", "count_workflow")
        .eq("is_active", true),
    ]);

  if (skuRes.error) throw new Error(`control_type skuCounts: ${skuRes.error.message}`);

  // group by control_type 在 client side 做（資料量小、避免 RPC）
  const countMap = new Map<string, number>();
  for (const row of skuRes.data ?? []) {
    const code = (row as { control_type: string | null }).control_type ?? "—";
    countMap.set(code, (countMap.get(code) ?? 0) + 1);
  }
  const skuCounts = Array.from(countMap.entries()).map(([code, count]) => ({ code, count }));
  const totalSkus = skuRes.count ?? 0;

  return {
    controlTypes,
    skuCounts,
    totalSkus,
    inactiveSkus: inactiveRes.count ?? 0,
    relatedRules: {
      purchase_authority: purchaseAuthRes.count ?? 0,
      alert_rule: alertRuleRes.count ?? 0,
      count_tolerance: countTolRes.count ?? 0,
      count_workflow: countWfRes.count ?? 0,
    },
  };
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

// ──────────────────────────────────────────────────────────────────────────
// count_workflow CRUD（盤點審核流程規則）— Phase 2 A 級升級
// ──────────────────────────────────────────────────────────────────────────

export type CountWorkflowInput = {
  category: "within" | "overflow" | "a_class_force";
  label: string;
  description: string;
  tone: "neutral" | "amber" | "red";
  badge_label: string;
  badge_kind: "teal" | "pend" | "red";
  sort_order?: number;
};

function validateCountWorkflowInput(input: CountWorkflowInput): string | null {
  if (!input.label?.trim()) return "規則名稱必填";
  if (!input.description?.trim()) return "規則描述必填";
  if (!["within", "overflow", "a_class_force"].includes(input.category)) {
    return "category 不合法";
  }
  if (!["neutral", "amber", "red"].includes(input.tone)) return "tone 不合法";
  if (!["teal", "pend", "red"].includes(input.badge_kind)) return "badge_kind 不合法";
  if (!input.badge_label?.trim()) return "徽章文字必填";
  return null;
}

function inputToWorkflowConfig(input: CountWorkflowInput): CountWorkflowConfig {
  return {
    category: input.category,
    label: input.label.trim(),
    description: input.description.trim(),
    tone: input.tone,
    badge: { label: input.badge_label.trim(), kind: input.badge_kind },
  };
}

export async function createCountWorkflowAction(
  input: CountWorkflowInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const err = validateCountWorkflowInput(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  // 同 brand 內同 category 不可重複（業務規則：每個情境只能有一條規則）
  const dup = await supabase
    .from("business_rules")
    .select("id")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "count_workflow")
    .contains("config", { category: input.category })
    .maybeSingle();
  if (dup.data?.id) {
    return { ok: false, error: `情境「${input.category}」已存在，請改編輯既有規則` };
  }

  const config = inputToWorkflowConfig(input);
  const { data, error } = await supabase
    .from("business_rules")
    .insert({
      brand_id: scope.brand_id,
      rule_kind: "count_workflow",
      scope_role_code: null,
      scope_store_id: null,
      config: config as unknown as Database["public"]["Tables"]["business_rules"]["Insert"]["config"],
      sort_order: input.sort_order ?? 99,
      is_active: true,
      created_by: userId ?? null,
      updated_by: userId ?? null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "新增審核流程規則失敗") };
  for (const p of COUNT_RULES_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id: data.id } };
}

export async function updateCountWorkflowAction(
  id: string,
  patch: Partial<CountWorkflowInput>,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  const cur = await supabase
    .from("business_rules")
    .select("config")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "count_workflow")
    .maybeSingle();
  if (cur.error) return { ok: false, error: mapDbError(cur.error, "讀取現況失敗") };
  if (!cur.data) return { ok: false, error: "規則不存在" };

  const curCfg = (cur.data.config ?? {}) as Partial<CountWorkflowConfig>;
  const curBadge = curCfg.badge ?? { label: "", kind: "teal" as const };
  const merged: CountWorkflowInput = {
    category: (patch.category ?? curCfg.category ?? "within") as CountWorkflowInput["category"],
    label: patch.label ?? curCfg.label ?? "",
    description: patch.description ?? curCfg.description ?? "",
    tone: (patch.tone ?? curCfg.tone ?? "neutral") as CountWorkflowInput["tone"],
    badge_label: patch.badge_label ?? curBadge.label ?? "",
    badge_kind: (patch.badge_kind ?? curBadge.kind ?? "teal") as CountWorkflowInput["badge_kind"],
  };
  const err = validateCountWorkflowInput(merged);
  if (err) return { ok: false, error: err };

  // category 改了 → 檢查不撞其他 row
  if (merged.category !== curCfg.category) {
    const dup = await supabase
      .from("business_rules")
      .select("id")
      .eq("brand_id", scope.brand_id)
      .eq("rule_kind", "count_workflow")
      .neq("id", id)
      .contains("config", { category: merged.category })
      .maybeSingle();
    if (dup.data?.id) {
      return { ok: false, error: `情境「${merged.category}」已存在` };
    }
  }

  const config = inputToWorkflowConfig(merged);
  const updates: Record<string, unknown> = {
    config: config as unknown as Database["public"]["Tables"]["business_rules"]["Update"]["config"],
    updated_by: userId ?? null,
  };
  if (patch.sort_order !== undefined) updates.sort_order = patch.sort_order;

  const { error } = await supabase
    .from("business_rules")
    .update(updates)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "更新審核流程規則失敗") };
  for (const p of COUNT_RULES_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id } };
}

export async function setCountWorkflowActiveAction(
  id: string,
  active: boolean,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("business_rules")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "count_workflow");
  if (error) return { ok: false, error: mapDbError(error, "切換啟用狀態失敗") };
  for (const p of COUNT_RULES_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id } };
}

export async function deleteCountWorkflowAction(
  id: string,
): Promise<Result<{ id: string }>> {
  if (!id) return { ok: false, error: "缺 id" };
  if (!(await hasPermission(PERMISSIONS.PARTS_COUNT_RULE_EDIT))) {
    return { ok: false, error: "沒有編輯權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("business_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "count_workflow");
  if (error) return { ok: false, error: mapDbError(error, "刪除審核流程規則失敗") };
  for (const p of COUNT_RULES_REVALIDATE) revalidatePath(p);
  return { ok: true, data: { id } };
}
