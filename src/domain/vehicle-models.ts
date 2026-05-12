"use server";

/**
 * Domain Helper — Vehicle Models（重機車型主檔）
 *
 * 跟 items 同模式：list / detail / GL binding option 全在這檔。
 * 路徑：/admin/master-data/vehicle-models
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  type CoaAccountOption,
  listPostableAccountsForItem,
} from "@/domain/items";
import { VEHICLE_MODEL_PAGE_SIZE_DEFAULT } from "@/domain/vehicle-models.constants";

export type VehicleModelRow = {
  id: string;
  brand_id: string;
  series: string;
  model_name: string;
  display_name: string;
  vehicle_type: string;
  year_start: number | null;
  year_end: number | null;
  engine_cc: number | null;
  engine_kw: number | null;
  standard_cost: number | null;
  msrp: number | null;
  is_active: boolean;
  gl_inventory_coa_id: string | null;
  gl_cogs_coa_id: string | null;
  gl_revenue_coa_id: string | null;
  default_tax_code_id: string | null;
  netsuite_segment_value_id: string | null;
  netsuite_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type VehicleModelGlAccount = {
  id: string;
  account_code: string;
  name_zh_tw: string;
};

export type VehicleModelTaxCode = {
  id: string;
  tax_code: string;
  name_zh_tw: string;
  rate: number;
  direction: string;
};

export type VehicleModelFilters = {
  q?: string;
  series?: string;
  status?: "all" | "active" | "inactive";
};

// ============================================================
// List
// ============================================================

export async function listVehicleModels(
  filters: VehicleModelFilters = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: VehicleModelRow[]; totalCount: number }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? VEHICLE_MODEL_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("vehicle_models")
    .select(
      "id, brand_id, series, model_name, display_name, vehicle_type, year_start, year_end, engine_cc, engine_kw, standard_cost, msrp, is_active, gl_inventory_coa_id, gl_cogs_coa_id, gl_revenue_coa_id, default_tax_code_id, netsuite_segment_value_id, netsuite_synced_at, created_at, updated_at",
      { count: "exact" },
    )
    .eq("brand_id", brand);

  if (filters.series && filters.series !== "all") q = q.eq("series", filters.series);
  if (filters.status === "active") q = q.eq("is_active", true);
  if (filters.status === "inactive") q = q.eq("is_active", false);
  if (filters.q?.trim()) {
    const t = filters.q.trim().replace(/[%,]/g, "");
    q = q.or(`series.ilike.%${t}%,model_name.ilike.%${t}%,display_name.ilike.%${t}%`);
  }

  const { data, count, error } = await q
    .order("series", { ascending: true })
    .order("model_name", { ascending: true })
    .range(from, to);
  if (error) throw new Error(`listVehicleModels: ${error.message}`);

  return {
    rows: (data ?? []) as unknown as VehicleModelRow[],
    totalCount: count ?? 0,
  };
}

export async function listVehicleModelSeries(): Promise<string[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("vehicle_models")
    .select("series")
    .eq("brand_id", brand)
    .eq("is_active", true);
  if (error) return [];
  const set = new Set<string>();
  for (const r of (data ?? []) as Array<{ series: string }>) {
    if (r.series) set.add(r.series);
  }
  return Array.from(set).sort();
}

// ============================================================
// Detail
// ============================================================

export async function getVehicleModelById(id: string): Promise<VehicleModelRow | null> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("vehicle_models")
    .select(
      "id, brand_id, series, model_name, display_name, vehicle_type, year_start, year_end, engine_cc, engine_kw, standard_cost, msrp, is_active, gl_inventory_coa_id, gl_cogs_coa_id, gl_revenue_coa_id, default_tax_code_id, netsuite_segment_value_id, netsuite_synced_at, created_at, updated_at",
    )
    .eq("id", id)
    .eq("brand_id", brand)
    .single();
  if (error || !data) return null;
  return data as unknown as VehicleModelRow;
}

export async function getVehicleModelGlAccounts(model: {
  gl_inventory_coa_id: string | null;
  gl_cogs_coa_id: string | null;
  gl_revenue_coa_id: string | null;
}): Promise<{
  inventory: VehicleModelGlAccount | null;
  cogs: VehicleModelGlAccount | null;
  revenue: VehicleModelGlAccount | null;
}> {
  const ids = [
    model.gl_inventory_coa_id,
    model.gl_cogs_coa_id,
    model.gl_revenue_coa_id,
  ].filter((x): x is string => !!x);
  if (ids.length === 0) return { inventory: null, cogs: null, revenue: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, name_zh_tw")
    .in("id", ids);
  if (error) return { inventory: null, cogs: null, revenue: null };

  const map = new Map(
    (data ?? []).map((c) => [
      c.id as string,
      {
        id: c.id as string,
        account_code: c.account_code as string,
        name_zh_tw: c.name_zh_tw as string,
      },
    ]),
  );
  return {
    inventory: model.gl_inventory_coa_id ? map.get(model.gl_inventory_coa_id) ?? null : null,
    cogs: model.gl_cogs_coa_id ? map.get(model.gl_cogs_coa_id) ?? null : null,
    revenue: model.gl_revenue_coa_id ? map.get(model.gl_revenue_coa_id) ?? null : null,
  };
}

export async function listTaxCodesForVehicleModel(): Promise<VehicleModelTaxCode[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tax_codes")
    .select("id, tax_code, name_zh_tw, rate, direction")
    .eq("is_active", true)
    .order("tax_code");
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    tax_code: r.tax_code as string,
    name_zh_tw: r.name_zh_tw as string,
    rate: Number(r.rate),
    direction: r.direction as string,
  }));
}

// ============================================================
// Detail Page Data（整合）
// ============================================================

export type VehicleModelDetailPageData = {
  model: VehicleModelRow;
  glAccounts: Awaited<ReturnType<typeof getVehicleModelGlAccounts>>;
  taxCode: VehicleModelTaxCode | null;
  accountOptions: CoaAccountOption[];
  taxCodeOptions: VehicleModelTaxCode[];
};

export async function getVehicleModelDetailPageData(
  id: string,
): Promise<VehicleModelDetailPageData | null> {
  const model = await getVehicleModelById(id);
  if (!model) return null;

  const [glAccounts, accountOptions, taxCodeOptions] = await Promise.all([
    getVehicleModelGlAccounts({
      gl_inventory_coa_id: model.gl_inventory_coa_id,
      gl_cogs_coa_id: model.gl_cogs_coa_id,
      gl_revenue_coa_id: model.gl_revenue_coa_id,
    }),
    listPostableAccountsForItem(),
    listTaxCodesForVehicleModel(),
  ]);

  const taxCode = model.default_tax_code_id
    ? taxCodeOptions.find((t) => t.id === model.default_tax_code_id) ?? null
    : null;

  return { model, glAccounts, taxCode, accountOptions, taxCodeOptions };
}

export async function getVehicleModelNewPageData(): Promise<{
  accountOptions: CoaAccountOption[];
  taxCodeOptions: VehicleModelTaxCode[];
  seriesOptions: string[];
}> {
  const [accountOptions, taxCodeOptions, seriesOptions] = await Promise.all([
    listPostableAccountsForItem(),
    listTaxCodesForVehicleModel(),
    listVehicleModelSeries(),
  ]);
  return { accountOptions, taxCodeOptions, seriesOptions };
}
