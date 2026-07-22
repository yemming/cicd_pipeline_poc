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
  submitTechUnusedReturn,
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

/** 退料閉環場景三：技師領料後說用不到，主動退回（建 parts_return_requests，待倉管確認）。*/
export async function submitTechUnusedReturnAction(
  lineId: string,
  qty: number,
  reason?: string,
): Promise<ActionResult<{ ids: string[] }>> {
  await requirePermission(PERMISSIONS.RO_EXECUTE);
  const res = await submitTechUnusedReturn(lineId, qty, reason);
  if (res.ok) revalidatePath(TECH_PATH);
  return res;
}

export async function addAddonAction(
  roId: string,
  payload: AddonInput,
): Promise<ActionResult<{ id: string; reserved: boolean }>> {
  // 修補五：技師送追加項目曾回 500（addon 未寫入）。根因多為 requirePermission 在
  // 角色未綁 service.addon.propose 時 throw、或 addAddon 內部例外，導致 server action 拋出變 500。
  // 全段包 try/catch：權限不足 / 任何例外都轉成友善 ok:false（前端 banner），不再 raw 500；
  // 並記詳細錯誤（含 payload）方便 debug。
  try {
    await requirePermission(PERMISSIONS.ADDON_PROPOSE);
    const res = await addAddon(roId, payload);
    if (res.ok) revalidatePath(TECH_PATH);
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[tech addAddonAction] 追加項目失敗", {
      message,
      roId,
      payload,
    });
    // 權限類錯誤給人話提示；其餘回原始訊息
    if (message.includes("權限不足")) {
      return { ok: false, error: "您的帳號沒有「追加項目提報」權限，請聯繫主管開通（service.addon.propose）。" };
    }
    return { ok: false, error: `追加項目失敗：${message}` };
  }
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
