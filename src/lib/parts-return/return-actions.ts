"use server";

/**
 * Server actions — 退料閉環倉管確認 + 技師主動退料
 *
 * confirmReturnRequestAction：倉管在 /parts/receipt/return-in Tab B 實物核對後確認。
 *  - full_return    → 庫存回補（insert 一筆 available stock_item，與 parts-return-in 一致）
 *  - damage_writeoff→ 損耗核銷（insert inventory_writeoffs，不回補）
 *  - 差額（confirmedQty < qty_requested）→ 差額核銷（再 insert 一筆 writeoff）
 *
 * createTechUnusedReturnAction：技師領料後用不到，主動發起退料待確認。
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { writeAuditLog } from "@/domain/audit-logs";
import { calcApprovalTier } from "@/lib/parts-count/writeoff-core";
import {
  getDefaultPartsWarehouseId,
  createReturnRequestsBatch,
} from "@/domain/parts-return-requests";
import { getTodayClosingTime } from "@/domain/aftersales-settings";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** 內部：直接寫一筆 inventory_writeoffs（沿用 self/manager/store_manager 審批層級） */
async function insertWriteoff(params: {
  brand_id: string;
  item_id: string | null;
  qty: number;
  unit_cost: number;
  writeoff_reason: string;
  workorder_id?: string | null;
  store_id?: string | null;
  requested_by: string | null;
}): Promise<string | null> {
  if (!params.item_id || params.qty <= 0) return null;
  const sb = await createClient();
  const totalLoss = params.qty * params.unit_cost;
  const tier = calcApprovalTier(totalLoss);
  const status = tier === "self" ? "approved" : "pending";
  const now = new Date().toISOString();
  const { data, error } = await sb
    .from("inventory_writeoffs")
    .insert({
      brand_id: params.brand_id,
      item_id: params.item_id,
      qty: params.qty,
      unit_cost: params.unit_cost,
      total_loss: totalLoss,
      writeoff_reason: params.writeoff_reason,
      source: "return_writeoff",
      workorder_id: params.workorder_id ?? null,
      store_id: params.store_id ?? null,
      status,
      approval_tier: tier,
      requested_by: params.requested_by,
      requested_at: now,
      approved_by: tier === "self" ? params.requested_by : null,
      approved_at: tier === "self" ? now : null,
    })
    .select("id")
    .single();
  if (error) {
    console.error("[return-confirm] insert writeoff error", error);
    return null;
  }
  return (data as { id: string }).id;
}

