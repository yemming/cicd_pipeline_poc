/**
 * Constants for CSI Survey Responses（/csi/surveys/[id]/responses, /csi/surveys/respond/[token]）
 *
 * Pure types & const — safe to import from client components。
 * Server-only helper（含 supabase 直連）在 surveys.ts。
 */

export type SurveyResponseStatus = "sent" | "responded" | "expired";

export const SURVEY_RESPONSE_STATUS_LABEL: Record<SurveyResponseStatus, string> = {
  sent: "待回填",
  responded: "已回填",
  expired: "已過期",
};

export const SURVEY_RESPONSE_STATUS_BADGE_CLS: Record<SurveyResponseStatus, string> = {
  sent: "bg-[#FDF3E3] text-[#854F0B]",
  responded: "bg-[#EAF3DE] text-[#3B6D11]",
  expired: "bg-[#F2F2F2] text-[#6B6A68]",
};

export type SurveyResponseSourceModule = "service" | "sales" | "manual";

export const SURVEY_RESPONSE_SOURCE_LABEL: Record<SurveyResponseSourceModule, string> = {
  service: "售後維修",
  sales: "銷售訂單",
  manual: "後台派發",
};

// ──────────────────────────────────────────────────────────────────────────
// Row 型別（client component 拿來宣告 props）
// ──────────────────────────────────────────────────────────────────────────

export type SurveyResponseRow = {
  id: string;
  brand_id: string;
  template_id: string;
  target_customer_id: string | null;
  target_user_id: string | null;
  token: string;
  status: SurveyResponseStatus;
  response_json: Record<string, unknown>;
  sent_at: string;
  responded_at: string | null;
  source_module: SurveyResponseSourceModule | null;
  source_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

/** list 頁面用的 enriched row，附 customer / template 顯示資訊 */
export type SurveyResponseListRow = SurveyResponseRow & {
  customer_name: string | null;
  customer_code: string | null;
  customer_phone: string | null;
  template_code: string;
  template_name: string;
  template_kind: "sales" | "aftersales";
};
