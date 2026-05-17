/**
 * Client-safe constants — CRM06A/B 推播任務（campaigns）
 */

import type { PushChannel } from "./sales-push-templates.constants";
export type { PushChannel };

export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "completed"
  | "cancelled"
  | "failed";

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "草稿",
  scheduled: "已排程",
  sending: "發送中",
  completed: "已完成",
  cancelled: "已取消",
  failed: "失敗",
};

export const CAMPAIGN_STATUS_BADGE: Record<
  CampaignStatus,
  { bg: string; fg: string }
> = {
  draft: { bg: "#F2F2F2", fg: "#6B6A68" },
  scheduled: { bg: "#EAF4FB", fg: "#185FA5" },
  sending: { bg: "#FDF3E3", fg: "#854F0B" },
  completed: { bg: "#EAF3DE", fg: "#3B6D11" },
  cancelled: { bg: "#F2F2F2", fg: "#6B6A68" },
  failed: { bg: "#FDECEA", fg: "#CC0000" },
};

/** HABC 分級 */
export const HABC_LEVELS = ["H", "A", "B", "C"] as const;
export type HabcLevel = (typeof HABC_LEVELS)[number];

export const HABC_BADGE: Record<HabcLevel, { bg: string; fg: string; desc: string }> = {
  H: { bg: "#FDECEA", fg: "#CC0000", desc: "頂級客戶" },
  A: { bg: "#FDF3E3", fg: "#854F0B", desc: "高潛力" },
  B: { bg: "#EAF4FB", fg: "#185FA5", desc: "穩定客戶" },
  C: { bg: "#E8F5E9", fg: "#2D7D32", desc: "一般客戶" },
};

export type CampaignExtraConditions = {
  first_purchase?: "all" | "yes" | "no";
  gender?: "all" | "M" | "F";
  cities?: string[];
  spend_min?: number;
  spend_max?: number;
  last_contact_days_gt?: number;
  birth_month?: number;
  delivery_months_ago?: number;
};

export type CampaignRow = {
  id: string;
  brand_id: string;
  kind: "sales" | "aftersales";
  name: string;
  template_id: string | null;
  template_name?: string | null;
  channel: PushChannel;
  message_body: string;
  buttons: Array<{ label: string; url: string }>;
  target_habc: string[];
  extra_conditions: CampaignExtraConditions;
  audience_count: number;
  scheduled_at: string | null;
  status: CampaignStatus;
  sent_count: number;
  read_count: number;
  click_count: number;
  convert_count: number;
  created_at: string;
  sent_at: string | null;
};

export type PushBoardKpi = {
  template_count: number;
  template_by_channel: Record<PushChannel, number>;
  avg_open_rate: number;
  monthly_sent: number;
  monthly_read: number;
  monthly_open_rate: number;
  monthly_campaign_count: number;
  monthly_convert: number;
  /**
   * CRM06B 新增：推播後 14 天內預約進廠率（僅 aftersales kind 有意義）
   * 計算分母：近 30 天已發出（completed）的售後 campaigns 對應的 sent_count 累計
   * 計算分子：同樣客群在發送日後 14 天內新開單的 work_orders 數
   * （v1：用樣本估算 — 真實對映需 deliveries 表 + customer 對齊；先給 demo 穩定值）
   */
  visit_within_14d_rate: number; // 百分比 0–100
  visit_within_14d_sample: number; // 樣本數（已發送 campaigns 總 sent_count）
};
