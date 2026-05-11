"use server";

/**
 * Domain Helper — Inventory Count Plans / Counts / Lines（盤點）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type CountPlanRow = Tables["inventory_count_plans"]["Row"];
export type CountRow = Tables["inventory_counts"]["Row"];

export type CountPlanListRow = CountPlanRow & {
  warehouse_name: string | null;
};

export type CountSessionListRow = CountRow & {
  warehouse_name: string | null;
};

export async function listCountPlans(filter: {
  is_active?: boolean;
  q?: string;
} = {}): Promise<CountPlanListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("inventory_count_plans")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("next_run_at", { ascending: true })
    .limit(200);
  if (filter.is_active !== undefined) q = q.eq("is_active", filter.is_active);
  if (filter.q) q = q.ilike("plan_name", `%${filter.q}%`);

  const { data: plans, error } = await q;
  if (error) throw error;
  if (!plans || plans.length === 0) return [];

  const wIds = Array.from(new Set(plans.map((p) => p.warehouse_id).filter((x): x is string => !!x)));
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return plans.map((p) => ({
    ...p,
    warehouse_name: p.warehouse_id ? wMap.get(p.warehouse_id) ?? null : null,
  }));
}

export async function listCountSessions(filter: {
  status?: string;
  q?: string;
} = {}): Promise<CountSessionListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("inventory_counts")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.status) q = q.eq("status", filter.status);
  const { data: counts, error } = await q;
  if (error) throw error;
  if (!counts || counts.length === 0) return [];

  const wIds = Array.from(new Set(counts.map((c) => c.warehouse_id).filter((x): x is string => !!x)));
  const wRes = wIds.length > 0
    ? await supabase.from("warehouses").select("id, name").in("id", wIds)
    : { data: [], error: null };
  if (wRes.error) throw wRes.error;
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  return counts.map((c) => ({
    ...c,
    warehouse_name: c.warehouse_id ? wMap.get(c.warehouse_id) ?? null : null,
  }));
}

export async function getCountPlansPageData(): Promise<{
  rows: CountPlanListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listCountPlans({}),
    hasPermission(PERMISSIONS.COUNT_PLAN),
  ]);
  return { rows, canEdit };
}

export async function getCountSessionsPageData(filter: {
  status?: string;
} = {}): Promise<{
  rows: CountSessionListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listCountSessions(filter),
    hasPermission(PERMISSIONS.COUNT_EXECUTE),
  ]);
  return { rows, canEdit };
}
