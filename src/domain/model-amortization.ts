/**
 * 車型攤提規則 domain helper — server-only（讀取層）
 *
 * 用 business_rules(rule_kind='model_amortization') 一張表存：某車型的攤提權重。
 * config = { model_id, amort_weight, note? }。
 * Landed Cost 分攤時，allocation_basis='model_amort' 的費用（車型導入費 / VSCC 車型審驗費）
 * 依各車對應車型的 amort_weight 分攤（沒設定的車型 weight=1，退化為均攤）。
 *
 * 天條：UI 只 import 本 helper / actions，不直連 supabase。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";

export const MODEL_AMORT_RULE_KIND = "model_amortization";

export type ModelAmortRule = {
  id: string;
  model_id: string;
  model_name: string | null;
  model_series: string | null;
  amort_weight: number;
  note: string | null;
  is_active: boolean;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function listModelAmortRules(): Promise<ModelAmortRule[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("business_rules")
    .select("id, config, is_active")
    .eq("rule_kind", MODEL_AMORT_RULE_KIND)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; config: Record<string, unknown>; is_active: boolean }>;
  if (rows.length === 0) return [];

  const modelIds = [...new Set(rows.map((r) => r.config?.model_id as string).filter(Boolean))];
  const nameMap = new Map<string, { name: string | null; series: string | null }>();
  if (modelIds.length) {
    const { data: mData } = await supabase
      .from("vehicle_models")
      .select("id, display_name, series")
      .in("id", modelIds);
    for (const m of (mData ?? []) as Array<{ id: string; display_name: string | null; series: string | null }>) {
      nameMap.set(m.id, { name: m.display_name, series: m.series });
    }
  }

  return rows.map((r) => {
    const modelId = (r.config?.model_id as string) ?? "";
    const meta = nameMap.get(modelId);
    return {
      id: r.id,
      model_id: modelId,
      model_name: meta?.name ?? null,
      model_series: meta?.series ?? null,
      amort_weight: num(r.config?.amort_weight, 1),
      note: (r.config?.note as string) ?? null,
      is_active: r.is_active,
    };
  });
}

/** 車型可選清單（建規則時挑車型用） */
export async function listVehicleModelOptions(): Promise<
  Array<{ id: string; display_name: string; series: string | null }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vehicle_models")
    .select("id, display_name, series")
    .eq("is_active", true)
    .order("series")
    .order("display_name");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string; display_name: string; series: string | null }>;
}
