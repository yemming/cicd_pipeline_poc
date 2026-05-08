"use server";

import { revalidatePath } from "next/cache";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/serial";

const ALLOWED_COLORS = new Set([
  "red",
  "amber",
  "teal",
  "green",
  "navy",
  "gray",
]);

function trim(v: string | null | undefined): string {
  return (v ?? "").trim();
}
function nullable(v: string | null | undefined): string | null {
  const s = trim(v);
  return s.length === 0 ? null : s;
}
function pickColor(v: string | undefined, fallback: string): string {
  return ALLOWED_COLORS.has(String(v)) ? (v as string) : fallback;
}

export type SerialRuleInput = {
  class_code: string;
  rule_label: string;
  is_required?: boolean;
  is_locked?: boolean;
  description?: string;
  panel_color?: string;
  is_active?: boolean;
  sort_order?: number;
};

export async function createSerialRuleAction(
  input: SerialRuleInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_SERIAL_RULE_EDIT);
  if (!trim(input.class_code)) return { ok: false, error: "類別代碼必填" };
  if (!trim(input.rule_label)) return { ok: false, error: "規則標籤必填" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_serial_tracking_rules")
    .insert({
      brand_id: getBrandKey(),
      class_code: trim(input.class_code).toUpperCase(),
      rule_label: trim(input.rule_label),
      is_required: input.is_required ?? false,
      is_locked: input.is_locked ?? false,
      description: nullable(input.description),
      panel_color: pickColor(input.panel_color, "gray"),
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 99,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: "此類別已有規則，請改用編輯" };
    return { ok: false, error: `建立規則失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateSerialRuleAction(
  id: string,
  input: Partial<SerialRuleInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_SERIAL_RULE_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少規則 id" };

  const patch: Record<string, unknown> = {};
  if (input.class_code !== undefined)
    patch.class_code = trim(input.class_code).toUpperCase();
  if (input.rule_label !== undefined)
    patch.rule_label = trim(input.rule_label);
  if (input.is_required !== undefined) patch.is_required = !!input.is_required;
  if (input.is_locked !== undefined) patch.is_locked = !!input.is_locked;
  if (input.description !== undefined)
    patch.description = nullable(input.description);
  if (input.panel_color !== undefined)
    patch.panel_color = pickColor(input.panel_color, "gray");
  if (input.is_active !== undefined) patch.is_active = !!input.is_active;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;

  if (Object.keys(patch).length === 0)
    return { ok: false, error: "沒有要更新的欄位" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_serial_tracking_rules")
    .update(patch)
    .eq("id", id)
    .eq("brand_id", getBrandKey())
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: "代碼衝突" };
    return { ok: false, error: `更新規則失敗：${error.message}` };
  }
  if (!data) return { ok: false, error: "找不到規則或無權限" };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function deleteSerialRuleAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.PARTS_SERIAL_RULE_EDIT);
  if (!trim(id)) return { ok: false, error: "缺少規則 id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("parts_serial_tracking_rules")
    .delete()
    .eq("id", id)
    .eq("brand_id", getBrandKey());
  if (error) return { ok: false, error: `刪除規則失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

// ──────────────────────────────────────────────────────────
// Serial number lookup（讀 stock_items.serial_no）
// ──────────────────────────────────────────────────────────

export type SerialLookupResult = {
  serial_no: string;
  qty: number;
  status: string | null;
  warehouse_name: string | null;
  bin_code: string | null;
  item_name: string | null;
  item_code: string | null;
  warranty_start: string | null;
  warranty_end: string | null;
  last_movement_at: string | null;
};

export async function lookupSerialAction(
  serialNo: string,
): Promise<ActionResult<SerialLookupResult[]>> {
  await requirePermission(PERMISSIONS.PARTS_SERIAL_RULE_VIEW);
  const sn = trim(serialNo);
  if (sn.length < 2)
    return { ok: false, error: "序列號至少 2 字元" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select(
      "serial_no, qty, status, warranty_start, warranty_end, last_movement_at, " +
        "warehouses(name), warehouse_bins(code), items(name, code)",
    )
    .eq("brand_id", getBrandKey())
    .ilike("serial_no", `%${sn}%`)
    .limit(20);

  if (error) return { ok: false, error: `查詢失敗：${error.message}` };

  type StockItemJoin = {
    serial_no: string | null;
    qty: number | string | null;
    status: string | null;
    warranty_start: string | null;
    warranty_end: string | null;
    last_movement_at: string | null;
    warehouses: { name?: string | null } | null;
    warehouse_bins: { code?: string | null } | null;
    items: { name?: string | null; code?: string | null } | null;
  };

  const rows: SerialLookupResult[] = ((data ?? []) as unknown as StockItemJoin[]).map(
    (r) => ({
      serial_no: r.serial_no ?? "",
      qty: Number(r.qty ?? 0),
      status: r.status ?? null,
      warehouse_name: r.warehouses?.name ?? null,
      bin_code: r.warehouse_bins?.code ?? null,
      item_name: r.items?.name ?? null,
      item_code: r.items?.code ?? null,
      warranty_start: r.warranty_start ?? null,
      warranty_end: r.warranty_end ?? null,
      last_movement_at: r.last_movement_at ?? null,
    }),
  );

  return { ok: true, data: rows };
}
