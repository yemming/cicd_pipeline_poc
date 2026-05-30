import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * 庫存成本 domain facade — 所有成本帳讀寫的唯一入口（天條）。
 * 內部包 `post_inventory_cost_event` RPC（atomic、雙法：移動加權平均 / 個別認定）。
 *
 * 寫入：每筆會動到存貨價值的營運動作（進貨/出貨/調撥/調整/退貨/landed cost）都先呼叫
 * `postCostEvent`，拿回 RPC 算好的 `unit_cost`，再把它當 `cost_amount` 丟給 GL 過帳引擎。
 * 讀取：`getMovingAverage`（零件 MA 均價）/ `getVehicleLandedCost`（整車累計成本）。
 */

export type CostEventType =
  | "receipt"
  | "issue"
  | "adjustment_in"
  | "adjustment_out"
  | "transfer_in"
  | "transfer_out"
  | "landed_cost"
  | "return_in"
  | "return_out"
  | "revaluation"
  | "opening_balance"
  | "vehicle_sale";

export type CostEventInput = {
  subjectType: "part" | "vehicle";
  eventType: CostEventType;
  brandId: string;
  itemId?: string;
  vehicleId?: string;
  warehouseId?: string;
  /** 數量絕對值；方向由 eventType 決定（入庫+/出庫-/純成本0） */
  qty?: number;
  /** 入庫單位成本，或個別認定出庫的層成本 */
  unitCostIn?: number;
  /** landed_cost / revaluation 的金額（可正可負） */
  amountIn?: number;
  serialNo?: string;
  batchNo?: string;
  subsidiaryId?: string;
  sourceTable?: string;
  sourceId?: string;
  stockItemId?: string;
  movementId?: string;
  userId?: string;
  notes?: string;
  /** 預設 false：出庫不可使庫存轉負 */
  allowNegative?: boolean;
};

export type CostEventResult =
  | {
      ok: true;
      ledgerId: string;
      /** RPC 算定的本次單位成本 — 出庫時即為 COGS 單價，拿去當 GL cost_amount */
      unitCost: number;
      amountDelta: number;
      qtyAfter: number;
      valueAfter: number;
      avgCostAfter: number;
    }
  | { ok: false; error: string };

export async function postCostEvent(input: CostEventInput): Promise<CostEventResult> {
  const sb = createServiceClient();
  const { data, error } = await sb.rpc("post_inventory_cost_event", {
    p_subject_type: input.subjectType,
    p_event_type: input.eventType,
    p_brand_id: input.brandId,
    p_item_id: input.itemId ?? null,
    p_vehicle_id: input.vehicleId ?? null,
    p_warehouse_id: input.warehouseId ?? null,
    p_qty: input.qty ?? 0,
    p_unit_cost_in: input.unitCostIn ?? null,
    p_amount_in: input.amountIn ?? null,
    p_serial_no: input.serialNo ?? null,
    p_batch_no: input.batchNo ?? null,
    p_subsidiary_id: input.subsidiaryId ?? null,
    p_source_table: input.sourceTable ?? "manual",
    p_source_id: input.sourceId ?? null,
    p_stock_item_id: input.stockItemId ?? null,
    p_movement_id: input.movementId ?? null,
    p_created_by: input.userId ?? null,
    p_notes: input.notes ?? null,
    p_allow_negative: input.allowNegative ?? false,
  });
  if (error) return { ok: false, error: `成本事件 RPC 失敗：${error.message}` };

  const r = data as Record<string, unknown> | null;
  if (!r || r.ok !== true) {
    return { ok: false, error: (r?.error as string) ?? "成本事件失敗（未知）" };
  }
  return {
    ok: true,
    ledgerId: r.ledger_id as string,
    unitCost: Number(r.unit_cost ?? 0),
    amountDelta: Number(r.amount_delta ?? 0),
    qtyAfter: Number(r.qty_after ?? 0),
    valueAfter: Number(r.value_after ?? 0),
    avgCostAfter: Number(r.avg_cost_after ?? 0),
  };
}

/** 零件某倉的移動加權平均成本（出庫前要用的 COGS 單價、估價用）。查無則 0。 */
export async function getMovingAverage(
  itemId: string,
  warehouseId: string,
): Promise<{ avgCost: number; qtyOnHand: number; totalValue: number }> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("inventory_cost_state")
    .select("moving_avg_cost, qty_on_hand, total_value")
    .eq("item_id", itemId)
    .eq("warehouse_id", warehouseId)
    .maybeSingle();
  return {
    avgCost: Number(data?.moving_avg_cost ?? 0),
    qtyOnHand: Number(data?.qty_on_hand ?? 0),
    totalValue: Number(data?.total_value ?? 0),
  };
}

/** 整車（VIN）累計 landed cost — 以 cost ledger 最新一筆 value_after 為真相。查無則 0。 */
export async function getVehicleLandedCost(vehicleId: string): Promise<number> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("inventory_cost_ledger")
    .select("value_after, seq")
    .eq("vehicle_id", vehicleId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Number(data?.value_after ?? 0);
}
