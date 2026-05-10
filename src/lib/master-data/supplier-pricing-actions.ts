"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/admin/master-data/supplier-pricing";

export type SupplierPricingInput = {
  supplier_id: string;
  item_id: string;
  is_primary?: boolean;
  unit_price: number;
  currency?: string;
  lead_time_days: number;
  min_order_qty: number;
  order_multiple: number;
  valid_from?: string | null;
  valid_to?: string | null;
  notes?: string | null;
  is_active?: boolean;
};

function validate(input: SupplierPricingInput): string | null {
  if (!input.supplier_id) return "供應商必選";
  if (!input.item_id) return "料號必選";
  if (input.unit_price < 0) return "單價不可為負";
  if (input.lead_time_days < 0) return "前置時間不可為負";
  if (input.order_multiple <= 0) return "訂購倍數需大於 0";
  if (input.min_order_qty < 0) return "MOQ 不可為負";
  return null;
}

function normalisePayload(input: SupplierPricingInput) {
  return {
    supplier_id: input.supplier_id,
    item_id: input.item_id,
    is_primary: input.is_primary ?? false,
    unit_price: Number(input.unit_price) || 0,
    currency: (input.currency || "TWD").trim().toUpperCase(),
    lead_time_days: Math.trunc(Number(input.lead_time_days) || 0),
    min_order_qty: Number(input.min_order_qty) || 0,
    order_multiple: Number(input.order_multiple) || 1,
    valid_from: input.valid_from?.trim() || null,
    valid_to: input.valid_to?.trim() || null,
    notes: input.notes?.trim() || null,
  };
}

function mapDbError(error: { code?: string; message: string }): string {
  if (error.code === "23505" && error.message.includes("supplier_item_pricing_uniq")) {
    return "此供應商 × 料號的定價已存在 — 改編輯既有那筆";
  }
  if (error.code === "23503") {
    return "找不到對應的供應商或料號";
  }
  return `儲存失敗：${error.message}`;
}

export async function createSupplierPricingAction(
  input: SupplierPricingInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_PRICING_EDIT);
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("supplier_item_pricing")
    .insert({
      brand_id: (await getActiveScope()).brand_id,
      ...normalisePayload(input),
      is_active: input.is_active ?? true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: data.id as string } };
}

export async function updateSupplierPricingAction(
  id: string,
  patch: Partial<SupplierPricingInput>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_PRICING_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };

  if (
    patch.supplier_id !== undefined &&
    patch.item_id !== undefined &&
    patch.unit_price !== undefined &&
    patch.lead_time_days !== undefined &&
    patch.order_multiple !== undefined &&
    patch.min_order_qty !== undefined
  ) {
    const verr = validate(patch as SupplierPricingInput);
    if (verr) return { ok: false, error: verr };
  }

  const upd: Record<string, unknown> = {};
  if (patch.supplier_id !== undefined) upd.supplier_id = patch.supplier_id;
  if (patch.item_id !== undefined) upd.item_id = patch.item_id;
  if (patch.is_primary !== undefined) upd.is_primary = patch.is_primary;
  if (patch.unit_price !== undefined) upd.unit_price = Number(patch.unit_price) || 0;
  if (patch.currency !== undefined)
    upd.currency = (patch.currency || "TWD").trim().toUpperCase();
  if (patch.lead_time_days !== undefined)
    upd.lead_time_days = Math.trunc(Number(patch.lead_time_days) || 0);
  if (patch.min_order_qty !== undefined)
    upd.min_order_qty = Number(patch.min_order_qty) || 0;
  if (patch.order_multiple !== undefined)
    upd.order_multiple = Number(patch.order_multiple) || 1;
  if (patch.valid_from !== undefined) upd.valid_from = patch.valid_from?.trim() || null;
  if (patch.valid_to !== undefined) upd.valid_to = patch.valid_to?.trim() || null;
  if (patch.notes !== undefined) upd.notes = patch.notes?.trim() || null;
  if (patch.is_active !== undefined) upd.is_active = patch.is_active;

  if (Object.keys(upd).length === 0) {
    return { ok: true, data: { id } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_item_pricing")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: mapDbError(error) };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function setSupplierPricingActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_PRICING_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_item_pricing")
    .update({ is_active: active })
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `切換狀態失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteSupplierPricingAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SUPPLIER_PRICING_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("supplier_item_pricing")
    .delete()
    .eq("id", id)
    .eq("brand_id", (await getActiveScope()).brand_id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}
