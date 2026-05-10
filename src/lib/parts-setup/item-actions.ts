"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
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
      control_type: input.control_type?.trim() || null,
      base_uom: input.base_uom?.trim() || "PCS",
      standard_cost: input.standard_cost ?? null,
      suggested_price: input.suggested_price ?? null,
      warranty_months: input.warranty_months ?? null,
      shelf_life_months: input.shelf_life_months ?? null,
      default_supplier_id: input.default_supplier_id || null,
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
      control_type: r.control_type?.trim() || null,
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

const ITEM_IMAGE_BUCKET = "parts-images";
const ITEM_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const ITEM_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function extFromMime(mime: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "bin";
}

export async function uploadItemImageAction(
  itemId: string,
  fd: FormData,
): Promise<ActionResult<{ image_url: string; storage_path: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!itemId) return { ok: false, error: "缺少商品 id" };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "未提供有效的圖檔" };
  }
  if (!ITEM_IMAGE_MIME.has(file.type)) {
    return { ok: false, error: `不支援的圖片格式：${file.type || "未知"}（僅接受 JPG/PNG/WebP/GIF）` };
  }
  if (file.size > ITEM_IMAGE_MAX_BYTES) {
    return { ok: false, error: `圖檔過大（${(file.size / 1024 / 1024).toFixed(1)}MB），上限 8MB` };
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // Confirm item belongs to this brand and load existing image_url for cleanup
  const { data: existing, error: existingErr } = await supabase
    .from("items")
    .select("id, image_url")
    .eq("id", itemId)
    .eq("brand_id", brand)
    .single();
  if (existingErr || !existing) return { ok: false, error: "找不到該商品" };

  const ext = extFromMime(file.type);
  const ts = Date.now();
  const storagePath = `${brand}/${itemId}/${ts}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from(ITEM_IMAGE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "3600",
    });
  if (upErr) return { ok: false, error: `上傳失敗：${upErr.message}` };

  const { data: pub } = supabase.storage.from(ITEM_IMAGE_BUCKET).getPublicUrl(storagePath);
  const imageUrl = pub.publicUrl;

  const { error: updErr } = await supabase
    .from("items")
    .update({ image_url: imageUrl })
    .eq("id", itemId)
    .eq("brand_id", brand);
  if (updErr) {
    await supabase.storage.from(ITEM_IMAGE_BUCKET).remove([storagePath]);
    return { ok: false, error: `更新主檔失敗：${updErr.message}` };
  }

  // Best-effort cleanup of previous image (if it was in our bucket)
  if (existing.image_url) {
    const marker = `/${ITEM_IMAGE_BUCKET}/`;
    const idx = existing.image_url.indexOf(marker);
    if (idx >= 0) {
      const oldPath = existing.image_url.slice(idx + marker.length);
      await supabase.storage.from(ITEM_IMAGE_BUCKET).remove([oldPath]);
    }
  }

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${itemId}`);
  return { ok: true, data: { image_url: imageUrl, storage_path: storagePath } };
}

export async function removeItemImageAction(
  itemId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: row } = await supabase
    .from("items")
    .select("image_url")
    .eq("id", itemId)
    .eq("brand_id", brand)
    .single();

  if (row?.image_url) {
    const marker = `/${ITEM_IMAGE_BUCKET}/`;
    const idx = row.image_url.indexOf(marker);
    if (idx >= 0) {
      const oldPath = row.image_url.slice(idx + marker.length);
      await supabase.storage.from(ITEM_IMAGE_BUCKET).remove([oldPath]);
    }
  }

  const { error } = await supabase
    .from("items")
    .update({ image_url: null })
    .eq("id", itemId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${itemId}`);
  return { ok: true, data: { id: itemId } };
}

export async function setItemImageHeightAction(
  itemId: string,
  height: number,
): Promise<ActionResult<{ id: string; height: number }>> {
  await requirePermission(PERMISSIONS.ITEM_EDIT);
  if (!itemId) return { ok: false, error: "缺少 id" };
  const h = Math.round(height);
  if (!Number.isFinite(h) || h < 80 || h > 320) {
    return { ok: false, error: "高度需介於 80–320px" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ image_display_height: h })
    .eq("id", itemId)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };
  revalidatePath(`${PAGE_PATH}/${itemId}`);
  return { ok: true, data: { id: itemId, height: h } };
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
