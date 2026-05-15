"use server";

/**
 * Server actions — repair_order_lines CRUD
 *
 * Result<T> pattern。對應 spec：03_維修項目零件明細.html
 *  - addLaborLineAction / addPartLineAction
 *  - updateLaborLineAction / updatePartLineAction
 *  - deleteLineAction
 *  - updateRoDiscountAction（折扣 % 與原因）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function pagePath(roId: string) {
  return `/parts/aftersales/repair-orders/${roId}/lines`;
}
function roDetailPath(roId: string) {
  return `/parts/aftersales/repair-orders/${roId}`;
}

async function nextLineNo(roId: string): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repair_order_lines")
    .select("line_no")
    .eq("repair_order_id", roId)
    .order("line_no", { ascending: false })
    .limit(1);
  const top = (data ?? [])[0] as { line_no: number } | undefined;
  return (top?.line_no ?? 0) + 1;
}

async function ensureRoOwned(
  roId: string,
): Promise<{ ok: true; brand: string } | { ok: false; error: string }> {
  if (!roId) return { ok: false, error: "缺少 repair_order_id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("repair_orders")
    .select("id")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return { ok: false, error: "找不到該工單或無權存取" };
  return { ok: true, brand };
}

async function recomputeAndWriteRoTotals(roId: string, brand: string) {
  const supabase = await createClient();
  const { data: lines } = await supabase
    .from("repair_order_lines")
    .select("amount")
    .eq("repair_order_id", roId);
  const subtotal = ((lines ?? []) as { amount: number }[]).reduce(
    (s, l) => s + Number(l.amount ?? 0),
    0,
  );
  // 讀 discount 從 metadata
  const { data: ro } = await supabase
    .from("repair_orders")
    .select("metadata")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  const meta = ((ro?.metadata ?? {}) as Record<string, unknown>) || {};
  const discountPct = Number(meta.discount_pct ?? 0);
  const discounted = subtotal * (1 - Math.max(0, Math.min(30, discountPct)) / 100);
  const tax = Math.round(discounted * 0.05);
  const total = Math.round(discounted + tax);

  await supabase
    .from("repair_orders")
    .update({ lines_subtotal: subtotal, lines_total: total })
    .eq("id", roId)
    .eq("brand_id", brand);
}

export type LaborLineInput = {
  labor_name: string;
  labor_units: number;
  unit_price: number;
  labor_note?: string | null;
};

export async function addLaborLineAction(
  roId: string,
  input: LaborLineInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const own = await ensureRoOwned(roId);
  if (!own.ok) return own;

  const name = input.labor_name?.trim();
  if (!name) return { ok: false, error: "工項名稱不可為空" };
  const lu = Number(input.labor_units);
  const price = Number(input.unit_price);
  if (!isFinite(lu) || lu <= 0) return { ok: false, error: "工時 (LU) 需大於 0" };
  if (!isFinite(price) || price < 0) return { ok: false, error: "單位工時費不可為負" };

  const supabase = await createClient();
  const lineNo = await nextLineNo(roId);
  const amount = Math.round(lu * price);

  const { data, error } = await supabase
    .from("repair_order_lines")
    .insert({
      repair_order_id: roId,
      brand_id: own.brand,
      line_no: lineNo,
      kind: "labor",
      labor_name: name,
      labor_units: lu,
      labor_note: input.labor_note?.trim() || null,
      unit_price: price,
      amount,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `新增工項失敗：${error.message}` };

  await recomputeAndWriteRoTotals(roId, own.brand);
  revalidatePath(pagePath(roId));
  revalidatePath(roDetailPath(roId));
  return { ok: true, data: { id: data.id as string } };
}

export type PartLineInput = {
  item_id: string;
  qty: number;
  unit_price: number;
};

export async function addPartLineAction(
  roId: string,
  input: PartLineInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const own = await ensureRoOwned(roId);
  if (!own.ok) return own;

  if (!input.item_id) return { ok: false, error: "請選擇零件" };
  const qty = Number(input.qty);
  const price = Number(input.unit_price);
  if (!isFinite(qty) || qty <= 0) return { ok: false, error: "數量需大於 0" };
  if (!isFinite(price) || price < 0) return { ok: false, error: "單價不可為負" };

  const supabase = await createClient();

  const { data: item, error: itemErr } = await supabase
    .from("items")
    .select("code, name")
    .eq("id", input.item_id)
    .eq("brand_id", own.brand)
    .maybeSingle();
  if (itemErr || !item) return { ok: false, error: "找不到該零件或不屬於目前 brand" };

  const lineNo = await nextLineNo(roId);
  const amount = Math.round(qty * price);

  const { data, error } = await supabase
    .from("repair_order_lines")
    .insert({
      repair_order_id: roId,
      brand_id: own.brand,
      line_no: lineNo,
      kind: "part",
      item_id: input.item_id,
      part_code: (item as { code: string }).code,
      part_name: (item as { name: string }).name,
      qty,
      unit_price: price,
      amount,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `新增零件失敗：${error.message}` };

  await recomputeAndWriteRoTotals(roId, own.brand);
  revalidatePath(pagePath(roId));
  revalidatePath(roDetailPath(roId));
  return { ok: true, data: { id: data.id as string } };
}

export async function updateLaborLineAction(
  roId: string,
  lineId: string,
  input: LaborLineInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const own = await ensureRoOwned(roId);
  if (!own.ok) return own;
  if (!lineId) return { ok: false, error: "缺少 line id" };

  const name = input.labor_name?.trim();
  if (!name) return { ok: false, error: "工項名稱不可為空" };
  const lu = Number(input.labor_units);
  const price = Number(input.unit_price);
  if (!isFinite(lu) || lu <= 0) return { ok: false, error: "工時 (LU) 需大於 0" };
  if (!isFinite(price) || price < 0) return { ok: false, error: "單位工時費不可為負" };

  const supabase = await createClient();
  const amount = Math.round(lu * price);
  const { error } = await supabase
    .from("repair_order_lines")
    .update({
      labor_name: name,
      labor_units: lu,
      labor_note: input.labor_note?.trim() || null,
      unit_price: price,
      amount,
    })
    .eq("id", lineId)
    .eq("repair_order_id", roId)
    .eq("kind", "labor");
  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  await recomputeAndWriteRoTotals(roId, own.brand);
  revalidatePath(pagePath(roId));
  revalidatePath(roDetailPath(roId));
  return { ok: true, data: { id: lineId } };
}

export async function updatePartLineAction(
  roId: string,
  lineId: string,
  patch: { qty: number; unit_price: number },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const own = await ensureRoOwned(roId);
  if (!own.ok) return own;
  if (!lineId) return { ok: false, error: "缺少 line id" };

  const qty = Number(patch.qty);
  const price = Number(patch.unit_price);
  if (!isFinite(qty) || qty <= 0) return { ok: false, error: "數量需大於 0" };
  if (!isFinite(price) || price < 0) return { ok: false, error: "單價不可為負" };

  const supabase = await createClient();
  const amount = Math.round(qty * price);
  const { error } = await supabase
    .from("repair_order_lines")
    .update({ qty, unit_price: price, amount })
    .eq("id", lineId)
    .eq("repair_order_id", roId)
    .eq("kind", "part");
  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  await recomputeAndWriteRoTotals(roId, own.brand);
  revalidatePath(pagePath(roId));
  revalidatePath(roDetailPath(roId));
  return { ok: true, data: { id: lineId } };
}

export async function deleteLineAction(
  roId: string,
  lineId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const own = await ensureRoOwned(roId);
  if (!own.ok) return own;
  if (!lineId) return { ok: false, error: "缺少 line id" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("repair_order_lines")
    .delete()
    .eq("id", lineId)
    .eq("repair_order_id", roId);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };

  await recomputeAndWriteRoTotals(roId, own.brand);
  revalidatePath(pagePath(roId));
  revalidatePath(roDetailPath(roId));
  return { ok: true, data: { id: lineId } };
}

export async function updateRoDiscountAction(
  roId: string,
  patch: { discount_pct: number; discount_reason: string | null },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  const own = await ensureRoOwned(roId);
  if (!own.ok) return own;

  const pct = Math.max(0, Math.min(30, Number(patch.discount_pct ?? 0)));
  const supabase = await createClient();

  const { data: ro } = await supabase
    .from("repair_orders")
    .select("metadata")
    .eq("id", roId)
    .eq("brand_id", own.brand)
    .maybeSingle();
  const meta = ((ro?.metadata ?? {}) as Record<string, unknown>) || {};
  meta.discount_pct = pct;
  meta.discount_reason = patch.discount_reason?.trim() || null;

  const { error } = await supabase
    .from("repair_orders")
    .update({ metadata: meta })
    .eq("id", roId)
    .eq("brand_id", own.brand);
  if (error) return { ok: false, error: `折扣更新失敗：${error.message}` };

  await recomputeAndWriteRoTotals(roId, own.brand);
  revalidatePath(pagePath(roId));
  revalidatePath(roDetailPath(roId));
  return { ok: true, data: { id: roId } };
}
