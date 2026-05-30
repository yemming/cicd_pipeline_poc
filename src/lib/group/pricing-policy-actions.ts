"use server";

/**
 * GRP14 定價折扣設定 — server actions（第二十輪 商務管理層）
 *
 * 資料落點：business_rules（rule_kind='pricing_policy'、brand_id=indian），config jsonb 裝
 * { kind, ref_id, name, code, series, msrp, cost, disc_min, disc_max, status, effective_date,
 *   audit_log:[] }。狀態機：draft → review → active（可 reject 退回 draft）。
 *
 * 規格（CLAUDE.md §SOP）：
 *   - Result 型別、**不 redirect**（client 自控導航 + banner）。
 *   - admin gate：每個 action 檢 getCurrentUserAndAdmin().isAdmin，非 admin 回 error Result
 *     （與 /group/pricing page 同 gate；不用 requirePermission 避免 /403 redirect 破壞 Result）。
 *   - 寫入走 service client（business_rules 無 user INSERT/UPDATE policy）+ 顯式 brand_id。
 *   - 任何欄位異動 append config.audit_log[]（誰/何時/欄位/舊→新），渲染稽核時間軸。
 */

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import type { PricingKind, PricingStatus, PricingAuditEntry } from "@/domain/group-pricing";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const PAGE_PATH = "/group/pricing";

export type PricingPolicyInput = {
  kind: PricingKind;
  name: string;
  code?: string | null;
  series?: string | null;
  msrp: number | null;
  cost?: number | null;
  disc_min: number | null;
  disc_max: number | null;
  effective_date?: string | null;
};

type StoredConfig = {
  kind: PricingKind;
  ref_id: string | null;
  name: string;
  code: string | null;
  series: string | null;
  msrp: number | null;
  cost: number | null;
  disc_min: number | null;
  disc_max: number | null;
  status: PricingStatus;
  effective_date: string | null;
  audit_log: PricingAuditEntry[];
};

/** admin gate：回 { brandId, actorName } 或 error。 */
async function requireAdmin(): Promise<
  { ok: true; brandId: string; actorName: string } | { ok: false; error: string }
> {
  const { userId, isAdmin, email } = await getCurrentUserAndAdmin();
  if (!userId) return { ok: false, error: "請先登入" };
  if (!isAdmin) return { ok: false, error: "僅限管理者操作定價政策" };
  const { brand_id } = await getActiveScope();
  return { ok: true, brandId: brand_id, actorName: email ?? "管理者" };
}

/** 確定性時間戳（Asia/Taipei = UTC+8；定價稽核用，不依環境 locale）。 */
function nowStamp(): string {
  const t = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

/** 驗證折扣上下限。 */
function validateDiscount(min: number | null, max: number | null): string | null {
  if (min == null || max == null) return "折扣上下限必填";
  if (min < 50 || min > 100 || max < 50 || max > 100) return "折扣須介於 50~100 折";
  if (min > max) return "折扣下限不得高於上限";
  return null;
}

/** 讀單筆 config（service client；找不到回 null）。 */
async function loadConfig(
  brandId: string,
  id: string,
): Promise<{ config: StoredConfig } | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("business_rules")
    .select("config")
    .eq("brand_id", brandId)
    .eq("rule_kind", "pricing_policy")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  return { config: (data as { config: StoredConfig }).config };
}

