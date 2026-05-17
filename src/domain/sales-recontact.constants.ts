/**
 * Client-safe constants — 再接觸排程（CRM04A Tab 3 / CRM04B Tab 3）
 *
 * 走 call_tasks 表 + metadata.subkind='recontact'，不開新表。
 */

export type RecontactKind = "sales" | "aftersales";

export type SalesContactMethod =
  | "phone"
  | "line_sms"
  | "email"
  | "event_invite"
  | "new_model_event";

export type AftersalesContactMethod =
  | "phone"
  | "line_sms"
  | "email"
  | "event_invite"
  | "free_inspection"
  | "warranty_reminder"
  | "desmo_reminder";

export type RecontactMethod = SalesContactMethod | AftersalesContactMethod;

export const SALES_CONTACT_METHODS: Array<{
  key: SalesContactMethod;
  label: string;
}> = [
  { key: "phone", label: "📞 電話關懷" },
  { key: "line_sms", label: "📱 LINE 訊息" },
  { key: "email", label: "📧 E-mail" },
  { key: "event_invite", label: "🎟️ 活動邀請（Track Day / DRE）" },
  { key: "new_model_event", label: "🏍️ 新車款發表邀請" },
];

export const AFTERSALES_CONTACT_METHODS: Array<{
  key: AftersalesContactMethod;
  label: string;
}> = [
  { key: "phone", label: "📞 電話關懷" },
  { key: "line_sms", label: "📱 LINE / SMS 推播" },
  { key: "email", label: "📧 E-mail" },
  { key: "event_invite", label: "🎟️ 活動邀請（騎士節 / DRE）" },
  { key: "free_inspection", label: "🔧 免費車況健檢邀請" },
  { key: "warranty_reminder", label: "🛡️ 保固到期通知" },
  { key: "desmo_reminder", label: "⚙️ Desmo 到期提醒" },
];

export function contactMethodsFor(
  kind: RecontactKind,
): Array<{ key: RecontactMethod; label: string }> {
  return kind === "aftersales"
    ? (AFTERSALES_CONTACT_METHODS as Array<{ key: RecontactMethod; label: string }>)
    : (SALES_CONTACT_METHODS as Array<{ key: RecontactMethod; label: string }>);
}

export const RECONTACT_METHOD_LABEL: Record<RecontactMethod, string> = {
  phone: "電話關懷",
  line_sms: "LINE / SMS",
  email: "E-mail",
  event_invite: "活動邀請",
  new_model_event: "新車發表",
  free_inspection: "免費健檢",
  warranty_reminder: "保固到期",
  desmo_reminder: "Desmo 到期",
};

/** 接觸方式 chip 色（沿用 spec b-* 色票） */
export const RECONTACT_METHOD_BADGE: Record<
  RecontactMethod,
  { bg: string; fg: string }
> = {
  phone: { bg: "#E8ECF2", fg: "#1A3A5C" },
  line_sms: { bg: "#E1F5EE", fg: "#0F6E56" },
  email: { bg: "#F2F2F2", fg: "#5A5955" },
  event_invite: { bg: "#EEEDFE", fg: "#534AB7" },
  new_model_event: { bg: "#EAF4FB", fg: "#185FA5" },
  free_inspection: { bg: "#E1F5EE", fg: "#0F6E56" },
  warranty_reminder: { bg: "#EAF4FB", fg: "#185FA5" },
  desmo_reminder: { bg: "#FDF3E3", fg: "#854F0B" },
};
