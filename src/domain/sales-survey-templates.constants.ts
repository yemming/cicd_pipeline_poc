/**
 * Constants for 電訪問卷模板（/crm/sales/survey-templates, /crm/aftersales/survey-templates）
 *
 * Pure types & const enums — safe to import from client components.
 * Server-only helper（含 supabase 直連）在 sales-survey-templates.ts。
 *
 * 拆出原因：detail / board (use client) 只需要型別 / 顯示常數，
 * 直接 import `@/domain/sales-survey-templates` 會把含 `import "server-only"`
 * 的 module graph 拖進 client bundle、Turbopack 編譯爆 build error。
 */

// ──────────────────────────────────────────────────────────────────────────
// 問卷類型 / 題目型別
// ──────────────────────────────────────────────────────────────────────────

export type SurveyKind = "sales" | "aftersales";

export type SurveyQuestionType = "single" | "multi" | "rating" | "text";

export const QUESTION_TYPES: SurveyQuestionType[] = [
  "single",
  "multi",
  "rating",
  "text",
];

export const QUESTION_TYPE_LABEL: Record<SurveyQuestionType, string> = {
  single: "單選題",
  multi: "複選題",
  rating: "評分題",
  text: "開放式文字",
};

export const QUESTION_TYPE_ICON: Record<SurveyQuestionType, string> = {
  single: "🔘",
  multi: "☑️",
  rating: "⭐",
  text: "📝",
};

export const QUESTION_TYPE_DESC: Record<SurveyQuestionType, string> = {
  single: "從選項中選一個",
  multi: "可選多個選項",
  rating: "NPS / 滿意度評分（1–10）",
  text: "客戶自由填寫",
};

export type SurveyQuestion = {
  id: string;
  label: string;
  type: SurveyQuestionType;
  options?: string[];
  required: boolean;
  /**
   * SA 電訪說明語（CRM02B spec § question.hint）
   * - 顯示在 CRM03B 電訪工作台題目旁，幫助 SA 詢問
   * - 主要給 aftersales 用；sales 側也可填、視為「電訪提示」
   */
  hint?: string;
};

// ──────────────────────────────────────────────────────────────────────────
// 問卷狀態（存在 metadata.status；不是 typed column）
// ──────────────────────────────────────────────────────────────────────────

export type SurveyStatus = "active" | "draft" | "archived";

export const SURVEY_STATUS_LABEL: Record<SurveyStatus, string> = {
  active: "啟用中",
  draft: "草稿",
  archived: "已封存",
};

export const SURVEY_STATUS_BADGE_CLS: Record<SurveyStatus, string> = {
  active: "bg-[#E1F5EE] text-[#0F6E56]",
  draft: "bg-[#FDF3E3] text-[#854F0B]",
  archived: "bg-[#F1EFE8] text-[#6B6A68]",
};

export const SURVEY_STATUS_DOT: Record<SurveyStatus, string> = {
  active: "#0F6E56",
  draft: "#F0C97E",
  archived: "#9A9890",
};

// ──────────────────────────────────────────────────────────────────────────
// 適用時機 — 銷售（CRM02A）vs 售後（CRM02B）兩套不同 timing
// 同一 jsonb metadata.applicable_timing 但值的合法集隨 kind 不同
// ──────────────────────────────────────────────────────────────────────────

/** CRM02A 銷售側 timing：到店後 / 成交 / 戰敗 / 休眠 */
export type SalesApplicableTiming =
  | "after_visit"
  | "deal_followup"
  | "lost_followup"
  | "dormant_activation";

/** CRM02B 售後側 timing：D+3 滿意度 / 回廠保養 / 保固到期 / Desmo 到期 / NPS 深訪 */
export type AftersalesApplicableTiming =
  | "d3_satisfaction"
  | "maintenance_reminder"
  | "warranty_reminder"
  | "desmo_reminder"
  | "nps_interview";

/** Union — metadata.applicable_timing 寫入時不分 kind，server 端不強驗值集 */
export type ApplicableTiming = SalesApplicableTiming | AftersalesApplicableTiming;

