"use server";

/**
 * Domain Helper — Item × Vehicle Compatibility（適配設定）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type CompatRow = Tables["item_vehicle_compatibility"]["Row"];
export type VehicleModelRow = Tables["vehicle_models"]["Row"];

export type CompatWithModel = CompatRow & {
  series: string;
  model_name: string;
  display_name: string;
};

export type SeriesOption = { series: string; count: number };

export type ItemOption = {
  id: string;
  code: string;
  name: string;
  image_url: string | null;
};

export type ModelOption = {
  id: string;
  series: string;
  model_name: string;
  display_name: string;
};

export type LookupItemRow = {
  compat_id: string;
  item_id: string;
  item_code: string;
  item_name: string;
  item_image_url: string | null;
  is_verified: boolean;
  notes: string | null;
};

export async function listSeries(): Promise<SeriesOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("vehicle_models")
    .select("series")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const r of data ?? []) {
    if (!r.series) continue;
    counts.set(r.series, (counts.get(r.series) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([series, count]) => ({ series, count }));
}

export async function listCompatBySeries(series: string): Promise<CompatWithModel[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 撈該 series 的所有 vehicle_models
  const { data: models, error: mErr } = await supabase
    .from("vehicle_models")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .eq("series", series)
    .order("model_name");
  if (mErr) throw mErr;
  if (!models || models.length === 0) return [];

  const modelIds = models.map((m) => m.id);
  const modelMap = new Map(models.map((m) => [m.id, m as VehicleModelRow]));

  const { data: compat, error: cErr } = await supabase
    .from("item_vehicle_compatibility")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .in("vehicle_model_id", modelIds)
    .order("year_start", { ascending: false });
  if (cErr) throw cErr;

  return ((compat ?? []) as CompatRow[])
    .map((c) => {
      const m = c.vehicle_model_id ? modelMap.get(c.vehicle_model_id) : undefined;
      return {
        ...c,
        series: m?.series ?? "—",
        model_name: m?.model_name ?? "—",
        display_name: m?.display_name ?? "—",
      };
    })
    .filter((c) => c.series === series);
}

/** 只撈指定 id 的備件（用來把目前頁面已顯示的 compat rows 解析成 code/name），不整表撈取 */
export async function listItemsByIds(ids: string[]): Promise<ItemOption[]> {
  if (!ids.length) return [];
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("items")
    .select("id, code, name, image_url")
    .eq("brand_id", scope.brand_id)
    .in("id", ids);
  if (error) throw error;
  return (data ?? []) as ItemOption[];
}

/** 「新增適配」picker 用：輸入關鍵字才觸發 server-side 查詢，不整表下載後前端篩選 */
export async function searchItemsForCompatibility(query: string): Promise<ItemOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const t = query.trim().replace(/[%,]/g, "");
  let q = supabase
    .from("items")
    .select("id, code, name, image_url")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true);
  if (t) q = q.or(`code.ilike.%${t}%,name.ilike.%${t}%`);
  const { data, error } = await q.order("code").limit(50);
  if (error) throw error;
  return (data ?? []) as ItemOption[];
}

export async function listAllModels(): Promise<ModelOption[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("vehicle_models")
    .select("id, series, model_name, display_name")
    .eq("brand_id", scope.brand_id)
    .eq("is_active", true)
    .order("series")
    .order("model_name");
  if (error) throw error;
  return (data ?? []) as ModelOption[];
}

export async function lookupItemsByModelYear(
  vehicle_model_id: string,
  year: number,
): Promise<LookupItemRow[]> {
  if (!vehicle_model_id || !Number.isFinite(year)) return [];
  const supabase = await createClient();
  const scope = await getActiveScope();

  // 取該車型 + 年份落在 [year_start, year_end] 區間內（null 視為開放）的 compat
  const { data: compat, error: cErr } = await supabase
    .from("item_vehicle_compatibility")
    .select("id, item_id, is_verified, notes, year_start, year_end")
    .eq("brand_id", scope.brand_id)
    .eq("vehicle_model_id", vehicle_model_id);
  if (cErr) throw cErr;

  const filtered = (compat ?? []).filter((c) => {
    if (c.year_start != null && year < c.year_start) return false;
    if (c.year_end != null && year > c.year_end) return false;
    return true;
  });
  if (filtered.length === 0) return [];

  const itemIds = Array.from(new Set(filtered.map((c) => c.item_id)));
  const { data: items, error: iErr } = await supabase
    .from("items")
    .select("id, code, name, image_url, is_active")
    .eq("brand_id", scope.brand_id)
    .in("id", itemIds);
  if (iErr) throw iErr;

  const itemMap = new Map(
    (items ?? [])
      .filter((i) => i.is_active)
      .map((i) => [i.id, i] as const),
  );

  return filtered
    .map((c) => {
      const it = itemMap.get(c.item_id);
      if (!it) return null;
      return {
        compat_id: c.id,
        item_id: c.item_id,
        item_code: it.code,
        item_name: it.name,
        item_image_url: it.image_url,
        is_verified: c.is_verified,
        notes: c.notes,
      } as LookupItemRow;
    })
    .filter((r): r is LookupItemRow => r !== null)
    .sort((a, b) => a.item_code.localeCompare(b.item_code));
}

// ============================================================================
// P1-5 matrix view types — 給 compatibility-matrix.tsx 用
// ============================================================================

export type MatrixItemRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
};

export type MatrixModelCol = {
  id: string;
  series: string;
  model_name: string;
  display_name: string;
};

export type MatrixCell = {
  compat_id: string;
  year_start: number | null;
  year_end: number | null;
  notes: string | null;
  is_verified: boolean;
};

export type CompatMatrix = {
  items: MatrixItemRow[];
  models: MatrixModelCol[];
  cells: Record<string, MatrixCell>; // key = `${itemId}|${modelId}`
  categories: string[];
};

export async function getCompatibilityPageData(filter: {
  series?: string;
}): Promise<{
  seriesList: SeriesOption[];
  activeSeries: string | null;
  rows: CompatWithModel[];
  canEdit: boolean;
  items: ItemOption[];
  models: ModelOption[];
}> {
  const seriesList = await listSeries();
  const activeSeries = filter.series ?? seriesList[0]?.series ?? null;
  const [rows, canEdit, models] = await Promise.all([
    activeSeries ? listCompatBySeries(activeSeries) : Promise.resolve([] as CompatWithModel[]),
    hasPermission(PERMISSIONS.ITEM_EDIT),
    listAllModels(),
  ]);
  const items = await listItemsByIds([...new Set(rows.map((r) => r.item_id))]);
  return { seriesList, activeSeries, rows, canEdit, items, models };
}