export async function createPricingPolicyAction(
  input: PricingPolicyInput,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!input.name?.trim()) return { ok: false, error: "品項名稱必填" };
  if (input.msrp == null || input.msrp <= 0) return { ok: false, error: "建議售價必填且須 > 0" };
  const discErr = validateDiscount(input.disc_min, input.disc_max);
  if (discErr) return { ok: false, error: discErr };

  const config: StoredConfig = {
    kind: input.kind,
    ref_id: null,
    name: input.name.trim(),
    code: input.code?.trim() || null,
    series: input.series?.trim() || null,
    msrp: input.msrp,
    cost: input.cost ?? null,
    disc_min: input.disc_min,
    disc_max: input.disc_max,
    status: "draft",
    effective_date: input.effective_date || null,
    audit_log: [
      { by: gate.actorName, at: nowStamp(), field: "建立", old: "", new: `${input.name.trim()}（草稿）` },
    ],
  };

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("business_rules")
    .insert({ brand_id: gate.brandId, rule_kind: "pricing_policy", config, metadata: { _seed: "round20-business-mgmt" }, is_active: true })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updatePricingPolicyAction(
  id: string,
  patch: PricingPolicyInput,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!id) return { ok: false, error: "缺少 id" };
  if (!patch.name?.trim()) return { ok: false, error: "品項名稱必填" };
  if (patch.msrp == null || patch.msrp <= 0) return { ok: false, error: "建議售價必填且須 > 0" };
  const discErr = validateDiscount(patch.disc_min, patch.disc_max);
  if (discErr) return { ok: false, error: discErr };

  const existing = await loadConfig(gate.brandId, id);
  if (!existing) return { ok: false, error: "找不到此定價項目" };
  const prev = existing.config;

  // 算異動稽核
  const audits: PricingAuditEntry[] = [...(prev.audit_log ?? [])];
  const at = nowStamp();
  const diff = (field: string, oldV: unknown, newV: unknown) => {
    if (String(oldV ?? "") !== String(newV ?? "")) {
      audits.push({ by: gate.actorName, at, field, old: String(oldV ?? "—"), new: String(newV ?? "—") });
    }
  };
  diff("建議售價", prev.msrp, patch.msrp);
  diff("成本", prev.cost, patch.cost);
  diff("折扣下限", prev.disc_min, patch.disc_min);
  diff("折扣上限", prev.disc_max, patch.disc_max);
  diff("生效日", prev.effective_date, patch.effective_date);

  const config: StoredConfig = {
    ...prev,
    name: patch.name.trim(),
    code: patch.code?.trim() || null,
    series: patch.series?.trim() || prev.series,
    msrp: patch.msrp,
    cost: patch.cost ?? null,
    disc_min: patch.disc_min,
    disc_max: patch.disc_max,
    effective_date: patch.effective_date || null,
    audit_log: audits,
  };

  const svc = createServiceClient();
  const { error } = await svc
    .from("business_rules")
    .update({ config })
    .eq("brand_id", gate.brandId)
    .eq("rule_kind", "pricing_policy")
    .eq("id", id);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

/** 狀態機轉移（draft→review / review→active / review→draft）+ append 稽核。 */
async function transitionStatus(
  id: string,
  to: PricingStatus,
  expectFrom: PricingStatus[],
  fieldLabel: string,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!id) return { ok: false, error: "缺少 id" };
  const existing = await loadConfig(gate.brandId, id);
  if (!existing) return { ok: false, error: "找不到此定價項目" };
  const prev = existing.config;
  if (!expectFrom.includes(prev.status)) {
    return { ok: false, error: `目前狀態（${prev.status}）無法執行此操作` };
  }
  const audits: PricingAuditEntry[] = [
    ...(prev.audit_log ?? []),
    { by: gate.actorName, at: nowStamp(), field: "狀態", old: prev.status, new: to },
  ];
  const config: StoredConfig = { ...prev, status: to, audit_log: audits };
  const svc = createServiceClient();
  const { error } = await svc
    .from("business_rules")
    .update({ config })
    .eq("brand_id", gate.brandId)
    .eq("rule_kind", "pricing_policy")
    .eq("id", id);
  if (error) return { ok: false, error: `${fieldLabel}失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function submitPricingForReviewAction(id: string): Promise<ActionResult<{ id: string }>> {
  return transitionStatus(id, "review", ["draft"], "送審");
}

export async function approvePricingPolicyAction(id: string): Promise<ActionResult<{ id: string }>> {
  return transitionStatus(id, "active", ["review"], "核准");
}

export async function rejectPricingPolicyAction(id: string): Promise<ActionResult<{ id: string }>> {
  return transitionStatus(id, "draft", ["review"], "退回");
}

export async function deletePricingPolicyAction(id: string): Promise<ActionResult<{ id: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!id) return { ok: false, error: "缺少 id" };
  const svc = createServiceClient();
  const { error } = await svc
    .from("business_rules")
    .delete()
    .eq("brand_id", gate.brandId)
    .eq("rule_kind", "pricing_policy")
    .eq("id", id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}
