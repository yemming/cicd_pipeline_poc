"use server";

/**
 * Domain Helper — 備件預留（inventory_reservations）
 *
 * 第十一輪 B3 落地。proposal：docs/proposals/feature-inventory-reservations-phase1.md
 *
 * 路線 A（Ming 拍板）：reservation 維持獨立 ledger，**不改** v_stock_balances /
 * parts-balance.ts / 既有告警邏輯（available 在既有報表維持 on_hand）。
 * 可用量「扣預留」只在本 helper 的 getAvailableQty() 內算（on_hand − Σ active reservations），
 * 給工單流程用，不污染既有報表。
 *
 * 狀態機：active → consumed（領料出庫）/ released（補貨解除）/ cancelled（取消追加）
 *
 * 業務規則（POC 先寫死、不進 business_rules）：
 *   - 可用量一律扣 active 預留（deduct_from_available = true）
 *   - 同 source（source_type + source_id）不重複建 active 預留（冪等防重）
 *
 * UI 永遠走本 helper、禁止直連 supabase（天條）；helper 內部 import supabase 是它的工作。
 */

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

// ─────────────────────────────────────────────────────────────
// Result 型別（沿用 domain 慣例，client 自控導航的 ok/error pattern）
// ─────────────────────────────────────────────────────────────

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ReservationStatus = "active" | "consumed" | "released" | "cancelled";
export type ReservationSourceType = "repair_order_addon" | "repair_order" | "manual";
export type ReleaseReason = "restock" | "transfer_arrival" | "cancelled_by_user" | "issued";

export type ReservationRow = {
  id: string;
  brand_id: string;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  warehouse_id: string;
  stock_item_id: string | null;
  reserved_qty: number;
  consumed_qty: number;
  source_type: ReservationSourceType;
  source_id: string | null;
  ro_id: string | null;
  status: ReservationStatus;
  reserved_by: string | null;
  reserved_at: string;
  released_at: string | null;
  release_reason: string | null;
};

// 內部 select 投影（join items 拿 code/name）
const SELECT_COLS =
  "id, brand_id, item_id, warehouse_id, stock_item_id, reserved_qty, consumed_qty, source_type, source_id, ro_id, status, reserved_by, reserved_at, released_at, release_reason, items(code, name)";

type RawRow = {
  id: string;
  brand_id: string;
  item_id: string;
  warehouse_id: string;
  stock_item_id: string | null;
  reserved_qty: number | string;
  consumed_qty: number | string;
  source_type: ReservationSourceType;
  source_id: string | null;
  ro_id: string | null;
  status: ReservationStatus;
  reserved_by: string | null;
  reserved_at: string;
  released_at: string | null;
  release_reason: string | null;
  items: { code: string | null; name: string | null } | null;
};

function mapRow(r: RawRow): ReservationRow {
  return {
    id: r.id,
    brand_id: r.brand_id,
    item_id: r.item_id,
    item_code: r.items?.code ?? null,
    item_name: r.items?.name ?? null,
    warehouse_id: r.warehouse_id,
    stock_item_id: r.stock_item_id,
    reserved_qty: Number(r.reserved_qty),
    consumed_qty: Number(r.consumed_qty),
    source_type: r.source_type,
    source_id: r.source_id,
    ro_id: r.ro_id,
    status: r.status,
    reserved_by: r.reserved_by,
    reserved_at: r.reserved_at,
    released_at: r.released_at,
    release_reason: r.release_reason,
  };
}

// ─────────────────────────────────────────────────────────────
// Mutations（跨表 + 副作用 → server action，brand 由 active scope 鎖定）
// ─────────────────────────────────────────────────────────────

/**
 * 建立預留（CROSS-02 / SA-04）：addon agreed → reserve。
 * 冪等防重：同 (source_type, source_id) 已有 active 預留 → 直接回該筆 id，不重複建。
 * 副作用：source_type='repair_order_addon' 時回寫 repair_order_addons.reserved_at（供 addon 顯示「已預留」）。
 */
