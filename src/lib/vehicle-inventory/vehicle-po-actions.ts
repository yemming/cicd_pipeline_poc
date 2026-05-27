"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { nextVehiclePONo } from "@/domain/vehicle-purchase-orders";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/sales/inventory/purchase-orders";

export type VehiclePOItemInput = {
  vehicle_model_id: string;
  color?: string | null;
  color_code?: string | null;
  qty: number;
  unit_price_twd: number;
  unit_price_source?: number | null;
  factory_order_no?: string | null;
};

export type VehiclePOInput = {
  supplier_name?: string | null;
  order_date?: string | null;
  expected_arrival?: string | null;
  warehouse_id?: string | null;
  currency?: string | null;
  exchange_rate?: number | null;
  freight_estimate?: number | null;
  insurance_estimate?: number | null;
  customs_rate?: number | null;
  notes?: string | null;
  items: VehiclePOItemInput[];
};

function validateItems(items: VehiclePOItemInput[]): string | null {
  if (!items || items.length === 0) return "至少要有一筆車款明細";
  for (const [i, it] of items.entries()) {
    if (!it.vehicle_model_id) return `第 ${i + 1} 列：未選擇車型`;
    if (!it.qty || it.qty < 1) return `第 ${i + 1} 列：數量需 ≥ 1`;
    if (it.unit_price_twd == null || it.unit_price_twd < 0)
      return `第 ${i + 1} 列：單價不可為空或負數`;
  }
  return null;
}

/**
 * 建立採購單（單頭 + N 筆明細），並提交。
 *
 * 提交後對每筆 item 依 qty 在 new_car_inventory 建 qty 筆 in_transit row，
 * 帶 purchase_order_id 回連。這是整車供應鏈的入庫起點。
 *
 * submit=false 時只存單頭 + 明細（status='draft'），不建庫存 row（草稿）。
 */
export async function createVehiclePOAction(
  input: VehiclePOInput,
  submit = true,
): Promise<ActionResult<{ id: string; po_no: string; inventory_rows: number }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);

  const itemErr = validateItems(input.items);
  if (itemErr) return { ok: false, error: itemErr };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();
  const brand = scope.brand_id;

  const po_no = await nextVehiclePONo(brand);
  const status = submit ? "submitted" : "draft";

  // 1) 單頭
  const { data: head, error: headErr } = await supabase
    .from("vehicle_purchase_orders")
    .insert({
      brand_id: brand,
      subsidiary_id: scope.subsidiary_id,
      po_no,
      supplier_name: input.supplier_name?.trim() || null,
      order_date: input.order_date || null,
      expected_arrival: input.expected_arrival || null,
      warehouse_id: input.warehouse_id || null,
      currency: input.currency?.trim() || "TWD",
      exchange_rate: input.exchange_rate ?? 1,
      freight_estimate: input.freight_estimate ?? 0,
      insurance_estimate: input.insurance_estimate ?? 0,
      customs_rate: input.customs_rate ?? 0,
      status,
      notes: input.notes?.trim() || null,
      created_by: userId,
    })
    .select("id, po_no")
    .single();
  if (headErr) {
    if (headErr.code === "23505") return { ok: false, error: `採購單號 ${po_no} 已存在，請重試` };
    return { ok: false, error: `建立採購單失敗：${headErr.message}` };
  }

  const poId = head.id as string;

  // 2) 明細
  const itemRows = input.items.map((it, idx) => ({
    purchase_order_id: poId,
    seq: idx + 1,
    vehicle_model_id: it.vehicle_model_id,
    color: it.color?.trim() || null,
    color_code: it.color_code?.trim() || null,
    qty: it.qty,
    unit_price_twd: it.unit_price_twd,
    unit_price_source: it.unit_price_source ?? null,
    factory_order_no: it.factory_order_no?.trim() || null,
  }));
  const { error: itemsErr } = await supabase
    .from("vehicle_purchase_order_items")
    .insert(itemRows);
  if (itemsErr) {
    // rollback 單頭（POC：無交易，手動清）
    await supabase.from("vehicle_purchase_orders").delete().eq("id", poId);
    return { ok: false, error: `建立車款明細失敗：${itemsErr.message}` };
  }

  // 3) 提交 → 在 new_car_inventory 建 in_transit 庫存 row（每筆明細依 qty 展開）
  let inventoryRows = 0;
  if (submit) {
    const invRows: Record<string, unknown>[] = [];
    for (const it of input.items) {
      for (let n = 0; n < it.qty; n++) {
        invRows.push({
          brand_id: brand,
          subsidiary_id: scope.subsidiary_id,
          vehicle_model_id: it.vehicle_model_id,
          color: it.color?.trim() || null,
          cost_price: it.unit_price_twd,
          status: "in_transit",
          purchase_order_id: poId,
          created_by: userId,
        });
      }
    }
    if (invRows.length) {
      const { error: invErr } = await supabase.from("new_car_inventory").insert(invRows);
      if (invErr) {
        // rollback 單頭 + 明細（明細 ON DELETE CASCADE）
        await supabase.from("vehicle_purchase_orders").delete().eq("id", poId);
        return { ok: false, error: `建立在途車輛庫存失敗：${invErr.message}` };
      }
      inventoryRows = invRows.length;
    }
  }

  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id: poId, po_no, inventory_rows: inventoryRows } };
}

/**
 * 更新採購單單頭（明細 / 庫存 row 不在此處理）。
 */
export async function updateVehiclePOAction(
  id: string,
  patch: Partial<Omit<VehiclePOInput, "items">>,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.supplier_name !== undefined) upd.supplier_name = patch.supplier_name?.trim() || null;
  if (patch.order_date !== undefined) upd.order_date = patch.order_date || null;
  if (patch.expected_arrival !== undefined) upd.expected_arrival = patch.expected_arrival || null;
  if (patch.warehouse_id !== undefined) upd.warehouse_id = patch.warehouse_id || null;
  if (patch.currency !== undefined) upd.currency = patch.currency?.trim() || "TWD";
  if (patch.exchange_rate !== undefined) upd.exchange_rate = patch.exchange_rate ?? 1;
  if (patch.freight_estimate !== undefined) upd.freight_estimate = patch.freight_estimate ?? 0;
  if (patch.insurance_estimate !== undefined) upd.insurance_estimate = patch.insurance_estimate ?? 0;
  if (patch.customs_rate !== undefined) upd.customs_rate = patch.customs_rate ?? 0;
  if (patch.notes !== undefined) upd.notes = patch.notes?.trim() || null;

  const { error } = await supabase
    .from("vehicle_purchase_orders")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

/**
 * 切換採購單狀態。
 */
export async function setVehiclePOStatusAction(
  id: string,
  status: "draft" | "submitted" | "in_transit" | "arrived" | "closed" | "cancelled",
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("vehicle_purchase_orders")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新狀態失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

/**
 * 刪除採購單。已連帶建立 in_transit 庫存的單，先擋掉（避免孤兒在途車輛）。
 * 明細透過 FK ON DELETE CASCADE 自動清。
 */
export async function deleteVehiclePOAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 引用檢查：尚有連帶建立的車輛庫存 → 不允許硬刪
  const { count } = await supabase
    .from("new_car_inventory")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brand)
    .eq("purchase_order_id", id);
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `無法刪除：此採購單已連帶建立 ${count} 台在途車輛庫存。請改用「取消」或先處理相關車輛。`,
    };
  }

  const { error } = await supabase
    .from("vehicle_purchase_orders")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}