export const APPLICABLE_TIMING_LABEL: Record<ApplicableTiming, string> = {
  // sales
  after_visit: "到店後追蹤",
  deal_followup: "成交後回訪",
  lost_followup: "未成交分析",
  dormant_activation: "休眠激活",
  // aftersales
  d3_satisfaction: "D+3 滿意度回訪",
  maintenance_reminder: "回廠保養提醒",
  warranty_reminder: "保固到期提醒",
  desmo_reminder: "Desmo 到期提醒",
  nps_interview: "NPS 深度訪談",
};

export const APPLICABLE_TIMING_DOT: Record<ApplicableTiming, string> = {
  after_visit: "#185FA5",
  deal_followup: "#0F6E56",
  lost_followup: "#C8001A",
  dormant_activation: "#854F0B",
  d3_satisfaction: "#C8001A",
  maintenance_reminder: "#D4820A",
  warranty_reminder: "#0F6E56",
  desmo_reminder: "#185FA5",
  nps_interview: "#534AB7",
};

export const APPLICABLE_TIMING_ICON: Record<ApplicableTiming, string> = {
  after_visit: "🚪",
  deal_followup: "🤝",
  lost_followup: "💔",
  dormant_activation: "⏳",
  d3_satisfaction: "📞",
  maintenance_reminder: "⏰",
  warranty_reminder: "🛡️",
  desmo_reminder: "⚙️",
  nps_interview: "📊",
};

/** sales 側 sidebar / filter dropdown 用 */
export const SALES_TIMING_ORDER: SalesApplicableTiming[] = [
  "after_visit",
  "deal_followup",
  "lost_followup",
  "dormant_activation",
];

/** aftersales 側 sidebar / filter dropdown 用 */
export const AFTERSALES_TIMING_ORDER: AftersalesApplicableTiming[] = [
  "d3_satisfaction",
  "maintenance_reminder",
  "warranty_reminder",
  "desmo_reminder",
  "nps_interview",
];

/** 回傳該 kind 對應的合法 timing list（用於下拉、sidebar、KPI 計算） */
export function timingOrderFor(kind: SurveyKind): ApplicableTiming[] {
  return kind === "aftersales"
    ? [...AFTERSALES_TIMING_ORDER]
    : [...SALES_TIMING_ORDER];
}

/** 沿用舊命名以維持既有 sales 側元件相容 */
export const APPLICABLE_TIMING_ORDER = SALES_TIMING_ORDER;

// ──────────────────────────────────────────────────────────────────────────
// HABC 對象（與 sales-customer-base.constants HABC 對齊；本頁多 2 個衍生狀態）
// ──────────────────────────────────────────────────────────────────────────

export type SurveyHabcTarget = "H" | "A" | "B" | "C";

export const SURVEY_HABC_TARGETS: SurveyHabcTarget[] = ["H", "A", "B", "C"];

export const SURVEY_HABC_LABEL: Record<SurveyHabcTarget, string> = {
  H: "H 熱潛客",
  A: "A 積極跟進",
  B: "B 培養中",
  C: "C 長期維護",
};

export const SURVEY_HABC_ICON: Record<SurveyHabcTarget, string> = {
  H: "🔴",
  A: "🟡",
  B: "🔵",
  C: "⬜",
};

// ──────────────────────────────────────────────────────────────────────────
// metadata jsonb 形狀（單一事實來源；helper read/write 都認這個 shape）
// ──────────────────────────────────────────────────────────────────────────

export type SurveyVersionEntry = {
  ver: string;
  date: string;
  note: string;
  archived_at: string | null;
  /**
   * 版本快照 — 還原時可整包回填到 questions / metadata.sa_script。
   * v1 留空 = 純歷史記錄；CRM02B 起寫入快照才能支援「還原此版」。
   */
  snapshot?: {
    questions?: SurveyQuestion[];
    sa_script?: string;
  };
};