export async function reserve(input: {
  item_id: string;
  warehouse_id: string;
  stock_item_id?: string | null;
  qty: number;
  source_type: ReservationSourceType;
  source_id: string;
  ro_id?: string | null;
  note?: string;
}): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有建立備件預留的權限" };
  }
  if (!(input.qty > 0)) {
    return { ok: false, error: "預留數量必須大於 0" };
  }
  if (!input.item_id || !input.warehouse_id) {
    return { ok: false, error: "缺少 item_id 或 warehouse_id" };
  }
  if (!input.source_id) {
    return { ok: false, error: "缺少來源單據 source_id" };
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const brandId = scope.brand_id;
  const { data: { user } } = await supabase.auth.getUser();

  // 冪等防重：同 source 已有 active 預留就不重複建
  const { data: existing, error: exErr } = await supabase
    .from("inventory_reservations")
    .select("id")
    .eq("brand_id", brandId)
    .eq("source_type", input.source_type)
    .eq("source_id", input.source_id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (exErr) return { ok: false, error: `檢查既有預留失敗：${exErr.message}` };
  if (existing?.id) return { ok: true, data: { id: existing.id } };

  const metadata: Record<string, unknown> = {};
  if (input.note) metadata.note = input.note;

  const { data: row, error } = await supabase
    .from("inventory_reservations")
    .insert({
      brand_id: brandId,
      item_id: input.item_id,
      warehouse_id: input.warehouse_id,
      stock_item_id: input.stock_item_id ?? null,
      reserved_qty: input.qty,
      consumed_qty: 0,
      source_type: input.source_type,
      source_id: input.source_id,
      ro_id: input.ro_id ?? null,
      status: "active",
      reserved_by: user?.id ?? null,
      metadata,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: `建立預留失敗：${error.message}` };

  // 副作用：addon 來源 → 回寫 reserved_at 供 addon 自身顯示「已預留」
  if (input.source_type === "repair_order_addon") {
    const { error: addonErr } = await supabase
      .from("repair_order_addons")
      .update({ reserved_at: new Date().toISOString() })
      .eq("id", input.source_id)
      .eq("brand_id", brandId);
    // 回寫失敗不致命（reservation 本身已建），記 metadata 不阻斷主流程
    if (addonErr) {
      await supabase
        .from("inventory_reservations")
        .update({ metadata: { ...metadata, addon_writeback_error: addonErr.message } })
        .eq("id", row.id);
    }
  }

  return { ok: true, data: { id: row.id } };
}

/**
 * 解除預留（CROSS-03：補貨到貨 / 取消）→ 回補可用量。
 * 只能對 active 預留 release；非 active 直接回錯，避免重複解除。
 */
export async function release(
  reservationId: string,
  reason: ReleaseReason = "restock",
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有解除備件預留的權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: cur, error: curErr } = await supabase
    .from("inventory_reservations")
    .select("id, status")
    .eq("id", reservationId)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (curErr) return { ok: false, error: `查詢預留失敗：${curErr.message}` };
  if (!cur) return { ok: false, error: "找不到該預留紀錄" };
  if (cur.status !== "active") {
    return { ok: false, error: `該預留已是 ${cur.status} 狀態，無法解除` };
  }

  const { data: row, error } = await supabase
    .from("inventory_reservations")
    .update({
      status: "released",
      released_at: new Date().toISOString(),
      release_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .eq("brand_id", scope.brand_id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: `解除預留失敗：${error.message}` };
  if (!row) return { ok: false, error: "解除預留失敗（狀態已被其他作業變更）" };
  return { ok: true, data: { id: row.id } };
}

/**
 * 消耗預留（領料出庫，active → consumed）。
 * consumedQty 不給 = 全數消耗（consumed_qty = reserved_qty）。
 */
export async function consume(
  reservationId: string,
  consumedQty?: number,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有消耗備件預留的權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: cur, error: curErr } = await supabase
    .from("inventory_reservations")
    .select("id, status, reserved_qty")
    .eq("id", reservationId)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (curErr) return { ok: false, error: `查詢預留失敗：${curErr.message}` };
  if (!cur) return { ok: false, error: "找不到該預留紀錄" };
  if (cur.status !== "active") {
    return { ok: false, error: `該預留已是 ${cur.status} 狀態，無法消耗` };
  }

  const reservedQty = Number(cur.reserved_qty);
  const finalConsumed = consumedQty == null ? reservedQty : consumedQty;
  if (!(finalConsumed > 0)) {
    return { ok: false, error: "消耗數量必須大於 0" };
  }
  if (finalConsumed > reservedQty) {
    return { ok: false, error: `消耗量 ${finalConsumed} 超過預留量 ${reservedQty}` };
  }

  const { data: row, error } = await supabase
    .from("inventory_reservations")
    .update({
      status: "consumed",
      consumed_qty: finalConsumed,
      released_at: new Date().toISOString(),
      release_reason: "issued",
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .eq("brand_id", scope.brand_id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: `消耗預留失敗：${error.message}` };
  if (!row) return { ok: false, error: "消耗預留失敗（狀態已被其他作業變更）" };
  return { ok: true, data: { id: row.id } };
}

/**
 * 取消預留（addon rejected / deferred，active → cancelled）→ 回補可用量。
 */
export async function cancel(reservationId: string): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_CREATE))) {
    return { ok: false, error: "沒有取消備件預留的權限" };
  }
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: cur, error: curErr } = await supabase
    .from("inventory_reservations")
    .select("id, status")
    .eq("id", reservationId)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (curErr) return { ok: false, error: `查詢預留失敗：${curErr.message}` };
  if (!cur) return { ok: false, error: "找不到該預留紀錄" };
  if (cur.status !== "active") {
    return { ok: false, error: `該預留已是 ${cur.status} 狀態，無法取消` };
  }

  const { data: row, error } = await supabase
    .from("inventory_reservations")
    .update({
      status: "cancelled",
      released_at: new Date().toISOString(),
      release_reason: "cancelled_by_user",
      updated_at: new Date().toISOString(),
    })
    .eq("id", reservationId)
    .eq("brand_id", scope.brand_id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: `取消預留失敗：${error.message}` };
  if (!row) return { ok: false, error: "取消預留失敗（狀態已被其他作業變更）" };
  return { ok: true, data: { id: row.id } };
}

