"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
import { findItemBySku } from "@/domain/items";
import { writeAuditLog } from "@/domain/audit-logs";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/setup/items";

export type ItemInput = {
  code: string;
  name: string;
  spec_description?: string;
  category?: string;
  control_type?: string;
  base_uom?: string;
  standard_cost?: number | null;
  suggested_price?: number | null;
  warranty_months?: number | null;
  shelf_life_months?: number | null;
  default_supplier_id?: string | null;
  default_lead_time_days?: number | null;
  serial_tracking_required?: boolean;
  batch_tracking_required?: boolean;
  image_url?: string | null;
  is_active?: boolean;
};

export async function createItemAction(
  input: ItemInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!input.code?.trim()) return { ok: false, error: "料號必填" };
  if (!input.name?.trim()) return { ok: false, error: "名稱必填" };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      code: input.code.trim().toUpperCase(),
      name: input.name.trim(),
      spec_description: input.spec_description?.trim() || null,
      category: input.category?.trim() || null,
      control_type: input.control_type?.trim() || "C",
      base_uom: input.base_uom?.trim() || "PCS",
      standard_cost: input.standard_cost ?? null,
      suggested_price: input.suggested_price ?? null,
      warranty_months: input.warranty_months ?? null,
      shelf_life_months: input.shelf_life_months ?? null,
      default_supplier_id: input.default_supplier_id || null,
      default_lead_time_days: input.default_lead_time_days ?? null,
      serial_tracking_required: input.serial_tracking_required ?? false,
      batch_tracking_required: input.batch_tracking_required ?? false,
      image_url: input.image_url?.trim() || null,
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "此料號已存在" };
    return { ok: false, error: `建立失敗：${error.message}` };
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id } };
}

export async function updateItemAction(
  id: string,
  patch: Partial<ItemInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const upd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (typeof v === "string") {
      upd[k] = k === "code" ? v.trim().toUpperCase() : v.trim() || null;
    } else {
      upd[k] = v;
    }
  }
  const { error } = await supabase
    .from("items")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function bulkImportItemsAction(
  rows: ItemInput[],
): Promise<ActionResult<{ inserted: number; skipped: number; errors: string[] }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!rows.length) return { ok: false, error: "未提供任何資料" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.code?.trim() || !r.name?.trim()) {
      skipped++;
      errors.push(`跳過：料號或名稱為空 (${r.code || "?"})`);
      continue;
    }
    const { error } = await supabase.from("items").insert({
      brand_id: brand,
      code: r.code.trim().toUpperCase(),
      name: r.name.trim(),
      spec_description: r.spec_description?.trim() || null,
      category: r.category?.trim() || null,
      control_type: r.control_type?.trim() || "C",
      base_uom: r.base_uom?.trim() || "PCS",
      standard_cost: r.standard_cost ?? null,
      suggested_price: r.suggested_price ?? null,
      is_active: r.is_active ?? true,
    });
    if (error) {
      skipped++;
      errors.push(`${r.code}: ${error.code === "23505" ? "已存在" : error.message}`);
    } else {
      inserted++;
    }
  }
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { inserted, skipped, errors: errors.slice(0, 20) } };
}

export async function deleteItemAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // Reference checks: don't allow hard-delete if anything still points to it
  const [stockRes, fitRes, woRes] = await Promise.all([
    supabase
      .from("stock_items")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("item_id", id),
    supabase
      .from("item_vehicle_compatibility")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("item_id", id),
    supabase
      .from("work_order_items")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("item_id", id),
  ]);

  const refs: string[] = [];
  if ((stockRes.count ?? 0) > 0) refs.push(`${stockRes.count} 筆庫存批次`);
  if ((fitRes.count ?? 0) > 0) refs.push(`${fitRes.count} 筆適配紀錄`);
  if ((woRes.count ?? 0) > 0) refs.push(`${woRes.count} 筆工單明細`);
  if (refs.length > 0) {
    return {
      ok: false,
      error: `無法刪除：尚有 ${refs.join("、")}。請改用「停用」保留歷史，或先清除引用。`,
    };
  }

  const { error } = await supabase
    .from("items")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export async function setItemActiveAction(
  id: string,
  is_active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ is_active })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

export type PriceBookRow = {
  code: string;
  name: string;
  suggested_price: number | null;
  standard_cost?: number | null;
  category?: string;
  default_supplier_id?: string | null;
};

export async function upsertPriceBookAction(
  rows: PriceBookRow[],
): Promise<ActionResult<{ created: number; updated: number; errors: string[] }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!rows.length) return { ok: false, error: "未提供任何資料" };

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const row of rows) {
    const code = row.code?.trim();
    const name = row.name?.trim();
    if (!code) {
      errors.push(`跳過：料號為空`);
      continue;
    }
    if (!name) {
      errors.push(`跳過：${code} 名稱為空`);
      continue;
    }

    try {
      const existing = await findItemBySku(code);
      if (existing) {
        // 更新：只改定價相關欄位，不碰 serial/batch/is_active
        // default_supplier_id 隨 Price Book 覆蓋（本批次指定的原廠供應商），未指定則保留原值
        const res = await updateItemAction(existing.id, {
          name,
          suggested_price: row.suggested_price ?? null,
          standard_cost: row.standard_cost ?? null,
          ...(row.default_supplier_id !== undefined
            ? { default_supplier_id: row.default_supplier_id }
            : {}),
        });
        if (res.ok) {
          updated++;
        } else {
          errors.push(`${code}: ${res.error}`);
        }
      } else {
        // 新增
        const res = await createItemAction({
          code,
          name,
          suggested_price: row.suggested_price ?? null,
          standard_cost: row.standard_cost ?? null,
          category: row.category?.trim() || undefined,
          default_supplier_id: row.default_supplier_id || null,
        });
        if (res.ok) {
          created++;
        } else {
          errors.push(`${code}: ${res.error}`);
        }
      }
    } catch (e) {
      errors.push(`${code}: ${e instanceof Error ? e.message : "未知錯誤"}`);
    }
  }

  revalidatePath(PAGE_PATH);

  const scope = await getActiveScope();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorId = user?.id ?? null;
  after(async () => {
    await writeAuditLog({
      table_name: "items",
      action: "PRICE_BOOK_IMPORTED",
      actor_id: actorId,
      brand_id: scope.brand_id,
      after: { created, updated, count: rows.length },
    });
  });

  return { ok: true, data: { created, updated, errors: errors.slice(0, 20) } };
}