export type SurveyMetadata = {
  applicable_timing?: ApplicableTiming | null;
  target_habc?: SurveyHabcTarget[];
  status?: SurveyStatus;
  icon?: string | null;
  versions?: SurveyVersionEntry[];
  /**
   * SA 建議話術腳本（CRM02B 售後專用 — 整份問卷層級、開場白用）
   * 顯示於 CRM03B 電訪工作台「建議話術」欄位
   */
  sa_script?: string;
  /**
   * 適用電訪類型多選（CRM02B spec § timing-grid 可複選；
   * 與 applicable_timing 並存：applicable_timing 是主軸（sidebar 篩選用）、
   * timing_tags 是該問卷可同時涵蓋的副軸 chip）
   */
  timing_tags?: ApplicableTiming[];
};

// ──────────────────────────────────────────────────────────────────────────
// Row & filters（client component 拿來宣告 props 型別）
// ──────────────────────────────────────────────────────────────────────────

export type SurveyTemplateRow = {
  id: string;
  brand_id: string;
  kind: SurveyKind;
  code: string;
  name: string;
  description: string | null;
  target_segment: string | null;
  questions: SurveyQuestion[];
  effective_from: string | null;
  effective_to: string | null;
  is_active: boolean;
  metadata: SurveyMetadata;
  created_at: string;
  updated_at: string;
};

export type SurveyTemplateFilters = {
  kind: SurveyKind;
  /** all | active | inactive */
  status: string;
  /** all | draft | archived */
  meta_status: string;
  /** all | <ApplicableTiming> */
  timing: string;
  /** code / name / target_segment / description */
  q: string;
};

export type SurveyTemplateKpi = {
  total: number;
  active: number;
  draft: number;
  archived: number;
  this_month_modified: number;
  /** 部分 record — 該 kind 沒有的 timing 不會出現在 key */
  by_timing: Partial<Record<ApplicableTiming, number>>;
};

// ──────────────────────────────────────────────────────────────────────────
// Helpers（pure，可在 client / server 兩邊用）
// ──────────────────────────────────────────────────────────────────────────

export function readSurveyStatus(meta: SurveyMetadata | null | undefined): SurveyStatus {
  const s = meta?.status;
  if (s === "active" || s === "draft" || s === "archived") return s;
  return "active";
}

const ALL_TIMINGS = new Set<string>([
  ...SALES_TIMING_ORDER,
  ...AFTERSALES_TIMING_ORDER,
]);

export function readSurveyTiming(
  meta: SurveyMetadata | null | undefined,
): ApplicableTiming | null {
  const t = meta?.applicable_timing;
  if (typeof t === "string" && ALL_TIMINGS.has(t))
    return t as ApplicableTiming;
  return null;
}

export function readSurveyHabc(
  meta: SurveyMetadata | null | undefined,
): SurveyHabcTarget[] {
  const raw = meta?.target_habc;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is SurveyHabcTarget =>
    x === "H" || x === "A" || x === "B" || x === "C",
  );
}

export function readSurveyVersions(
  meta: SurveyMetadata | null | undefined,
): SurveyVersionEntry[] {
  const v = meta?.versions;
  return Array.isArray(v) ? v : [];
}

export function readSurveyIcon(
  meta: SurveyMetadata | null | undefined,
  kind: SurveyKind,
): string {
  const i = meta?.icon;
  if (typeof i === "string" && i.trim()) return i;
  return kind === "aftersales" ? "🔧" : "📋";
}

export function readSurveySaScript(
  meta: SurveyMetadata | null | undefined,
): string {
  const s = meta?.sa_script;
  return typeof s === "string" ? s : "";
}

export function readSurveyTimingTags(
  meta: SurveyMetadata | null | undefined,
): ApplicableTiming[] {
  const tags = meta?.timing_tags;
  if (!Array.isArray(tags)) return [];
  const valid = new Set<ApplicableTiming>([
    ...SALES_TIMING_ORDER,
    ...AFTERSALES_TIMING_ORDER,
  ]);
  return tags.filter((t): t is ApplicableTiming => valid.has(t));
}
