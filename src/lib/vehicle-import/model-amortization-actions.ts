"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { MODEL_AMORT_RULE_KIND } from "@/domain/model-amortization";

export type ModelAmortResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) return { error: "請先登入" };
  if (!isAdmin) return { error: "需要 admin 權限" };
  return { userId };
}

export type ModelAmortInput = { model_id: string; amort_weight: number; note?: string | null };

/** upsert：同一 model 只留一條規則（以 config.model_id 比對） */
export async function saveModelAmortRuleAction(
  input: ModelAmortInput,
  ruleId?: string,
): Promise<ModelAmortResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  if (!input.model_id) return { ok: false, error: "請選擇車型" };
  if (!Number.isFinite(input.amort_weight) || input.amort_weight < 0)
    return { ok: false, error: "攤提權重需為 ≥ 0 的數字" };

  const sb = createServiceClient();
  const brandId = (await getActiveScope()).brand_id;
  const config = { model_id: input.model_id, amort_weight: input.amort_weight, note: input.note?.trim() || null };

  if (ruleId) {
    const { error } = await sb
      .from("business_rules")
      .update({ config, updated_by: gate.userId, updated_at: new Date().toISOString() })
      .eq("id", ruleId);
    if (error) return { ok: false, error: `更新失敗：${error.message}` };
    revalidatePath("/vehicle-import/model-amortization", "page");
    return { ok: true, data: { id: ruleId } };
  }

  // 防同車型重複：先查既有
  const { data: existing } = await sb
    .from("business_rules")
    .select("id")
    .eq("rule_kind", MODEL_AMORT_RULE_KIND)
    .eq("brand_id", brandId)
    .contains("config", { model_id: input.model_id })
    .limit(1)
    .maybeSingle();
  if (existing) {
    const { error } = await sb
      .from("business_rules")
      .update({ config, updated_by: gate.userId, updated_at: new Date().toISOString() })
      .eq("id", (existing as { id: string }).id);
    if (error) return { ok: false, error: `更新失敗：${error.message}` };
    revalidatePath("/vehicle-import/model-amortization", "page");
    return { ok: true, data: { id: (existing as { id: string }).id } };
  }

  const { data, error } = await sb
    .from("business_rules")
    .insert({
      brand_id: brandId,
      rule_kind: MODEL_AMORT_RULE_KIND,
      config,
      is_active: true,
      created_by: gate.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立失敗：${error.message}` };
  revalidatePath("/vehicle-import/model-amortization", "page");
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function setModelAmortActiveAction(
  ruleId: string,
  active: boolean,
): Promise<ModelAmortResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const { error } = await sb
    .from("business_rules")
    .update({ is_active: active, updated_by: gate.userId, updated_at: new Date().toISOString() })
    .eq("id", ruleId);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath("/vehicle-import/model-amortization", "page");
  return { ok: true, data: { id: ruleId } };
}

export async function deleteModelAmortRuleAction(
  ruleId: string,
): Promise<ModelAmortResult<{ id: string }>> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const sb = createServiceClient();
  const { error } = await sb.from("business_rules").delete().eq("id", ruleId);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath("/vehicle-import/model-amortization", "page");
  return { ok: true, data: { id: ruleId } };
}
