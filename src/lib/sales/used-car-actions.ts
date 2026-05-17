"use server";

/**
 * 中古車庫存 server actions — ActionResult<T> pattern（不 redirect）。
 * UI 自控導航，server 只回 ok/error。
 */

import { createUsedCar, updateUsedCar, deleteUsedCar, setUsedCarStatus } from "@/domain/used-car-inventory";
import type { CreateUsedCarInput, UsedCarInventoryRow } from "@/domain/used-car-inventory";
import type { UsedCarDbStatus } from "@/domain/used-car-inventory.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ── 建立 ──
export async function createUsedCarAction(
  input: CreateUsedCarInput
): Promise<ActionResult<{ id: string }>> {
  try {
    if (!input.model_display_name?.trim()) {
      return { ok: false, error: "車款名稱不可為空" };
    }
    if (!input.year || input.year < 1990 || input.year > new Date().getFullYear() + 1) {
      return { ok: false, error: "請輸入正確的年份" };
    }
    const result = await createUsedCar(input);
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "建立失敗";
    if (msg.includes("23505")) return { ok: false, error: "VIN 號碼重複，請確認後重新輸入" };
    return { ok: false, error: msg };
  }
}

// ── 更新 ──
export async function updateUsedCarAction(
  id: string,
  patch: Partial<CreateUsedCarInput>
): Promise<ActionResult<{ id: string }>> {
  try {
    if (patch.model_display_name !== undefined && !patch.model_display_name?.trim()) {
      return { ok: false, error: "車款名稱不可為空" };
    }
    const result = await updateUsedCar(id, patch);
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "更新失敗";
    if (msg.includes("23505")) return { ok: false, error: "VIN 號碼重複，請確認後重新輸入" };
    return { ok: false, error: msg };
  }
}

// ── 狀態切換 ──
export async function setUsedCarStatusAction(
  id: string,
  status: UsedCarDbStatus,
  soldDate?: string
): Promise<ActionResult<{ id: string }>> {
  try {
    const result = await setUsedCarStatus(id, status, soldDate);
    return { ok: true, data: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "狀態切換失敗";
    return { ok: false, error: msg };
  }
}

// ── 刪除 ──
export async function deleteUsedCarAction(
  id: string
): Promise<ActionResult<{ id: string }>> {
  try {
    await deleteUsedCar(id);
    return { ok: true, data: { id } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "刪除失敗";
    return { ok: false, error: msg };
  }
}

// ── 型別 re-export 方便 client import ──
export type { UsedCarInventoryRow };
