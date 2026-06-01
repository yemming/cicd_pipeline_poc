/**
 * 稅則 master（HS Code 8711.x + 年度版本）domain helper — server-only
 *
 * 對應 DB 表：hs_code_tariffs。進口稅金引擎（import-tax）查率的來源。
 * 天條：UI 只 import 本 helper / tariff-actions，不直連 supabase。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { TariffRates } from "./import-tax.constants";

export type HsCodeTariffRow = {
  id: string;
  brand_id: string;
  hs_code: string;
  effective_year: number;
  displacement_min: number | null;
  displacement_max: number | null;
  plate_class: string | null;
  customs_rate: number;
  commodity_tax_rate: number;
  trade_promotion_rate: number;
  vat_rate: number;
  note: string | null;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
};

export type HsCodeTariffFilters = {
  q?: string;
  year?: string; // "all" | 年份
  plate_class?: string; // "all" | white/yellow/red
  status?: string; // "all" | active/inactive
};

const FIELDS = `
  id, brand_id, hs_code, effective_year, displacement_min, displacement_max,
  plate_class, customs_rate, commodity_tax_rate, trade_promotion_rate, vat_rate,
  note, is_active, metadata, created_at, updated_at
`.trim();

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapRow(r: Record<string, unknown>): HsCodeTariffRow {
  return {
    id: r.id as string,
    brand_id: r.brand_id as string,
    hs_code: r.hs_code as string,
    effective_year: num(r.effective_year),
    displacement_min: r.displacement_min == null ? null : num(r.displacement_min),
    displacement_max: r.displacement_max == null ? null : num(r.displacement_max),
    plate_class: (r.plate_class as string) ?? null,
    customs_rate: num(r.customs_rate),
    commodity_tax_rate: num(r.commodity_tax_rate),
    trade_promotion_rate: num(r.trade_promotion_rate),
    vat_rate: num(r.vat_rate),
    note: (r.note as string) ?? null,
    is_active: r.is_active !== false,
    metadata: (r.metadata as Record<string, unknown>) ?? {},
    created_at: (r.created_at as string) ?? null,
    updated_at: (r.updated_at as string) ?? null,
  };
}

export async function getTariffBrandId(): Promise<string> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return "indian";
  const { data } = await supabase
    .from("profile_brands")
    .select("brand_id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();
  return data?.brand_id ?? "indian";
}

export async function listHsCodeTariffs(
  filters: HsCodeTariffFilters = {},
): Promise<HsCodeTariffRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("hs_code_tariffs")
    .select(FIELDS)
    .order("effective_year", { ascending: false })
    .order("hs_code", { ascending: true });

  if (filters.year && filters.year !== "all") q = q.eq("effective_year", Number(filters.year));
  if (filters.plate_class && filters.plate_class !== "all")
    q = q.eq("plate_class", filters.plate_class);
  if (filters.status === "active") q = q.eq("is_active", true);
  else if (filters.status === "inactive") q = q.eq("is_active", false);
  if (filters.q?.trim()) {
    const t = filters.q.trim();
    q = q.or(`hs_code.ilike.%${t}%,note.ilike.%${t}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as unknown as Record<string, unknown>));
}

export async function getHsCodeTariffById(id: string): Promise<HsCodeTariffRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hs_code_tariffs")
    .select(FIELDS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapRow(data as unknown as Record<string, unknown>);
}

/** 年份下拉候選（現有資料的 distinct 年份，含明年） */
export async function listTariffYears(): Promise<number[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("hs_code_tariffs").select("effective_year");
  const years = new Set<number>((data ?? []).map((r) => num((r as { effective_year: unknown }).effective_year)));
  return Array.from(years).sort((a, b) => b - a);
}

/**
 * 給 import-tax 引擎用：依 hs_code + year 解析稅率（year 取「<= 指定年的最新版本」）。
 * 查無回 null（caller 需提示「請先建稅則」）。
 */
export async function resolveTariffRates(
  hsCode: string,
  year: number,
): Promise<(TariffRates & { id: string; effective_year: number }) | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("hs_code_tariffs")
    .select("id, effective_year, customs_rate, commodity_tax_rate, trade_promotion_rate, vat_rate")
    .eq("hs_code", hsCode)
    .eq("is_active", true)
    .lte("effective_year", year)
    .order("effective_year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id as string,
    effective_year: num(data.effective_year),
    customs_rate: num(data.customs_rate),
    commodity_tax_rate: num(data.commodity_tax_rate),
    trade_promotion_rate: num(data.trade_promotion_rate),
    vat_rate: num(data.vat_rate),
  };
}
