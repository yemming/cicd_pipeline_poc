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
import {
  checkAndNotifyDisputeFrozen,
  markSalesOrderDelivered,
  markInventorySold,
  scheduleD3FollowupTask,
  resolveDeliveryVehicleKind,
  getUsedCarDeliveryPrereq,
} from '@/domain/deliveries';
import type { UsedCarDeliveryPrereq } from '@/domain/deliveries.constants';

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

/**
 * 最後一步——完成交車，status → 'delivered'
 *
 * 前置驗證（任一失敗即拒絕，與前端 UI 順序無關）：
 *   [B2]    PDI 整備完成驗證（新車限定）— 工單未關單則拒絕
 *   [輪6-2] 中古車消保法車況說明書簽署驗證
 *
 * 連鎖動作（after() 非阻塞，失敗不影響交車本體）：
 *   [輪6-4] 前置：檢查 dispute_frozen — true 時跳過所有自動化並通知主管
 *   [C-23]  售後客戶檔 / 人車檔同步
 *   [輪6-3] ① sales_orders.status → 'delivered'
 *   [輪6-3] ② new_car_inventory / used_car_inventory.status → 'sold'（依 contract_type 分流）
 *   [輪6-3] ③ call_tasks D+3（kind='sales', call_type='d3_followup'）
 *   [輪6-3] ④ call_tasks D+10 warranty_reminder（④ 限新車，中古車不建）
 */
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
    // [B2] PDI 整備完成前置驗證（新車限定）
    // hasLinkedCar=true 代表在 new_car_inventory 找到車（即新車）；
    // 中古車查不到新車庫存（hasLinkedCar=false），故不受此擋關影響。
    // 即使前端按鈕被繞過（直接呼叫此 action），後端也會擋住。
    const pdiStatus = await _getDeliveryPdiStatus(deliveryId);
    if (pdiStatus.hasLinkedCar && !pdiStatus.canProceed) {
      return {
        ok: false,
        error: 'PDI整備尚未完成，無法進行交車。請先確認技師完成PDI整備後再操作。',
      };
    }

    // 中古車交車獨立前置條件（消保法）：買方需先簽署車況說明書，否則不得交車
    // 伺服器端強制檢查——即使前端按鈕被繞過（改網址直接打此 action）也擋得住
    const prereq = await getUsedCarDeliveryPrereq(deliveryId);
    if (prereq.hasLinkedCar && !prereq.canProceed) {
      return { ok: false, error: '尚未完成車況說明書簽署，無法交車（消保法規定買方需先確認車況）' };
    }

    const row = await updateDeliveryStep(deliveryId, 'ceremony', payload, 'delivered');

    // C-23：交車完成 → 非阻塞同步售後客戶檔 / 人車檔（失敗只記 log、不影響交車）
    after(async () => {
      try {
        await syncDeliveryToCustomerBase(row);
      } catch (e) {
        console.error('[C-23 交車→售後客戶檔] 副作用例外（不影響交車）', e);
      }
    });

    // 輪6-4 + 輪6-3：連鎖自動化動作（dispute_frozen 檢查 → 各動作）
    after(async () => {
      try {
        // [輪6-4] dispute_frozen 檢查 — 凍結時通知主管並跳過
        const isFrozen = await checkAndNotifyDisputeFrozen(row);
        if (isFrozen) return;

        // 判斷車輛類型（new / used），用來分流庫存更新與 warranty_reminder
        const vehicleKind = await resolveDeliveryVehicleKind(row);

        // [輪6-3①] 銷售訂單 → delivered
        await markSalesOrderDelivered(row);

        // [輪6-3②] 庫存 → sold（新車：new_car_inventory；中古車：used_car_inventory）
        await markInventorySold(row, vehicleKind);

        // [輪6-3③] D+3 電訪任務
        await scheduleD3FollowupTask(row);

        // [輪6-3④] 保固登記提醒：僅限新車（中古車不建 warranty_registration_reminder）
        if (vehicleKind !== 'used') {
          await scheduleWarrantyReminderTask(row);
        }
      } catch (e) {
        console.error('[delivery chain] 連鎖動作例外（不影響交車本體）', e);
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

/**
 * [輪6-2] 中古車交車前置條件確認——
 * 查 used_car_inventory.metadata.condition_report.customer_acknowledged_at。
 * 中古車交車 wizard 的 STEP 2（PDI 換成「車況報告確認」）呼叫此 action。
 */
export async function loadUsedCarDeliveryPrereqAction(
  id: string,
): Promise<ActionResult<UsedCarDeliveryPrereq>> {
  try {
    const prereq = await getUsedCarDeliveryPrereq(id);
    return { ok: true, data: prereq };
  } catch (e) {
    const msg = msgOf(e);
    return { ok: false, error: `載入中古車前置條件失敗：${msg}` };
  }
}