export async function confirmReturnRequestAction(
  requestId: string,
  confirmedQty: number,
  returnType: "full_return" | "damage_writeoff" = "full_return",
  note?: string,
  shortfall?: { mode: "writeoff" | "ignore"; reason?: string },
): Promise<ActionResult<{ id: string; restocked: number; writeoff_qty: number }>> {
  await requirePermission(PERMISSIONS.RECEIPT_CREATE);
  if (!requestId) return { ok: false, error: "缺少退料記錄 ID" };
  if (!(confirmedQty >= 0)) return { ok: false, error: "確認數量不合法" };

  const sb = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: req, error: loadErr } = await sb
    .from("parts_return_requests")
    .select("*")
    .eq("id", requestId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (loadErr || !req) return { ok: false, error: "找不到退料待確認記錄" };
  if (req.status === "confirmed")
    return { ok: false, error: "此退料記錄已確認，無需重複操作" };

  const qtyRequested = Number(req.qty_requested ?? 0);
  const meta = ((req.metadata ?? {}) as Record<string, unknown>) || {};
  const unitCost = Number(meta.unit_cost ?? 0);
  const now = new Date().toISOString();

  const {
    data: { user },
  } = await sb.auth.getUser();
  const actorId = user?.id ?? null;

  let restocked = 0;
  let writeoffQty = 0;
  let shortfallWriteoffId: string | null = null;

  // ── 1. full_return：回補 confirmedQty（insert available stock_item）──
  if (returnType === "full_return" && confirmedQty > 0) {
    const warehouseId =
      (typeof meta.warehouse_id === "string" && meta.warehouse_id) ||
      (await getDefaultPartsWarehouseId(brand, req.store_id));
    if (!warehouseId) {
      return { ok: false, error: "找不到可回補的倉庫，請先設定備件倉" };
    }
    if (req.item_id) {
      const { error: insErr } = await sb.from("stock_items").insert({
        brand_id: brand,
        item_id: req.item_id,
        warehouse_id: warehouseId,
        qty: confirmedQty,
        unit_cost: unitCost,
        status: "available",
        external_source: "return_in",
        last_movement_at: now,
        metadata: {
          source: "parts_return_request",
          return_request_id: requestId,
          source_ro_id: req.source_ro_id,
          restocked_at: now,
        },
      });
      if (insErr) {
        console.error("[return-confirm] restock insert error", insErr);
        return { ok: false, error: `庫存回補失敗：${insErr.message}` };
      }
      restocked = confirmedQty;
    }
  }

  // ── 2. damage_writeoff：整筆核銷（不回補）──
  if (returnType === "damage_writeoff" && confirmedQty > 0) {
    const wid = await insertWriteoff({
      brand_id: brand,
      item_id: req.item_id,
      qty: confirmedQty,
      unit_cost: unitCost,
      writeoff_reason: note?.trim() || `退料損耗核銷：${req.part_name}`,
      workorder_id: req.source_ro_id,
      store_id: req.store_id,
      requested_by: actorId,
    });
    if (wid) {
      shortfallWriteoffId = wid;
      writeoffQty += confirmedQty;
    }
  }

  // ── 3. 差額核銷（確認數量 < 申請數量）──
  const shortfallQty = qtyRequested - confirmedQty;
  if (shortfallQty > 0 && shortfall?.mode === "writeoff") {
    const wid = await insertWriteoff({
      brand_id: brand,
      item_id: req.item_id,
      qty: shortfallQty,
      unit_cost: unitCost,
      writeoff_reason:
        shortfall.reason?.trim() || `退料差額核銷：${req.part_name} 短少 ${shortfallQty}`,
      workorder_id: req.source_ro_id,
      store_id: req.store_id,
      requested_by: actorId,
    });
    if (wid) {
      shortfallWriteoffId = wid;
      writeoffQty += shortfallQty;
    }
  }

  // ── 4. 更新 parts_return_requests → confirmed ──
  const { error: updErr } = await sb
    .from("parts_return_requests")
    .update({
      status: "confirmed",
      qty_confirmed: confirmedQty,
      confirmed_by: actorId,
      confirmed_at: now,
      return_type: returnType,
      warehouse_note: note?.trim() || null,
      shortfall_writeoff_id: shortfallWriteoffId,
      metadata: {
        ...meta,
        shortfall_qty: shortfallQty > 0 ? shortfallQty : 0,
        shortfall_mode: shortfallQty > 0 ? shortfall?.mode ?? "ignore" : null,
      },
    })
    .eq("id", requestId)
    .eq("brand_id", brand);
  if (updErr) return { ok: false, error: `確認失敗：${updErr.message}` };

  // ── 5. 稽核日誌（非阻塞）──
  after(async () => {
    await writeAuditLog({
      table_name: "parts_return_requests",
      record_id: requestId,
      action: "RETURN_REQUEST_CONFIRMED",
      actor_id: actorId,
      brand_id: brand,
      before: { status: req.status, qty_requested: qtyRequested },
      after: {
        status: "confirmed",
        qty_confirmed: confirmedQty,
        return_type: returnType,
        restocked,
        writeoff_qty: writeoffQty,
      },
    });
  });

  revalidatePath("/parts/receipt/return-in");
  return { ok: true, data: { id: requestId, restocked, writeoff_qty: writeoffQty } };
}

/**
 * 場景四：技師領料後用不到，主動發起退料待確認。
 * 由技師工作台 / 工單明細頁呼叫。
 */
export async function createTechUnusedReturnAction(input: {
  source_ro_id: string;
  item_id?: string | null;
  part_name: string;
  part_code?: string | null;
  qty: number;
  reason?: string | null;
  unit_cost?: number | null;
}): Promise<ActionResult<{ ids: string[] }>> {
  await requirePermission(PERMISSIONS.RECEIPT_CREATE);
  if (!input.part_name || !(input.qty > 0))
    return { ok: false, error: "缺少退料品名或數量" };

  const brand = (await getActiveScope()).brand_id;
  const store = (await getActiveScope()).store_id;
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  const dueBy = await getTodayClosingTime();
  const { ids } = await createReturnRequestsBatch(
    [
      {
        source_type: "tech_unused",
        source_ro_id: input.source_ro_id,
        item_id: input.item_id ?? null,
        part_name: input.part_name,
        part_code: input.part_code ?? null,
        qty_requested: input.qty,
        return_reason: input.reason ?? "技師領料後確認用不到，主動退回",
        requested_by: user?.id ?? null,
        store_id: store,
        unit_cost: input.unit_cost ?? 0,
      },
    ],
    { brand, due_by: dueBy },
  );

  revalidatePath("/parts/receipt/return-in");
  return { ok: true, data: { ids } };
}
