/**
 * Constants — 售後 取車通知（Pickup Notification）
 *
 * Spec：bb3b7121-ebc9-4fef-9843-aec5b01c8b77（取車通知）
 *
 * 流程：竣工複檢 final_inspections.status='completed'
 *       → SA 在本頁手動點「發送 Line / 簡訊」
 *       → append 一筆 PickupNotificationRecord 進 final_inspections.notifications jsonb
 *
 * 不另開 schema：notifications 欄位本來就是 jsonb，POC 階段直接 append 紀錄。
 */

export const PICKUP_CHANNELS = ["line", "sms", "phone"] as const;
export type PickupChannel = (typeof PICKUP_CHANNELS)[number];

export const CHANNEL_LABEL: Record<PickupChannel, string> = {
  line: "Line",
  sms: "簡訊",
  phone: "電話提醒",
};

export const CHANNEL_CHIP: Record<PickupChannel, string> = {
  line: "bg-[#E1F5EE] text-[#0F6E56]",
  sms: "bg-[#EAF4FB] text-[#185FA5]",
  phone: "bg-[#EEEDFE] text-[#534AB7]",
};

export type PickupNotificationRecord = {
  channel: PickupChannel;
  sent_at: string; // ISO
  sent_by?: string | null;
  body?: string;
  kind: "pickup"; // 跟既有 final_inspections.notifications 其他用途區隔
};

/** 預設 Line 範本 */
export const DEFAULT_LINE_TEMPLATE = `親愛的 {車主姓名} 您好，
您的 {車型} ({車牌}) 維修作業已完成，
請您方便時前來取車。

DealerOS 售後敬上`;

/** 預設簡訊範本 */
export const DEFAULT_SMS_TEMPLATE = `{車主姓名} 您好，您的{車型}({車牌})已完修，請取車。`;

/**
 * 把範本套上資料，產生實際訊息內文。
 */
export function renderPickupTemplate(
  template: string,
  vars: { customer_name?: string | null; vehicle_model?: string | null; vehicle_plate?: string | null },
): string {
  return template
    .replaceAll("{車主姓名}", vars.customer_name ?? "車主")
    .replaceAll("{車型}", vars.vehicle_model ?? "")
    .replaceAll("{車牌}", vars.vehicle_plate ?? "");
}
