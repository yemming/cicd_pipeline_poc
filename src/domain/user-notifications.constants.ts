/**
 * Constants & Types — RP8 站內通知（純 client-safe）
 *
 * 分離自 user-notifications.ts（"use server"），讓 API route + client component 可直接 import。
 */

export type InappPriority = "red" | "orange" | "grey";

/** 前端渲染用的站內通知列（對映 user_notifications 表） */
export type InappNotification = {
  id: string;
  /** 業務事件 code */
  event_code: string | null;
  title: string;
  body: string | null;
  priority: InappPriority;
  /** 導航連結（從 ref.href 展開） */
  href?: string;
  /** 關聯的維修工單 ID（從 ref.source_ro_id 展開） */
  source_ro_id?: string;
  /** 關聯的維修工單編號（從 ref.source_ro_code 展開） */
  source_ro_code?: string;
  /** 其他 metadata（ref 剩餘欄位） */
  extra?: Record<string, unknown>;
  /** null = 未讀；非 null = 已讀時間 */
  read_at: string | null;
  created_at: string;
};

/** 寫入 user_notifications 的輸入（供 createInappNotification 使用） */
export type CreateInappNotificationInput = {
  /** 收件人 user_id（auth.uid）*/
  recipient_user_id: string;
  /** 業務事件 code */
  event_code: string;
  /** 通知標題 */
  title: string;
  /** 通知內文 */
  body: string;
  /** 優先級 */
  priority: InappPriority;
  /** 導航連結（可選） */
  href?: string;
  /** 關聯工單 ID（可選） */
  source_ro_id?: string;
  /** 關聯工單編號（可選） */
  source_ro_code?: string;
  /** 額外 metadata（可選）*/
  extra?: Record<string, unknown>;
  /** 品牌 ID（可選，未傳則從 scope 推斷）*/
  brand_id?: string;
};
