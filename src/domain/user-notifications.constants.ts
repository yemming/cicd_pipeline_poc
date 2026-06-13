/**
 * Constants & Types — RP8 站內通知（純 client-safe）
 *
 * 分離自 user-notifications.ts（"use server"），讓 API route + client component 可直接 import。
 */

export const INAPP_CHANNEL = "inapp" as const;

export type InappPriority = "red" | "orange" | "grey";

/** 站內通知的 event_payload 形狀 */
export type InappPayload = {
  title: string;
  body: string;
  href?: string;
  priority: InappPriority;
  source_ro_id?: string;
  source_ro_code?: string;
  /** 額外 metadata（自由格式）*/
  extra?: Record<string, unknown>;
};

/** 前端渲染用的站內通知列 */
export type InappNotification = {
  id: string;
  /** 與 notification_deliveries.event_code 對應 */
  event_code: string;
  payload: InappPayload;
  /** 'sent'=未讀 / 'acknowledged'=已讀 */
  status: "sent" | "acknowledged";
  created_at: string;
};
