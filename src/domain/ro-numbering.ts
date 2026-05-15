"use server";

/**
 * Domain helper — 售後工單編號規則 (RO Numbering Rules)
 *
 * 寫入 / 讀取 business_rules，rule_kind = 'ro_prefix_p1' / 'ro_prefix_p2'
 * 永遠 scope by current brand
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { AcctType } from "./ro-numbering.constants";

export type PrefixKind = "ro_prefix_p1" | "ro_prefix_p2";

export type PrefixP1Row = {
  id: string;
  brand_id: string;
  code: string;
  name: string;
  acct_type: AcctType;
  acct_label: string;
  note: string;
  is_active: boolean;
  sort_order: number;
};

export type PrefixP2Row = {
  id: string;
  brand_id: string;
  code: string;
  name: string;
  target: string;
  note: string;
  is_active: boolean;
  sort_order: number;
};

type RawRow = {
  id: string;
  brand_id: string;
  config: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
};

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asAcctType(v: unknown): AcctType {
  return v === "income" || v === "internal" || v === "claim" || v === "gray"
    ? v
    : "gray";
}

function toP1(r: RawRow): PrefixP1Row {
  return {
    id: r.id,
    brand_id: r.brand_id,
    code: s(r.config.code),
    name: s(r.config.name),
    acct_type: asAcctType(r.config.acct_type),
    acct_label: s(r.config.acct_label),
    note: s(r.config.note),
    is_active: r.is_active,
    sort_order: r.sort_order,
  };
}

function toP2(r: RawRow): PrefixP2Row {
  return {
    id: r.id,
    brand_id: r.brand_id,
    code: s(r.config.code),
    name: s(r.config.name),
    target: s(r.config.target),
    note: s(r.config.note),
    is_active: r.is_active,
    sort_order: r.sort_order,
  };
}

export async function listP1Prefixes(): Promise<PrefixP1Row[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("business_rules")
    .select("id, brand_id, config, is_active, sort_order")
    .eq("brand_id", brand)
    .eq("rule_kind", "ro_prefix_p1")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => toP1(r as RawRow));
}

export async function listP2Prefixes(): Promise<PrefixP2Row[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("business_rules")
    .select("id, brand_id, config, is_active, sort_order")
    .eq("brand_id", brand)
    .eq("rule_kind", "ro_prefix_p2")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => toP2(r as RawRow));
}
