"use server";

/**
 * Domain Helper — 環檢項目設定（接待預檢 wizard Step 1）
 *
 * 單張 business_rules row per brand，rule_kind='env_check_items'。
 * config jsonb 儲存 array of { code, label, sort_order, is_active }。
 *
 * 用途：
 *   - listEnvCheckItems(brandId) → wizard Step 1 預設清單來源（取代 hardcoded DEFAULT_CHECKS）
 *   - updateEnvCheckItems(brandId, items) → 主管 setting page 整段覆寫
 *
 * 對應頁面：/parts/aftersales/management/env-check-items
 *
 * 注意：item.label 是 wizard metadata.checks 的 stable key（用 label 比對既有勾選），
 *      改 label 不會破壞歷史記錄（找不到對應 label 的舊勾選會顯示為「未檢」）。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

const RULE_KIND = "env_check_items";
const WIZARD_REVALIDATE = "/parts/aftersales/pre-inspections";
const SETTING_REVALIDATE = "/parts/aftersales/management/env-check-items";

export type EnvCheckItem = {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
};

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "資料衝突：環檢項目設定已存在";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  return `${fallback}：${error.message}`;
}

function normalizeItems(raw: unknown): EnvCheckItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Partial<EnvCheckItem>;
      return {
        code: typeof o.code === "string" ? o.code : "",
        label: typeof o.label === "string" ? o.label : "",
        sort_order: typeof o.sort_order === "number" ? o.sort_order : 99,
        is_active: typeof o.is_active === "boolean" ? o.is_active : true,
      };
    })
    .filter((i) => i.code && i.label);
}

/**
 * 列出當前 brand（或指定 brand）的環檢項目，依 sort_order 排序。
 * `activeOnly=true`（預設）→ 只回啟用項（wizard 用）；
 * `activeOnly=false` → 全部（setting page 用）。
 */
export async function listEnvCheckItems(
  options: { brandId?: string; activeOnly?: boolean } = {},
): Promise<EnvCheckItem[]> {
  const supabase = await createClient();
  const brandId = options.brandId ?? (await getActiveScope()).brand_id;
  const activeOnly = options.activeOnly ?? true;

  const { data, error } = await supabase
    .from("business_rules")
    .select("config")
    .eq("brand_id", brandId)
    .eq("rule_kind", RULE_KIND)
    .is("scope_store_id", null)
    .is("scope_subsidiary_id", null)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;

  const items = normalizeItems(data?.config);
  const filtered = activeOnly ? items.filter((i) => i.is_active) : items;
  return filtered.sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * 取目前 brand 的 row id（沒 row 時回 null，setting page 用來顯示 updated_at）。
 */
export async function getEnvCheckItemsRow(): Promise<{
  id: string | null;
  updated_at: string | null;
}> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("business_rules")
    .select("id, updated_at")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", RULE_KIND)
    .is("scope_store_id", null)
    .is("scope_subsidiary_id", null)
    .maybeSingle();

  if (error && error.code !== "PGRST116") throw error;
  if (!data) return { id: null, updated_at: null };
  return { id: data.id, updated_at: data.updated_at ?? null };
}

function validateItems(items: EnvCheckItem[]): string | null {
  if (items.length === 0) return "至少要保留一個環檢項目";
  if (items.length > 50) return "環檢項目最多 50 個";
  const codes = new Set<string>();
  const labels = new Set<string>();
  for (const it of items) {
    const code = it.code.trim();
    const label = it.label.trim();
    if (!code) return "項目代碼不可空白";
    if (!/^[a-z][a-z0-9_]{0,30}$/i.test(code))
      return `項目代碼「${code}」格式錯：英數底線、開頭字母、最多 31 字`;
    if (!label) return "項目名稱不可空白";
    if (label.length > 60) return `項目名稱「${label}」超過 60 字`;
    if (codes.has(code)) return `項目代碼「${code}」重複`;
    if (labels.has(label)) return `項目名稱「${label}」重複`;
    codes.add(code);
    labels.add(label);
  }
  return null;
}

/**
 * 整段覆寫當前 brand 的環檢項目清單。
 * - 排序：caller 控制 sort_order（也可由本 helper 重排，這裡保留 caller 給的順序值）
 * - 沒有 row → insert；有 row → update config
 */
export async function updateEnvCheckItems(
  rawItems: EnvCheckItem[],
): Promise<Result<{ id: string }>> {
  const items = (rawItems ?? []).map((it, idx) => ({
    code: it.code.trim(),
    label: it.label.trim(),
    sort_order: typeof it.sort_order === "number" ? it.sort_order : idx + 1,
    is_active: !!it.is_active,
  }));

  const err = validateItems(items);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: existing } = await supabase
    .from("business_rules")
    .select("id")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", RULE_KIND)
    .is("scope_store_id", null)
    .is("scope_subsidiary_id", null)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("business_rules")
      .update({ config: items, is_active: true })
      .eq("id", existing.id);
    if (error) return { ok: false, error: mapDbError(error, "儲存失敗") };
    revalidatePath(SETTING_REVALIDATE);
    revalidatePath(WIZARD_REVALIDATE);
    return { ok: true, data: { id: existing.id } };
  }

  const { data, error } = await supabase
    .from("business_rules")
    .insert({
      brand_id: scope.brand_id,
      rule_kind: RULE_KIND,
      config: items,
      is_active: true,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "建立失敗") };
  revalidatePath(SETTING_REVALIDATE);
  revalidatePath(WIZARD_REVALIDATE);
  return { ok: true, data: { id: data.id } };
}