// ─────────────────────────────────────────────────────────────
// Reads（純讀，helper 內直連 supabase）
// ─────────────────────────────────────────────────────────────

/**
 * 反查：某工單預留了哪些零件（detail 頁 / 待料看板用）。
 * 預設只回非取消的（active/consumed/released）；傳 includeInactive 看全部。
 */
export async function listByWorkOrder(
  roId: string,
  opts: { includeCancelled?: boolean } = {},
): Promise<ReservationRow[]> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_VIEW))) return [];
  const supabase = await createClient();
  const scope = await getActiveScope();

  let q = supabase
    .from("inventory_reservations")
    .select(SELECT_COLS)
    .eq("brand_id", scope.brand_id)
    .eq("ro_id", roId)
    .order("reserved_at", { ascending: false });
  if (!opts.includeCancelled) q = q.neq("status", "cancelled");

  const { data, error } = await q;
  if (error) throw error;
  return ((data ?? []) as unknown as RawRow[]).map(mapRow);
}

/**
 * 反查：某 item × warehouse 的 active 預留總量（剩餘預留 = reserved_qty − consumed_qty）。
 * 可用量公式 / alert 用。
 */
export async function getReservedQty(itemId: string, warehouseId: string): Promise<number> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("inventory_reservations")
    .select("reserved_qty, consumed_qty")
    .eq("brand_id", scope.brand_id)
    .eq("item_id", itemId)
    .eq("warehouse_id", warehouseId)
    .eq("status", "active");
  if (error) throw error;
  return (data ?? []).reduce(
    (sum, r) => sum + (Number(r.reserved_qty) - Number(r.consumed_qty)),
    0,
  );
}

/**
 * 算淨可用量（available − active reservations）。
 * 路線 A：on_hand 取自既有 v_stock_balances 的 qty_available（不改該 view），
 * 再於本 helper 內減去 active 預留，給工單流程判「能不能領」用，不污染既有報表。
 */
export async function getAvailableQty(itemId: string, warehouseId: string): Promise<number> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: bal, error: balErr } = await supabase
    .from("v_stock_balances")
    .select("qty_available")
    .eq("brand_id", scope.brand_id)
    .eq("item_id", itemId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  if (balErr) throw balErr;
  const onHandAvailable = bal ? Number(bal.qty_available) : 0;

  const reserved = await getReservedQty(itemId, warehouseId);
  return onHandAvailable - reserved;
}

/**
 * CROSS-03 核心：某 item × warehouse 入庫後，找出在等這個零件的 active 預留（待料工單）。
 * 供補貨到貨後逐筆 release + 通知 work-order loop 用。
 */
export async function listActiveReservationsAwaiting(
  itemId: string,
  warehouseId: string,
): Promise<ReservationRow[]> {
  if (!(await hasPermission(PERMISSIONS.ISSUE_VIEW))) return [];
  const supabase = await createClient();
  const scope = await getActiveScope();
  const { data, error } = await supabase
    .from("inventory_reservations")
    .select(SELECT_COLS)
    .eq("brand_id", scope.brand_id)
    .eq("item_id", itemId)
    .eq("warehouse_id", warehouseId)
    .eq("status", "active")
    .order("reserved_at", { ascending: true }); // FIFO：先預留的先解除
  if (error) throw error;
  return ((data ?? []) as unknown as RawRow[]).map(mapRow);
}
