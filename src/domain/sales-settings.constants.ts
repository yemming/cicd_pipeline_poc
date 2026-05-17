/**
 * 常數抽到獨立檔（'use server' module 不能 export 非 async value）
 * 提案：docs/proposals/feature-sales-handcard-params.md
 */

export type SalesDictKind =
  | "lead_source"
  | "purchase_method"
  | "contact_type"
  | "payment_method"
  | "response_code"
  | "competitor"
  | "insurer"
  | "insurance_type"
  | "insurance_lost_reason";

export const SALES_DICT_KINDS: SalesDictKind[] = [
  "lead_source",
  "purchase_method",
  "contact_type",
  "payment_method",
  "response_code",
  "competitor",
  "insurer",
  "insurance_type",
  "insurance_lost_reason",
];

export const SALES_DICT_LABELS: Record<SalesDictKind, { title: string; subtitle: string; icon: string; accent: "blue" | "amber" | "teal" | "red" | "purple"; group: string }> = {
  lead_source: { title: "線索來源清單", subtitle: "RS01 電子手卡 → 線索來源下拉選單", icon: "📡", accent: "blue", group: "RS01 電子手卡" },
  purchase_method: { title: "購買方式", subtitle: "RS01 電子手卡 → 購買方式下拉選單", icon: "💳", accent: "amber", group: "RS01 電子手卡" },
  contact_type: { title: "接觸判別選項", subtitle: "RS01 電子手卡 → 接觸方式分類", icon: "🤝", accent: "teal", group: "RS01 電子手卡" },
  payment_method: { title: "付款方式", subtitle: "RS01 電子手卡 → 結帳付款方式", icon: "💰", accent: "blue", group: "RS01 電子手卡" },
  response_code: { title: "客戶回應代碼", subtitle: "CRM03A 電訪工作台 → 客戶回應分類", icon: "📞", accent: "amber", group: "CRM03A 電訪工作台" },
  competitor: { title: "競品去向清單", subtitle: "CRM03A 客戶去向；CRM07 未成交競品分析", icon: "🏁", accent: "red", group: "CRM03A 電訪工作台" },
  insurer: { title: "合作保險公司", subtitle: "RS_EX1 保險招攬 → 合作保險公司清單", icon: "🛡", accent: "purple", group: "RS_EX1 保險招攬" },
  insurance_type: { title: "投保險種項目", subtitle: "RS_EX1 保險招攬 → 險種項目", icon: "📋", accent: "purple", group: "RS_EX1 保險招攬" },
  insurance_lost_reason: { title: "流失原因（ROOT CAUSE）", subtitle: "RS_EX1 保險招攬 → 流失原因分析編碼", icon: "🔎", accent: "red", group: "RS_EX1 保險招攬" },
};

export const SALES_THRESHOLD_KEYS = [
  "first_followup_days",
  "second_followup_days",
  "dormant_days",
  "retention_years",
] as const;

export type SalesThresholdKey = (typeof SALES_THRESHOLD_KEYS)[number];

export const SALES_FLAG_KEYS = [
  "testdrive_booking",
  "line_push",
  "nps_auto_send",
  "used_car_cert_level",
  "personal_funnel_view",
] as const;

export type SalesFlagKey = (typeof SALES_FLAG_KEYS)[number];
