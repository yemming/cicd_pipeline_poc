"use server";

/**
 * Server actions — RS_INV02 到港確認（整車供應鏈第 2 棒，PDI 觸發點）
 *
 * Result<T> pattern、無 redirect（client 自控導航）。
 *
 * confirmArrivalAction 是整條新車鏈最關鍵的修正：PDI 工單必須在「到港」時觸發，
 * 而不是交車時。動作（POC：無交易，逐步寫 + 失敗回 error）：
 *   1. 建 vehicle_arrivals 批次 row（total/confirmed/damaged 統計）
 *   2. 無損傷車 → new_car_inventory status in_transit→pending_pdi、填 vin / arrival_batch_id / arrival_date
 *   3. 無損傷車 → 各建一張 PD-IN 工單（fee_allocation='vehicle_cost'、related_new_car_id=該車），
 *      工單 id 回填 new_car_inventory.pdi_workorder_id
 *   4. 有損傷車 → status='damaged'、damage_flag、damage_notes（不建 PDI 工單）
 *   5. after() 非阻塞推 notifications.dispatch（失敗不影響主流程）
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  nextArrivalNo,
  listInTransitCarsByPO,
  type InTransitCar,
} from "@/domain/vehicle-arrivals";
import { buildRoCode } from "@/domain/repair-orders.constants";
import { notifications } from "@/lib/notifications";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/sales/inventory/arrival-confirmation";

export type ArrivalVehicleInput = {
  new_car_id: string;
  vin: string;
  damaged?: boolean;
  damage_notes?: string | null;
};

export type ConfirmArrivalInput = {
  po_id: string;
  arrival_date?: string | null; // ISO date；空時用今天
  warehouse_id?: string | null;
  notes?: string | null;
  vehicles: ArrivalVehicleInput[];
};

export type ConfirmArrivalResult = {
  arrival_id: string;
  arrival_no: string;
  pdi_workorders: string[]; // ro_code 清單
  pending_pdi_count: number;
  damaged_count: number;
};

/**
 * wizard STEP 1→2 用：選定採購單後撈其在途車（client 透過此 action 取，不直連 domain helper）。
 */
export async function loadInTransitCarsAction(
  poId: string,
): Promise<ActionResult<InTransitCar[]>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_VIEW);
  if (!poId) return { ok: false, error: "缺少採購單 id" };
  try {
    const cars = await listInTransitCarsByPO(poId);
    return { ok: true, data: cars };
  } catch (e) {
    return { ok: false, error: `載入在途車輛失敗：${(e as Error).message}` };
  }
}

function todayIsoDate(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const day = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 查 PD-IN 當日當前最大序號 +1（用於組 ro_code）。
 * 為了在迴圈裡連號，呼叫方在每建一張後自行 +1（避免每張都 round-trip）。
 */
async function nextPdInSequenceStart(
  brandId: string,
  issueDate: string,
): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repair_orders")
    .select("sequence_no")
    .eq("brand_id", brandId)
    .eq("issue_date", issueDate)
    .eq("prefix_p1", "PD")
    .eq("prefix_p2", "IN")
    .order("sequence_no", { ascending: false })
    .limit(1);
  const top = (data ?? [])[0] as { sequence_no: number } | undefined;
  return (top?.sequence_no ?? 0) + 1;
}

/**
 * 批次到港確認 + 自動觸發 PDI 工單。
 */
