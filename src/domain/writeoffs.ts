"use server";

/**
 * Domain Helper — 庫存報廢審批 (inventory_writeoffs)
 *
 * 提供：
 *   listInventoryWriteoffs(filters) — 依品牌+狀態撈清單
 *   listWriteoffItemOptions()       — 撈該品牌的 items 給新增 modal 下拉（限 200 筆）
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type { Database } from "@/lib/database.types";

type Tables = Database["public"]["Tables"];
type WriteoffRow = Tables["inventory_writeoffs"]["Row"];

/** 報廢審批清單列 */
export type WriteoffListRow = {
  id: string;
  brand_id: string;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  qty: number;
  unit_cost: number | null;
  total_loss: number | null;
  writeoff_reason: string;
  source: string;
  workorder_id: string | null;
  status: string;
  approval_tier: string | null;
  requested_by: string | null;
  requested_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  store_id: string | null;
  created_at: string;
};

/** 品項下拉選項 */
export type WriteoffItemOption = {
  id: string;
  code: string;
  name: string;
  standard_cost: number | null;
  base_uom: string;
};

export type WriteoffFilters = {
  status?: string;
};

export async function listInventoryWriteoffs(
  filters: WriteoffFilters = {},
): Promise<{ rows: WriteoffListRow[]; totalCount: number }> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("inventory_writeoffs")
    .select(
      "id, brand_id, item_id, qty, unit_cost, total_loss, writeoff_reason, source, workorder_id, status, approval_tier, requested_by, requested_at, approved_by, approved_at, store_id, created_at",
      { count: "exact" },
    )
    .eq("brand_id", brand)
    .order("created_at", { ascending: false });

  if (filters.status) {
    q = q.eq("status", filters.status);
  }

  const { data, error, count } = await q;
  if (error) throw new Error(`listInventoryWriteoffs: ${error.message}`);

  const raw = (data ?? []) as WriteoffRow[];

  // 抓 item code/name（一次查，避免 N+1）
  const itemIds = Array.from(
    new Set(raw.map((r) => r.item_id).filter((x): x is string => !!x)),
  );

  const itemMap = new Map<string, { code: string; name: string }>();
  if (itemIds.length > 0) {
    const { data: items, error: itemErr } = await supabase
      .from("items")
      .select("id, code, name")
      .in("id", itemIds);
    if (itemErr) throw new Error(`listInventoryWriteoffs items join: ${itemErr.message}`);
    for (const item of items ?? []) {
      itemMap.set(item.id, { code: item.code, name: item.name });
    }
  }

  const rows: WriteoffListRow[] = raw.map((r) => {
    const item = r.item_id ? itemMap.get(r.item_id) : undefined;
    return {
      id: r.id,
      brand_id: r.brand_id,
      item_id: r.item_id,
      item_code: item?.code ?? null,
      item_name: item?.name ?? null,
      qty: r.qty,
      unit_cost: r.unit_cost,
      total_loss: r.total_loss,
      writeoff_reason: r.writeoff_reason,
      source: r.source,
      workorder_id: r.workorder_id,
      status: r.status,
      approval_tier: r.approval_tier,
      requested_by: r.requested_by,
      requested_at: r.requested_at,
      approved_by: r.approved_by,
      approved_at: r.approved_at,
      store_id: r.store_id,
      created_at: r.created_at,
    };
  });

  return { rows, totalCount: count ?? rows.length };
}

export async function listWriteoffItemOptions(): Promise<WriteoffItemOption[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("items")
    .select("id, code, name, standard_cost, base_uom")
    .eq("brand_id", brand)
    .eq("is_active", true)
    .order("code")
    .limit(200);

  if (error) throw new Error(`listWriteoffItemOptions: ${error.message}`);

  return (data ?? []).map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    standard_cost: r.standard_cost,
    base_uom: r.base_uom,
  }));
}
