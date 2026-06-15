"use server";

/**
 * Server actions — Tech 技師工作台（執行端寫入動作）
 *
 * 第十一輪 C4b。Result<T> pattern（client 自控導航，不 redirect）。
 * 每支 action 開頭 requirePermission，再委派給 @/domain/tech-workstation 的寫函式。
 *
 * 權限對映（C4a 已建 + grant）：
 *   接單                → service.ro.accept (RO_ACCEPT)
 *   施工 / 工時 / 工項勾選 → service.ro.execute (RO_EXECUTE)
 *   追加項目             → service.addon.propose (ADDON_PROPOSE)
 *   轉派                → service.ro.dispatch (RO_DISPATCH)；技師預設無此權，
 *                         按鈕只對有 dispatch 權者顯示（proposal Q8）
 */

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  acceptOrder,
  toggleWorkItem,
  markOrderComplete,
  addAddon,
  startLaborTimer,
  pauseLaborTimer,
  reassignOrder,
  setDiagResult,
  saveTechNote,
  type AddonInput,
  type DiagResult,
} from "@/domain/tech-workstation";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const TECH_PATH = "/tech";

export async function acceptOrderAction(
  roId: string,
): Promise<ActionResult<{ id: string; status: string }>> {
  await requirePermission(PERMISSIONS.RO_ACCEPT);
  const res = await acceptOrder(roId);
  if (res.ok) revalidatePath(TECH_PATH);
  return res;
}

export async function toggleWorkItemAction(
  lineId: string,
  done: boolean,
): Promise<ActionResult<{ id: string; done: boolean }>> {
  await requirePermission(PERMISSIONS.RO_EXECUTE);
  const res = await toggleWorkItem(lineId, done);
  if (res.ok) revalidatePath(TECH_PATH);
  return res;
}

export async function markOrderCompleteAction(
  roId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_EXECUTE);
  const res = await markOrderComplete(roId);
  if (res.ok) revalidatePath(TECH_PATH);
  return res;
}

export async function addAddonAction(
  roId: string,
  payload: AddonInput,
): Promise<ActionResult<{ id: string; reserved: boolean }>> {
  await requirePermission(PERMISSIONS.ADDON_PROPOSE);
  const res = await addAddon(roId, payload);
  if (res.ok) revalidatePath(TECH_PATH);
  return res;
}

export async function startLaborTimerAction(
  roId: string,
  lineId?: string | null,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_EXECUTE);
  const res = await startLaborTimer(roId, lineId);
  if (res.ok) revalidatePath(TECH_PATH);
  return res;
}

export async function pauseLaborTimerAction(
  roId: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_EXECUTE);
  const res = await pauseLaborTimer(roId);
  if (res.ok) revalidatePath(TECH_PATH);
  return res;
}

export async function reassignOrderAction(
  roId: string,
  toTechId: string,
): Promise<ActionResult<{ id: string; technician_id: string }>> {
  // 轉派沿用既有派工權限（proposal Q8：技師預設不可自行轉派）
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  const res = await reassignOrder(roId, toTechId);
  if (res.ok) revalidatePath(TECH_PATH);
  return res;
}

/**
 * 診斷項目結果設定（正常 / 需關注 / 異常）。
 * 結果寫入 repair_order_lines.metadata.diag_result。
 */
export async function setDiagResultAction(
  lineId: string,
  result: DiagResult,
): Promise<ActionResult<{ id: string; diag_result: DiagResult }>> {
  await requirePermission(PERMISSIONS.RO_EXECUTE);
  const res = await setDiagResult(lineId, result);
  if (res.ok) revalidatePath(TECH_PATH);
  return res;
}

/** 儲存施工備註（SA / 複檢員可見）。 */
export async function saveTechNoteAction(
  roId: string,
  note: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_EXECUTE);
  const res = await saveTechNote(roId, note);
  if (res.ok) revalidatePath(TECH_PATH);
  return res;
}

// 重新 export DiagResult 型別供 board 使用
export type { DiagResult };
