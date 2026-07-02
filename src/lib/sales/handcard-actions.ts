'use server';

/**
 * Server actions — 接待手卡（/sales/reception/handcard）
 *
 * 對 sales_handcards 表的寫入。Result 型別、不 redirect、client 自決導航。
 */

import { revalidatePath } from 'next/cache';

import { getCurrentUserAndAdmin } from '@/lib/feedback-admin';
import {
  createHandcard,
  updateHandcard,
  deleteHandcard,
  convertHandcardToLead,
  lookupCustomersByPhone,
  checkOpenHandcardDuplicateByPhone,
  type HandcardInput,
  type CustomerPhoneHit,
  type HandcardPhoneDuplicateHit,
} from '@/domain/sales-handcards';

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// CustomerPhoneHit 型別給 client 使用：直接從 @/domain/sales-handcards 引入，不在此 re-export
// （"use server" 檔 re-export type 在 Turbopack 會炸，見 memory use-server-type-reexport-crashes-module）

const LIST_PATH = '/sales/reception/handcard';

function revalidateHandcard(id?: string) {
  revalidatePath(LIST_PATH);
  if (id) revalidatePath(`${LIST_PATH}/${id}`);
}

function trim(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

// ── 新增手卡 ──────────────────────────────────────────────────────────────
export async function createHandcardAction(
  input: HandcardInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await getCurrentUserAndAdmin();
    if (!userId) return { ok: false, error: '請先登入' };

    const cleaned: HandcardInput = {
      ...input,
      customer_name: input.customer_name.trim(),
      customer_phone: trim(input.customer_phone),
      customer_email: trim(input.customer_email),
      assigned_rs_name: trim(input.assigned_rs_name),
      notes: trim(input.notes),
      competitor_brand: trim(input.competitor_brand),
      competitor_model: trim(input.competitor_model),
      quote_remark: trim(input.quote_remark),
      // 輪1-5：defeat_category — null 表示未戰敗，有值才寫
      defeat_category: input.defeat_category ?? null,
      // A-10：缺貨候補（backorder_model 舊自由文字保留欄但 UI 已停止寫入）
      backorder_model: trim(input.backorder_model),
      backorder_color: trim(input.backorder_color),
      backorder_registered_at: input.backorder_registered_at ?? null,
      // 域C：候補車型 UUID FK（精確比對用）
      backorder_vehicle_model_id: input.backorder_vehicle_model_id ?? null,
      // LINE：多管道聯絡方式（trim 後空字串視為 null）
      line_user_id: trim(input.line_user_id),
    };

    if (!cleaned.customer_name) {
      return { ok: false, error: '客戶姓名不可為空' };
    }

    const row = await createHandcard(cleaned, userId);
    revalidateHandcard();
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '新增失敗' };
  }
}

// ── 更新手卡 ──────────────────────────────────────────────────────────────
export async function updateHandcardAction(
  id: string,
  patch: Partial<HandcardInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await getCurrentUserAndAdmin();
    if (!userId) return { ok: false, error: '請先登入' };

    if (!id) return { ok: false, error: '缺少手卡 ID' };

    const cleanedPatch: Partial<HandcardInput> = { ...patch };
    if (typeof patch.customer_name === 'string') {
      cleanedPatch.customer_name = patch.customer_name.trim();
      if (!cleanedPatch.customer_name) {
        return { ok: false, error: '客戶姓名不可為空' };
      }
    }

    const row = await updateHandcard(id, cleanedPatch, userId);
    revalidateHandcard(row.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '更新失敗' };
  }
}

// ── 更改手卡狀態 ──────────────────────────────────────────────────────────
export async function setHandcardStatusAction(
  id: string,
  status: HandcardInput['status'],
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await getCurrentUserAndAdmin();
    if (!userId) return { ok: false, error: '請先登入' };

    if (!id) return { ok: false, error: '缺少手卡 ID' };

    const row = await updateHandcard(id, { status }, userId);
    revalidateHandcard(row.id);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '狀態更新失敗' };
  }
}

// ── 刪除手卡 ──────────────────────────────────────────────────────────────
export async function deleteHandcardAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const { userId } = await getCurrentUserAndAdmin();
    if (!userId) return { ok: false, error: '請先登入' };

    if (!id) return { ok: false, error: '缺少手卡 ID' };

    await deleteHandcard(id);
    revalidateHandcard();
    return { ok: true, data: { id } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '刪除失敗' };
  }
}

// ── 輪1-3：手機查重 action ────────────────────────────────────────────────
/**
 * phone onBlur 呼叫此 action 查同 brand 客戶；
 * 找到回 hits 供 UI 顯示「已有客戶：XXX」提示。
 */
export async function lookupCustomersByPhoneAction(
  phone: string,
): Promise<ActionResult<CustomerPhoneHit[]>> {
  try {
    const { userId } = await getCurrentUserAndAdmin();
    if (!userId) return { ok: false, error: '請先登入' };

    const hits = await lookupCustomersByPhone(phone);
    return { ok: true, data: hits };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '查詢失敗' };
  }
}

// ── Russell 最在意：手卡建立時的手機查重（軟擋）─────────────────────────────
/**
 * 查同 brand 是否已有「接待中」的手卡用同支手機號（排除自己）。
 * 有結果時 UI 應顯示警示，要求業務員二次確認後才可送出。
 */
export async function checkHandcardPhoneDuplicateAction(
  phone: string,
  excludeId?: string,
): Promise<ActionResult<HandcardPhoneDuplicateHit[]>> {
  try {
    const { userId } = await getCurrentUserAndAdmin();
    if (!userId) return { ok: false, error: '請先登入' };

    const hits = await checkOpenHandcardDuplicateByPhone(phone, excludeId);
    return { ok: true, data: hits };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '查詢失敗' };
  }
}

// ── 轉成 sales_lead ───────────────────────────────────────────────────────
export async function convertHandcardToLeadAction(
  id: string,
): Promise<ActionResult<{ leadId: string }>> {
  try {
    const { userId } = await getCurrentUserAndAdmin();
    if (!userId) return { ok: false, error: '請先登入' };

    if (!id) return { ok: false, error: '缺少手卡 ID' };

    const result = await convertHandcardToLead(id, userId);
    revalidateHandcard(id);
    revalidatePath('/crm/sales/dormant-leads');
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '轉換失敗' };
  }
}
