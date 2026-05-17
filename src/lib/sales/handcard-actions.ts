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
  type HandcardInput,
} from '@/domain/sales-handcards';

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

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
