/**
 * Client-safe constants — CRM06A/B 銷售/售後推播通知（範本）
 *
 * server-only 的 query / shape 在 sales-push-templates.ts；
 * client 元件統一從 .constants 拿型別 / labels / badge tokens，避免把 supabase server 拉進 bundle。
 */

export type PushKind = "sales" | "aftersales";

export type PushChannel = "line" | "sms" | "email" | "both";

export const PUSH_CHANNEL_LABEL: Record<PushChannel, string> = {
  line: "LINE",
  sms: "簡訊",
  email: "Email",
  both: "LINE + 簡訊",
};

/**
 * spec：LINE 綠 / SMS 黃 / Email 藍（CRM06B v2 統一色票）
 * tokens 對齊 DealerOS design pattern：
 *   - LINE  → 成功綠 bg-[#EAF3DE] text-[#3B6D11]（也呼應 LINE 品牌綠 #06C755）
 *   - SMS   → 警告黃 bg-[#FDF3E3] text-[#854F0B]
 *   - Email → 資訊藍 bg-[#EAF4FB] text-[#185FA5]
 *   - both  → 雙通道紫（不在 spec 三色內，保留供 backward compat）
 */
export const PUSH_CHANNEL_BADGE: Record<
  PushChannel,
  { bg: string; fg: string; label: string; icon: string }
> = {
  line: { bg: "#EAF3DE", fg: "#3B6D11", label: "LINE", icon: "💬" },
  sms: { bg: "#FDF3E3", fg: "#854F0B", label: "簡訊", icon: "📱" },
  email: { bg: "#EAF4FB", fg: "#185FA5", label: "Email", icon: "📧" },
  both: { bg: "#EEEDFE", fg: "#534AB7", label: "雙通道", icon: "💬📱" },
};

/** 範本分類（spec：6 個分類） */
export const PUSH_TEMPLATE_CATEGORIES = [
  "交車慶賀",
  "保養提醒",
  "試駕邀請",
  "活動通知",
  "生日祝福",
  "滿意度追蹤",
] as const;

export type PushTemplateCategory = (typeof PUSH_TEMPLATE_CATEGORIES)[number];

export const PUSH_TEMPLATE_CATEGORY_ICON: Record<PushTemplateCategory, string> = {
  交車慶賀: "🎉",
  保養提醒: "🔧",
  試駕邀請: "🏍️",
  活動通知: "🏁",
  生日祝福: "🎂",
  滿意度追蹤: "💬",
};

export type PushTemplateRow = {
  id: string;
  brand_id: string;
  kind: PushKind;
  category: string;
  name: string;
  channel: PushChannel;
  icon: string | null;
  body: string;
  buttons: Array<{ label: string; url: string }>;
  used_count: number;
  open_rate: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};
