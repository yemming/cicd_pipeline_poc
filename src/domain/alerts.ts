"use server";

/**
 * Domain Helper — Stock Thresholds & Alerts（庫存水位設定 / 告警）
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
export type StockThresholdRow = Tables["stock_thresholds"]["Row"];

export type ThresholdListRow = StockThresholdRow & {
  item_code: string | null;
  item_name: string | null;
  warehouse_name: string | null;
};

export async function listThresholds(filter: {
  abc_class?: string;
  q?: string;
} = {}): Promise<ThresholdListRow[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("stock_thresholds")
    .select("*")
    .eq("brand_id", scope.brand_id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (filter.abc_class) q = q.eq("abc_class", filter.abc_class);
  const { data: ts, error } = await q;
  if (error) throw error;
  if (!ts || ts.length === 0) return [];

  const iIds = Array.from(new Set(ts.map((t) => t.item_id).filter((x): x is string => !!x)));
  const wIds = Array.from(new Set(ts.map((t) => t.warehouse_id).filter((x): x is string => !!x)));

  const [iRes, wRes] = await Promise.all([
    iIds.length > 0
      ? supabase.from("items").select("id, code, name").in("id", iIds)
      : Promise.resolve({ data: [], error: null }),
    wIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", wIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (iRes.error) throw iRes.error;
  if (wRes.error) throw wRes.error;
  const iMap = new Map((iRes.data ?? []).map((i) => [i.id, { code: i.code ?? "", name: i.name ?? "" }]));
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));

  let rows = ts.map((t) => {
    const item = t.item_id ? iMap.get(t.item_id) : null;
    return {
      ...t,
      item_code: item?.code ?? null,
      item_name: item?.name ?? null,
      warehouse_name: t.warehouse_id ? wMap.get(t.warehouse_id) ?? null : null,
    };
  });
  if (filter.q) {
    const ql = filter.q.toLowerCase();
    rows = rows.filter(
      (r) => (r.item_code ?? "").toLowerCase().includes(ql) || (r.item_name ?? "").toLowerCase().includes(ql),
    );
  }
  return rows;
}

export async function getThresholdsPageData(filter: {
  abc_class?: string;
  q?: string;
} = {}): Promise<{
  rows: ThresholdListRow[];
  canEdit: boolean;
}> {
  const [rows, canEdit] = await Promise.all([
    listThresholds(filter),
    hasPermission(PERMISSIONS.ALERT_CONFIG),
  ]);
  return { rows, canEdit };
}