export async function confirmArrivalAction(
  input: ConfirmArrivalInput,
): Promise<ActionResult<ConfirmArrivalResult>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);

  if (!input.po_id) return { ok: false, error: "缺少採購單" };
  if (!input.vehicles || input.vehicles.length === 0)
    return { ok: false, error: "沒有可確認的車輛" };

  // 驗 VIN：每台都要有，且不可重複
  const vinSet = new Set<string>();
  for (const [i, v] of input.vehicles.entries()) {
    if (!v.new_car_id) return { ok: false, error: `第 ${i + 1} 台：缺少車輛 id` };
    const vin = v.vin?.trim().toUpperCase();
    if (!vin) return { ok: false, error: `第 ${i + 1} 台：請掃描 / 輸入 VIN` };
    if (vinSet.has(vin)) return { ok: false, error: `VIN 重複：${vin}` };
    vinSet.add(vin);
  }

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();
  const brand = scope.brand_id;
  const issueDate = todayIsoDate();
  const arrivalDate = input.arrival_date || issueDate;

  // 驗採購單屬於同 brand + 撈倉預設
  const { data: po, error: poErr } = await supabase
    .from("vehicle_purchase_orders")
    .select("id, brand_id, warehouse_id")
    .eq("id", input.po_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (poErr) return { ok: false, error: `採購單載入失敗：${poErr.message}` };
  if (!po) return { ok: false, error: "找不到採購單或無權限" };

  const warehouseId = input.warehouse_id || po.warehouse_id || null;

  const damagedCars = input.vehicles.filter((v) => v.damaged);
  const okCars = input.vehicles.filter((v) => !v.damaged);
  const totalVehicles = input.vehicles.length;
  const confirmedVehicles = okCars.length;
  const damagedCount = damagedCars.length;
  // 全部無損傷 → completed；有損傷 → partial（損傷車未進入 PDI 流程）
  const batchStatus = damagedCount === 0 ? "completed" : "partial";

  // 1) 建批次單頭
  const arrivalNo = await nextArrivalNo(brand);
  const { data: arrival, error: arrErr } = await supabase
    .from("vehicle_arrivals")
    .insert({
      brand_id: brand,
      arrival_no: arrivalNo,
      purchase_order_id: input.po_id,
      arrival_date: arrivalDate,
      warehouse_id: warehouseId,
      total_vehicles: totalVehicles,
      confirmed_vehicles: confirmedVehicles,
      damaged_vehicles: damagedCount,
      status: batchStatus,
      metadata: {
        created_via: "arrival_wizard_v1",
        notes: input.notes?.trim() || null,
      },
      created_by: userId,
    })
    .select("id, arrival_no")
    .single();
  if (arrErr) {
    if (arrErr.code === "23505")
      return { ok: false, error: `到港批次號 ${arrivalNo} 已存在，請重試` };
    return { ok: false, error: `建立到港批次失敗：${arrErr.message}` };
  }
  const arrivalId = arrival.id as string;

  // 2) 有損傷車：status='damaged'、damage_flag、damage_notes（不建 PDI）
  for (const v of damagedCars) {
    const { error } = await supabase
      .from("new_car_inventory")
      .update({
        status: "damaged",
        vin: v.vin.trim().toUpperCase(),
        damage_flag: true,
        damage_notes: v.damage_notes?.trim() || null,
        arrival_batch_id: arrivalId,
        arrival_date: arrivalDate,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", v.new_car_id)
      .eq("brand_id", brand);
    if (error) return { ok: false, error: `更新損傷車輛失敗：${error.message}` };
  }

  // 3) 無損傷車：status→pending_pdi + 各建一張 PD-IN 工單 + 回填 pdi_workorder_id
  const pdiRoCodes: string[] = [];
  let seq = await nextPdInSequenceStart(brand, issueDate);

  for (const v of okCars) {
    // 3a) 車輛狀態 → pending_pdi
    const { error: updErr } = await supabase
      .from("new_car_inventory")
      .update({
        status: "pending_pdi",
        vin: v.vin.trim().toUpperCase(),
        damage_flag: false,
        arrival_batch_id: arrivalId,
        arrival_date: arrivalDate,
        updated_at: new Date().toISOString(),
        updated_by: userId,
      })
      .eq("id", v.new_car_id)
      .eq("brand_id", brand);
    if (updErr) return { ok: false, error: `更新車輛狀態失敗：${updErr.message}` };

    // 3b) 建 PD-IN 工單（簡單 retry on unique violation）
    let roId: string | null = null;
    let roCode = "";
    let lastErr: string | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      roCode = buildRoCode("PD", "IN", issueDate, seq);
      const { data: ro, error: roErr } = await supabase
        .from("repair_orders")
        .insert({
          brand_id: brand,
          ro_code: roCode,
          prefix_p1: "PD",
          prefix_p2: "IN",
          issue_date: issueDate,
          sequence_no: seq,
          subsidiary_id: scope.subsidiary_id,
          status: "進行中",
          opened_at: new Date().toISOString(),
          fee_allocation: "vehicle_cost",
          related_new_car_id: v.new_car_id,
          metadata: {
            accounting_category_resolved: "VEHICLE_COST",
            verdict: "valid",
            created_via: "arrival_confirm_auto_pdi",
            arrival_id: arrivalId,
            arrival_no: arrivalNo,
          },
          created_by: userId,
        })
        .select("id, ro_code")
        .single();
      if (!roErr) {
        roId = ro.id as string;
        roCode = ro.ro_code as string;
        break;
      }
      lastErr = roErr.message;
      seq += 1; // 撞號 → 進序號重試
      if (!roErr.message.includes("duplicate") && !roErr.message.includes("unique")) break;
    }
    if (!roId) return { ok: false, error: `建立 PDI 工單失敗：${lastErr ?? "unknown"}` };

    // 3c) 回填 pdi_workorder_id
    const { error: backErr } = await supabase
      .from("new_car_inventory")
      .update({ pdi_workorder_id: roId, updated_at: new Date().toISOString() })
      .eq("id", v.new_car_id)
      .eq("brand_id", brand);
    if (backErr) return { ok: false, error: `回填 PDI 工單 id 失敗：${backErr.message}` };

    pdiRoCodes.push(roCode);
    seq += 1;
  }

  // 4) 採購單若還沒標到港，順手切 in_transit / arrived（此單尚有在途車就 in_transit，否則 arrived）
  {
    const { count } = await supabase
      .from("new_car_inventory")
      .select("id", { count: "exact", head: true })
      .eq("brand_id", brand)
      .eq("purchase_order_id", input.po_id)
      .eq("status", "in_transit");
    const nextPoStatus = (count ?? 0) > 0 ? "in_transit" : "arrived";
    await supabase
      .from("vehicle_purchase_orders")
      .update({ status: nextPoStatus, updated_at: new Date().toISOString() })
      .eq("id", input.po_id)
      .eq("brand_id", brand);
  }

  // 5) 副作用：非阻塞推通知（失敗吞錯，不影響主流程）
  const poId = input.po_id;
  after(async () => {
    try {
      await notifications.dispatch({
        code: "vehicle_arrival.confirmed",
        payload: {
          arrivalNo,
          poId,
          confirmedCount: String(confirmedVehicles),
          damagedCount: String(damagedCount),
          pdiCount: String(pdiRoCodes.length),
          actionUrl: `${PAGE_PATH}/${arrivalId}`,
        },
      });
    } catch (e) {
      console.error("[arrival.confirmed] 通知派送失敗（不影響到港確認）", e);
    }
  });

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${arrivalId}`);
  revalidatePath("/sales/inventory/purchase-orders");

  return {
    ok: true,
    data: {
      arrival_id: arrivalId,
      arrival_no: arrivalNo,
      pdi_workorders: pdiRoCodes,
      pending_pdi_count: confirmedVehicles,
      damaged_count: damagedCount,
    },
  };
}
