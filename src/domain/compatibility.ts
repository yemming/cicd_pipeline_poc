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

export async function getCompatibilityPageData(filter: {
  series?: string;
}): Promise<{
  seriesList: SeriesOption[];
  activeSeries: string | null;
  rows: CompatWithModel[];
  canEdit: boolean;
}> {
  const seriesList = await listSeries();
  const activeSeries = filter.series ?? seriesList[0]?.series ?? null;
  const [rows, canEdit] = await Promise.all([
    activeSeries ? listCompatBySeries(activeSeries) : Promise.resolve([] as CompatWithModel[]),
    hasPermission(PERMISSIONS.ITEM_EDIT),
  ]);
  return { seriesList, activeSeries, rows, canEdit };
}
