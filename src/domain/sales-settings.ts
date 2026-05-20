"use server";

/**
 * Domain Helper — Sales Handcard Settings（手卡參數設定）
 *
 * 涵蓋三類銷售模組共用設定：
 *   - sales_dictionary（線索來源 / 購買方式 / 接觸判別 / 付款方式 / 客戶回應 / 競品 / 保險公司 / 險種）
 *   - business_rules.sales_threshold（跟進天數 / 休眠 / 保有率）
 *   - business_rules.sales_feature_flag（試乘預約 / LINE 推播 / NPS / CPO / 個人漏斗）
 *
 * 提案：docs/proposals/feature-sales-handcard-params.md
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  SALES_DICT_KINDS,
  type SalesDictKind,
  type SalesThresholdKey,
  type SalesFlagKey,
} from "./sales-settings.constants";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type SalesDictRow = {
  id: string;
  brand_id: string;
  kind: SalesDictKind;
  code: string;
  label: string;
  description: string | null;
  is_system: boolean;
  sort_order: number;
  is_active: boolean;
};

export type SalesDictInput = {
  kind: SalesDictKind;
  code?: string;
  label: string;
  description?: string | null;
};

export type SalesThresholdConfig = {
  key: SalesThresholdKey;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  default_value: number;
  description: string;
};

export type SalesThresholdRow = {
  id: string;
  config: SalesThresholdConfig;
  sort_order: number;
};

export type SalesFlagConfig = {
  key: SalesFlagKey;
  label: string;
  enabled: boolean;
  description: string;
};

export type SalesFlagRow = {
  id: string;
  config: SalesFlagConfig;
  sort_order: number;
};

const REVALIDATE_PATH = "/sales/settings/handcard-params";
function revalidateAll() {
  revalidatePath(REVALIDATE_PATH);
}

function mapDbError(error: { code?: string; message: string }, fallback: string): string {
  if (error.code === "23505") return "代碼重複：此項目已存在";
  if (error.code === "23503") return "參照的關聯不存在";
  if (error.code === "23514") return `欄位驗證失敗：${error.message}`;
  return `${fallback}：${error.message}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Dictionary
// ──────────────────────────────────────────────────────────────────────────

export async function listSalesDictionary(filter: { kind?: SalesDictKind } = {}): Promise<SalesDictRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  let q = supabase
    .from("sales_dictionary")
    .select("id, brand_id, kind, code, label, description, is_system, sort_order, is_active")
    .eq("brand_id", scope.brand_id);
  if (filter.kind) q = q.eq("kind", filter.kind);
  const { data, error } = await q.order("kind").order("sort_order");
  if (error) throw error;
  return (data ?? []) as SalesDictRow[];
}

function slugifyCode(label: string): string {
  // 把中文轉成 timestamp-based code，純英文 / 數字保留小寫；確保 unique by (brand, kind, code)
  const ascii = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (ascii) return ascii.slice(0, 40);
  return `c_${Date.now().toString(36)}`;
}

export async function addSalesDictItem(input: SalesDictInput): Promise<Result<{ id: string }>> {
  const label = (input.label ?? "").trim();
  if (!label) return { ok: false, error: "選項名稱不可空白" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 取 max sort_order
  const { data: maxRow } = await supabase
    .from("sales_dictionary")
    .select("sort_order")
    .eq("brand_id", scope.brand_id)
    .eq("kind", input.kind)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (maxRow?.sort_order ?? 0) + 1;

  const code = (input.code?.trim() || slugifyCode(label)).slice(0, 60);

  const { data, error } = await supabase
    .from("sales_dictionary")
    .insert({
      brand_id: scope.brand_id,
      kind: input.kind,
      code,
      label,
      description: input.description?.trim() || null,
      is_system: false,
      sort_order: nextOrder,
      is_active: true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error, "新增失敗") };
  revalidateAll();
  return { ok: true, data: { id: data.id } };
}

export async function updateSalesDictItem(id: string, patch: { label?: string; description?: string | null }): Promise<Result<{ id: string }>> {
  const update: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const v = patch.label.trim();
    if (!v) return { ok: false, error: "選項名稱不可空白" };
    update.label = v;
  }
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (Object.keys(update).length === 0) return { ok: true, data: { id } };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("sales_dictionary")
    .update(update)
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "更新失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function deleteSalesDictItem(id: string): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("sales_dictionary")
    .delete()
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "刪除失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function setSalesDictItemActive(id: string, isActive: boolean): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { error } = await supabase
    .from("sales_dictionary")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "切換狀態失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

export async function moveSalesDictItem(id: string, direction: "up" | "down"): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: cur, error: e1 } = await supabase
    .from("sales_dictionary")
    .select("id, kind, sort_order")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (e1 || !cur) return { ok: false, error: "找不到該項目" };

  const op = direction === "up" ? "<" : ">";
  const order = direction === "up" ? false : true;
  const { data: neighbor } = await supabase
    .from("sales_dictionary")
    .select("id, sort_order")
    .eq("brand_id", scope.brand_id)
    .eq("kind", cur.kind)
    .filter("sort_order", op, cur.sort_order)
    .order("sort_order", { ascending: order })
    .limit(1)
    .maybeSingle();
  if (!neighbor) return { ok: true, data: { id } }; // 已經在邊界

  // 交換 sort_order
  const { error: eU1 } = await supabase
    .from("sales_dictionary")
    .update({ sort_order: neighbor.sort_order })
    .eq("id", cur.id);
  if (eU1) return { ok: false, error: mapDbError(eU1, "排序失敗") };
  const { error: eU2 } = await supabase
    .from("sales_dictionary")
    .update({ sort_order: cur.sort_order })
    .eq("id", neighbor.id);
  if (eU2) return { ok: false, error: mapDbError(eU2, "排序失敗") };

  revalidateAll();
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// Thresholds
// ──────────────────────────────────────────────────────────────────────────

export async function listSalesThresholds(): Promise<SalesThresholdRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("business_rules")
    .select("id, config, sort_order")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "sales_threshold")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    sort_order: r.sort_order,
    config: r.config as SalesThresholdConfig,
  }));
}

export async function updateSalesThreshold(id: string, value: number): Promise<Result<{ id: string }>> {
  if (!Number.isFinite(value)) return { ok: false, error: "請輸入有效數字" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: row, error: e1 } = await supabase
    .from("business_rules")
    .select("id, config")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "sales_threshold")
    .maybeSingle();
  if (e1 || !row) return { ok: false, error: "找不到該設定" };

  const cfg = row.config as SalesThresholdConfig;
  if (value < cfg.min || value > cfg.max) {
    return { ok: false, error: `數值需介於 ${cfg.min} ~ ${cfg.max} ${cfg.unit}` };
  }
  const nextCfg: SalesThresholdConfig = { ...cfg, value };

  const { error } = await supabase
    .from("business_rules")
    .update({ config: nextCfg })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "儲存失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// Feature Flags
// ──────────────────────────────────────────────────────────────────────────

export async function listSalesFeatureFlags(): Promise<SalesFlagRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("business_rules")
    .select("id, config, sort_order")
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "sales_feature_flag")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    sort_order: r.sort_order,
    config: r.config as SalesFlagConfig,
  }));
}

export async function setSalesFeatureFlag(id: string, enabled: boolean): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: row, error: e1 } = await supabase
    .from("business_rules")
    .select("id, config")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .eq("rule_kind", "sales_feature_flag")
    .maybeSingle();
  if (e1 || !row) return { ok: false, error: "找不到該開關" };

  const cfg = row.config as SalesFlagConfig;
  const nextCfg: SalesFlagConfig = { ...cfg, enabled };

  const { error } = await supabase
    .from("business_rules")
    .update({ config: nextCfg })
    .eq("id", id)
    .eq("brand_id", scope.brand_id);
  if (error) return { ok: false, error: mapDbError(error, "切換失敗") };
  revalidateAll();
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────────────────────
// Aggregate loader
// ──────────────────────────────────────────────────────────────────────────

export async function getHandcardParamsData() {
  const [dictionary, thresholds, flags] = await Promise.all([
    listSalesDictionary(),
    listSalesThresholds(),
    listSalesFeatureFlags(),
  ]);
  const byKind: Partial<Record<SalesDictKind, SalesDictRow[]>> = {};
  for (const kind of SALES_DICT_KINDS) byKind[kind] = [];
  for (const row of dictionary) {
    (byKind[row.kind] ??= []).push(row);
  }
  return { byKind, thresholds, flags };
}

export type HandcardParamsData = Awaited<ReturnType<typeof getHandcardParamsData>>;

// ──────────────────────────────────────────────────────────────────────────
// Card Config Stats — A 級 KpiCard 統計卡片
// ──────────────────────────────────────────────────────────────────────────

export type SalesCardConfigStats = {
  total_options: number;       // 三類設定總數（dict + threshold + flag）
  active_options: number;      // is_active = true 的數量
  dict_total: number;          // 字典總數
  dict_active: number;         // 字典啟用數
  threshold_count: number;     // 數值閾值數量
  flag_enabled: number;        // 已啟用 flag 數
  flag_total: number;          // flag 總數
};

export async function getSalesCardConfigStats(): Promise<SalesCardConfigStats> {
  const [dictionary, thresholds, flags] = await Promise.all([
    listSalesDictionary(),
    listSalesThresholds(),
    listSalesFeatureFlags(),
  ]);

  const dict_total = dictionary.length;
  const dict_active = dictionary.filter((r) => r.is_active).length;
  const flag_enabled = flags.filter((r) => r.config.enabled).length;

  return {
    total_options: dict_total + thresholds.length + flags.length,
    active_options: dict_active + thresholds.length + flag_enabled,
    dict_total,
    dict_active,
    threshold_count: thresholds.length,
    flag_enabled,
    flag_total: flags.length,
  };
}

export async function getCardConfigBoardData() {
  const [params, stats] = await Promise.all([
    getHandcardParamsData(),
    getSalesCardConfigStats(),
  ]);
  return { params, stats };
}

export type CardConfigBoardData = Awaited<ReturnType<typeof getCardConfigBoardData>>;
