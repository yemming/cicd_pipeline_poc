"use server";

import {
  createNewCar,
  updateNewCar,
  deleteNewCar,
  setNewCarStatus,
  markAsDemoUnit,
  retireDemoToUsed,
  StaleNewCarStatusError,
  type NewCarInventoryInput,
  type DemoRetireToUsedInput,
} from "@/domain/new-car-inventory";
import type { NewCarInventoryStatus } from "@/domain/new-car-inventory.constants";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

// ── Result 型別 ────────────────────────────────────────────────────────

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── DB 錯誤翻譯 ────────────────────────────────────────────────────────

function mapDbError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("23505")) {
    if (msg.includes("vin")) return "此 VIN 已存在，請確認後重試";
    return "資料重複，請確認後重試";
  }
  if (msg.includes("23503")) return "關聯資料不存在，請確認車型 / 門店選擇";
  if (msg.includes("23514")) return "欄位值不在允許範圍內，請確認狀態選擇";
  return `操作失敗：${msg}`;
}

// ── Server Actions ─────────────────────────────────────────────────────

export async function createNewCarAction(
  input: NewCarInventoryInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const result = await createNewCar(input);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export async function updateNewCarAction(
  id: string,
  patch: Partial<NewCarInventoryInput>
): Promise<ActionResult<{ id: string }>> {
  try {
    await updateNewCar(id, patch);
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

export async function setNewCarStatusAction(
  id: string,
  status: NewCarInventoryStatus,
  expectedCurrentStatus?: NewCarInventoryStatus
): Promise<ActionResult<{ id: string }>> {
  try {
    await setNewCarStatus(id, status, expectedCurrentStatus);
    return { ok: true, data: { id } };
  } catch (err) {
    if (err instanceof StaleNewCarStatusError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: mapDbError(err) };
  }
}

export async function deleteNewCarAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await deleteNewCar(id);
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

// ── Demo 車管理 Actions（A1）─────────────────────────────────────────

/**
 * 標記或取消 demo 車。
 * 需要 SALES_CAR_DEMO_EDIT 權限（店長 / 主管）。
 */
export async function markAsDemoUnitAction(
  id: string,
  is_demo: boolean,
  acquired_at?: string | null,
): Promise<ActionResult<{ id: string }>> {
  try {
    await requirePermission(PERMISSIONS.SALES_CAR_DEMO_EDIT);
    await markAsDemoUnit(id, is_demo, acquired_at);
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}

/**
 * demo 車退役轉中古車（一次性不可逆）。
 * 需要 SALES_CAR_DEMO_RETIRE 權限（店長 / 主管限定）。
 */
export async function retireDemoToUsedAction(
  input: DemoRetireToUsedInput,
): Promise<ActionResult<{ usedCarId: string }>> {
  try {
    await requirePermission(PERMISSIONS.SALES_CAR_DEMO_RETIRE);
    const result = await retireDemoToUsed(input);
    return { ok: true, data: result };
  } catch (err) {
    return { ok: false, error: mapDbError(err) };
  }
}
