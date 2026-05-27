"use server";

/**
 * Server actions — RS_INV04 車輛調撥
 *
 * Result<T> pattern、無 redirect（client 自控導航）。
 * 對應頁面：/sales/inventory/transfers（list + 申請 wizard）
 * 設計稿：docs/20260527/RS_INV04_車輛調撥.html
 *
 * 寫入動作：
 *  - createTransferAction：寫 vehicle_transfers；freight_type='A_VEHICLE_COST' 時
 *      把運費寫回該車 transfer_freight_cost（new / used 依 vehicle_kind），
 *      total_cost 由 DB 自動反映。
 *  - setTransferStatusAction：pending → in_transit → completed / cancelled。
 *
 * 權限：檢視 SALES_ORDER_VIEW、建立 / 改狀態 SALES_ORDER_EDIT。
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  insertVehicleTransfer,
  addVehicleTransferFreight,
  setVehicleTransferStatus,
  nextTransferNo,
} from "@/domain/vehicle-transfers";
import {
  ALL_FREIGHT_TYPES,
  ALL_TRANSFER_STATUSES,
  freightHitsVehicleCost,
  type FreightType,
  type TransferStatus,
  type VehicleKind,
} from "@/domain/vehicle-transfers.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/sales/inventory/transfers";

export type CreateTransferFormInput = {
  vehicle_kind: VehicleKind;
  vehicle_id: string;
  from_warehouse_id?: string | null;
  to_warehouse_id?: string | null;
  transfer_date?: string | null;
  freight_type: FreightType;
  freight_amount?: number | null;
  carrier?: string | null;
  reason?: string | null;
  /** A 類運費寫回毛利影響 → 必須帶主管二次確認 flag */
  manager_confirmed?: boolean;
};

export type CreateTransferResult = {
  id: string;
  transfer_no: string;
  freight_type: FreightType;
  hit_vehicle_cost: boolean;
  /** A 類才有：寫回後該車成本（驗證 / 顯示用） */
  freight_before?: number;
  freight_after?: number;
  total_cost_before?: number | null;
  total_cost_after?: number | null;
};

function validate(form: CreateTransferFormInput): string | null {
  if (form.vehicle_kind !== "new" && form.vehicle_kind !== "used")
    return "車輛種類不正確";
  if (!form.vehicle_id?.trim()) return "請選擇要調撥的車輛";
  if (!form.to_warehouse_id?.trim()) return "請選擇調撥目的倉庫";
  if (form.from_warehouse_id && form.from_warehouse_id === form.to_warehouse_id)
    return "出發倉庫與目的倉庫不可相同";
  if (!ALL_FREIGHT_TYPES.includes(form.freight_type))
    return "運費承擔方式不正確";
  const amt = Number(form.freight_amount ?? 0);
  if (form.freight_type !== "E_NONE" && amt < 0) return "運費金額不可為負";
  // A 類運費（計入整車成本，影響毛利）— 沒帶主管二次確認直接擋
  if (freightHitsVehicleCost(form.freight_type) && amt > 0 && !form.manager_confirmed)
    return "「計入整車成本」會影響毛利，需主管二次確認後才能送出";
  return null;
}

export async function createTransferAction(
  form: CreateTransferFormInput,
): Promise<ActionResult<CreateTransferResult>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);

  const err = validate(form);
  if (err) return { ok: false, error: err };

  try {
    const brand = (await getActiveScope()).brand_id;
    const { userId } = await getCurrentUserAndAdmin();
    const transferNo = await nextTransferNo(brand);

    const freightAmt =
      form.freight_type === "E_NONE" ? 0 : Number(form.freight_amount ?? 0) || 0;
    const hit = freightHitsVehicleCost(form.freight_type);

    // ── 1. 寫 vehicle_transfers row ──
    const inserted = await insertVehicleTransfer({
      brand_id: brand,
      transfer_no: transferNo,
      vehicle_kind: form.vehicle_kind,
      new_car_id: form.vehicle_kind === "new" ? form.vehicle_id : null,
      used_car_id: form.vehicle_kind === "used" ? form.vehicle_id : null,
      from_warehouse_id: form.from_warehouse_id || null,
      to_warehouse_id: form.to_warehouse_id || null,
      transfer_date: form.transfer_date || new Date().toISOString().slice(0, 10),
      freight_type: form.freight_type,
      freight_amount: freightAmt,
      carrier: form.carrier?.trim() || null,
      reason: form.reason?.trim() || null,
      status: "in_transit", // 送出申請即進入「調撥中」
      created_by: userId,
      metadata: {
        // D 類各半：記分攤比例（純顯示，不寫回車成本）
        split_ratio: form.freight_type === "D_SPLIT" ? 0.5 : undefined,
        manager_confirmed: hit ? !!form.manager_confirmed : undefined,
      },
    });

    // ── 2. 副作用：A 類運費寫回該車 transfer_freight_cost ──
    let costDelta:
      | { before: number; after: number; totalCostBefore: number | null; totalCostAfter: number | null }
      | undefined;
    if (hit && freightAmt > 0) {
      costDelta = await addVehicleTransferFreight(
        form.vehicle_kind,
        form.vehicle_id,
        freightAmt,
      );
    }

    revalidatePath(PAGE_PATH);
    revalidatePath("/sales/inventory/showroom");
    revalidatePath("/usedcar/stock");

    return {
      ok: true,
      data: {
        id: inserted.id,
        transfer_no: inserted.transfer_no,
        freight_type: form.freight_type,
        hit_vehicle_cost: hit && freightAmt > 0,
        freight_before: costDelta?.before,
        freight_after: costDelta?.after,
        total_cost_before: costDelta?.totalCostBefore,
        total_cost_after: costDelta?.totalCostAfter,
      },
    };
  } catch (e) {
    return { ok: false, error: `建立調撥失敗：${(e as Error).message}` };
  }
}

export async function setTransferStatusAction(
  id: string,
  status: TransferStatus,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!id) return { ok: false, error: "缺少調撥單 id" };
  if (!ALL_TRANSFER_STATUSES.includes(status))
    return { ok: false, error: "狀態不正確" };

  try {
    const brand = (await getActiveScope()).brand_id;
    const res = await setVehicleTransferStatus(id, brand, status);
    revalidatePath(PAGE_PATH);
    return { ok: true, data: res };
  } catch (e) {
    return { ok: false, error: `更新狀態失敗：${(e as Error).message}` };
  }
}
