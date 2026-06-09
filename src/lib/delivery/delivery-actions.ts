'use server';

import { after } from 'next/server';

import {
  createDelivery,
  updateDelivery,
  updateDeliveryStep,
  setDeliveryStatus,
  deleteDelivery,
  syncDeliveryToCustomerBase,
  scheduleWarrantyReminderTask,
  type DeliveryInput,
  type DeliveryStepPayload,
} from '@/lib/deliveries';
import type { DeliveryStatus, DeliveryStepName } from '@/lib/deliveries.constants';
import {
  getDeliveryTimeline as _getDeliveryTimeline,
  getDeliveryPdiStatus as _getDeliveryPdiStatus,
} from '@/domain/sales-delivery';
import type {
  DeliveryTimelineEvent,
  DeliveryPdiStatus,
} from '@/domain/sales-delivery.constants';

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/** 擷取錯誤訊息 — Supabase PostgrestError 不是 Error instance，String(e) 會變 "[object Object]" */
function msgOf(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

/** 生成交車單號：DLV-YYYYMM-XXXX */
function genDeliveryNo(): string {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `DLV-${ym}-${seq}`;
}

export async function createDeliveryAction(
  input: Omit<DeliveryInput, 'delivery_no'>,
): Promise<ActionResult<{ id: string; delivery_no: string }>> {
  try {
    const delivery_no = genDeliveryNo();
    const row = await createDelivery({ ...input, delivery_no });
    return { ok: true, data: { id: row.id, delivery_no: row.delivery_no } };
  } catch (e) {
    const msg = msgOf(e);
    return { ok: false, error: `建立交車單失敗：${msg}` };
  }
}

export async function updateDeliveryAction(
  id: string,
  patch: Partial<DeliveryInput>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await updateDelivery(id, patch);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = msgOf(e);
    return { ok: false, error: `更新交車單失敗：${msg}` };
  }
}

/**
 * 更新 wizard 某個 step 的欄位，同時記錄 step_completion timestamp。
 * wizard 子頁的「下一步」按鈕呼叫這個。
 */
export async function updateDeliveryStepAction(
  deliveryId: string,
  step: DeliveryStepName,
  payload: DeliveryStepPayload,
  newStatus?: DeliveryStatus,
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await updateDeliveryStep(deliveryId, step, payload, newStatus);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = msgOf(e);
    return { ok: false, error: `儲存步驟失敗（${step}）：${msg}` };
  }
}

export async function setDeliveryStatusAction(
  id: string,
  status: DeliveryStatus,
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await setDeliveryStatus(id, status);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = msgOf(e);
    return { ok: false, error: `變更狀態失敗：${msg}` };
  }
}

/** 最後一步——完成交車，status → 'delivered' */
export async function completeDeliveryAction(
  deliveryId: string,
  payload: Pick<DeliveryStepPayload,
    | 'delivered_at'
    | 'ceremony_photos'
    | 'handover_docs_checklist'
    | 'keys_count'
    | 'keys_delivered_at'
    | 'customer_doc_signature'
  >,
): Promise<ActionResult<{ id: string }>> {
  try {
    const row = await updateDeliveryStep(deliveryId, 'ceremony', payload, 'delivered');

    // C-23：交車完成 → 非阻塞同步售後客戶檔 / 人車檔（失敗只記 log、不影響交車）
    after(async () => {
      try {
        await syncDeliveryToCustomerBase(row);
      } catch (e) {
        console.error('[C-23 交車→售後客戶檔] 副作用例外（不影響交車）', e);
      }
    });

    // 保固登記提醒：交車後 D+{warrantyRegDays} 天建 call_task（brand_config 設定值）
    after(async () => {
      try {
        await scheduleWarrantyReminderTask(row);
      } catch (e) {
        console.error('[warranty_reg_reminder] 副作用例外（不影響交車）', e);
      }
    });

    return { ok: true, data: { id: row.id } };
  } catch (e) {
    const msg = msgOf(e);
    return { ok: false, error: `完成交車失敗：${msg}` };
  }
}

export async function deleteDeliveryAction(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    await deleteDelivery(id);
    return { ok: true, data: { id } };
  } catch (e) {
    const msg = msgOf(e);
    return { ok: false, error: `刪除失敗：${msg}` };
  }
}

/** Status transition wrappers — 給 Kanban drag-and-drop / Detail Panel 用 */
export async function schedulePdiAction(id: string): Promise<ActionResult<{ id: string }>> {
  return setDeliveryStatusAction(id, 'pdi_in_progress');
}

export async function markPdiDoneAction(id: string): Promise<ActionResult<{ id: string }>> {
  return setDeliveryStatusAction(id, 'pdi_complete');
}

export async function confirmDeliveryAction(id: string): Promise<ActionResult<{ id: string }>> {
  return setDeliveryStatusAction(id, 'delivery_confirmed');
}

/** 撈 timeline 給 client detail panel */
export async function loadDeliveryTimelineAction(
  id: string,
): Promise<ActionResult<DeliveryTimelineEvent[]>> {
  try {
    const events = await _getDeliveryTimeline(id);
    return { ok: true, data: events };
  } catch (e) {
    const msg = msgOf(e);
    return { ok: false, error: `載入時間軸失敗：${msg}` };
  }
}

/**
 * 撈「該交車單關聯車輛的 PDI 完成狀態」給 RS05 STEP「PDI 完成確認」用。
 * 純讀，不建工單、不寫資料。
 */
export async function loadDeliveryPdiStatusAction(
  id: string,
): Promise<ActionResult<DeliveryPdiStatus>> {
  try {
    const status = await _getDeliveryPdiStatus(id);
    return { ok: true, data: status };
  } catch (e) {
    const msg = msgOf(e);
    return { ok: false, error: `載入 PDI 狀態失敗：${msg}` };
  }
}
