/**
 * Client-safe constants for call-tasks（電訪工作檯）
 *
 * 純展示常數（labels / badges）拆出來，這支沒 import server-only / next/headers，
 * client component 可以直接 import 而不會把 supabase server client 拉進 bundle。
 *
 * 業務 type（CallTaskStatus / CallTaskResult / SurveyKind）也在這裡 re-export 一份，
 * client component 統一從 .constants 拿。Server-only 的 query / shape 仍走 sales-call-tasks.ts。
 */

import type { SurveyKind } from "@/domain/sales-survey-templates.constants";
export type { SurveyKind };

export type CallTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped";

/** 衍生狀態（給 card 視覺用，不是 DB 欄位） */
export type CallTaskDerivedStatus =
  | "overdue"
  | "today"
  | "done"
  | "scheduled"
  | "skipped";

export type CallTaskResult =
  | "answered"
  | "no_answer"
  | "refused"
  | "wrong_number"
  | "callback_later";

export const STATUS_LABEL: Record<CallTaskStatus, string> = {
  pending: "待撥打",
  in_progress: "進行中",
  completed: "已完成",
  skipped: "已跳過",
};

export const STATUS_BADGE: Record<CallTaskStatus, { bg: string; fg: string }> = {
  pending: { bg: "#EAF4FB", fg: "#185FA5" },
  in_progress: { bg: "#FDF3E3", fg: "#854F0B" },
  completed: { bg: "#EAF3DE", fg: "#3B6D11" },
  skipped: { bg: "#F2F2F2", fg: "#6B6A68" },
};

export const RESULT_LABEL: Record<CallTaskResult, string> = {
  answered: "接通",
  no_answer: "未接",
  refused: "拒絕",
  wrong_number: "號碼錯誤",
  callback_later: "稍後再撥",
};

// ──────────────────────────────────────────────────────────────────────────
// 電訪任務分類（call_type）— 對應 BDN 第四輪 / CRM03A spec tab pills
//
// sales 側 4 種：D+3 / D+7 / 邀約活動 / 自訂跟進
// aftersales 側 5 種：D+3 滿意 / 保養提醒 / 保固提醒 / Desmo 提醒 / NPS 訪談
// 兩 kind 共用 enum；filter UI 只顯示對應 kind 的子集。
// ──────────────────────────────────────────────────────────────────────────

export type SalesCallType =
  | "d3_followup"
  | "d7_followup"
  | "event_invite"
  | "custom";

export type AftersalesCallType =
  | "aftersales_d3"
  | "maintenance_reminder"
  | "warranty_reminder"
  | "desmo_reminder"
  | "nps_interview";

export type CallTaskType = SalesCallType | AftersalesCallType;

export const SALES_CALL_TYPES: SalesCallType[] = [
  "d3_followup",
  "d7_followup",
  "event_invite",
  "custom",
];

export const AFTERSALES_CALL_TYPES: AftersalesCallType[] = [
  "aftersales_d3",
  "maintenance_reminder",
  "warranty_reminder",
  "desmo_reminder",
  "nps_interview",
];

export const CALL_TYPE_LABEL: Record<CallTaskType, string> = {
  d3_followup: "D+3 即時追蹤",
  d7_followup: "D+7 深度確認",
  event_invite: "活動邀約",
  custom: "自訂跟進",
  aftersales_d3: "D+3 售後滿意度",
  maintenance_reminder: "保養回廠提醒",
  warranty_reminder: "保固到期提醒",
  desmo_reminder: "Desmo 到期提醒",
  nps_interview: "NPS 深度訪談",
};

export const CALL_TYPE_SHORT_LABEL: Record<CallTaskType, string> = {
  d3_followup: "D+3",
  d7_followup: "D+7",
  event_invite: "邀約",
  custom: "自訂",
  aftersales_d3: "售後 D+3",
  maintenance_reminder: "保養",
  warranty_reminder: "保固",
  desmo_reminder: "Desmo",
  nps_interview: "NPS",
};

export type CallTypeColor =
  | "red"
  | "amber"
  | "blue"
  | "teal"
  | "purple"
  | "navy";

export const CALL_TYPE_COLOR: Record<CallTaskType, CallTypeColor> = {
  d3_followup: "red",
  d7_followup: "amber",
  event_invite: "blue",
  custom: "purple",
  aftersales_d3: "teal",
  maintenance_reminder: "amber",
  warranty_reminder: "blue",
  desmo_reminder: "red",
  nps_interview: "purple",
};

/** 預設話術範本（Phase 1 寫死前端常數，未來搬到 survey_templates） */
export const CALL_SCRIPT_TEMPLATES: Record<
  CallTaskType,
  { tag: string; text: string; hints: string[] }
> = {
  d3_followup: {
    tag: "話術提示 — D+3 追蹤",
    text:
      "您好，我是 INDIAN 台北展示中心的業務，三天前看到您留下車輛資訊，特別來電關心您現在的考慮進度，有沒有什麼問題我可以協助釐清？",
    hints: ["確認分期方案", "詢問決策進度", "提供補充資料", "邀約再次到店"],
  },
  d7_followup: {
    tag: "話術提示 — D+7 深度確認",
    text:
      "您好,我是上週聯絡過您的業務,想再次確認您對 FTR 1200 的考慮進度,如果您仍在比較,我可以提供更多試乘資源或方案說明。",
    hints: ["了解猶豫點", "比較競品優勢", "提供試乘", "升等配件方案"],
  },
  event_invite: {
    tag: "話術提示 — 活動邀約",
    text:
      "您好,我們 5/25(六)在花博園區舉辦春季試駕活動,現場有全車系試駕、原廠教練指導、限定週邊,想邀請您前來體驗,您方便參加嗎?",
    hints: ["確認到場時間", "登記試駕車型", "提醒攜帶駕照", "現場交通指引"],
  },
  custom: {
    tag: "話術提示 — 自訂跟進",
    text:
      "您好,延續上次討論,我幫您查了您詢問的細節,想跟您回報並確認您的下一步安排⋯",
    hints: ["回應客戶主動詢問", "確認下一步", "預約看車或試乘"],
  },
  aftersales_d3: {
    tag: "話術提示 — D+3 售後滿意度",
    text:
      "您好,我是 INDIAN 售後服務的 SA,三天前您在我們這邊進廠保養,想跟您確認車況有沒有什麼異常,並了解您對這次服務的滿意度。",
    hints: ["確認車況", "詢問 NPS", "提醒下次保養", "感謝光臨"],
  },
  maintenance_reminder: {
    tag: "話術提示 — 保養提醒",
    text:
      "您好,系統提醒您的愛車已接近保養里程/時間,建議您提早預約保養時段,以維持最佳行駛狀態與保固權益。",
    hints: ["確認里程", "預約進廠日", "報價透明說明", "備用車安排"],
  },
  warranty_reminder: {
    tag: "話術提示 — 保固到期",
    text:
      "您好,您的車輛原廠保固即將到期,如有打算延長保固期限,我們有原廠延保方案可以介紹,有沒有空 5 分鐘聊一下?",
    hints: ["說明延保方案", "提醒到期日", "回顧車況", "推薦健診"],
  },
  desmo_reminder: {
    tag: "話術提示 — Desmo Service 到期",
    text:
      "您好,您的 Desmodromic 機構里程已接近原廠建議的檢修時機,為確保引擎效能與您的行車安全,建議盡快回廠檢修。",
    hints: ["技術重要性說明", "報價透明", "安排檢修時段", "施工天數預估"],
  },
  nps_interview: {
    tag: "話術提示 — NPS 深度訪談",
    text:
      "您好,感謝您是我們的 VIP 客戶,想邀請您撥 5 分鐘做一份服務滿意度深度訪談,協助我們持續改善,作為感謝會贈送原廠精品⋯",
    hints: ["強調 VIP 身份", "說明訪談時長", "解釋資料用途", "贈品說明"],
  },
};

// ──────────────────────────────────────────────────────────────────────────
// Row / KPI / Filter types — client-safe，給 board 元件用
// ──────────────────────────────────────────────────────────────────────────

/**
 * 進廠資訊（售後 D+3 等任務專用）— call_task 透過 metadata.work_order_id link 到
 * work_orders 後、helper LEFT JOIN 帶下來給卡片展開區渲染綠色資訊條。
 */
export type CallTaskWorkOrderInfo = {
  id: string;
  ro_no: string;
  opened_at: string | null;
  closed_at: string | null;
  mileage_in: number | null;
  total_amount: number | null;
  status: string | null;
};

export type CallTaskBoardRow = {
  id: string;
  brand_id: string;
  kind: SurveyKind;
  call_type: CallTaskType | null;
  customer_id: string;
  customer_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  survey_template_id: string | null;
  survey_code: string | null;
  survey_name: string | null;
  assignee_id: string | null;
  rs_name: string | null;
  scheduled_at: string | null;
  status: CallTaskStatus;
  derived_status: CallTaskDerivedStatus;
  call_result: CallTaskResult | null;
  attempt_count: number;
  last_attempt_at: string | null;
  notes: string | null;
  goal: string | null;
  competitor_brand: string | null;
  next_followup_date: string | null;
  /** NPS 評分（aftersales D+3/NPS 任務專用，0-10） */
  nps_score: number | null;
  metadata: Record<string, unknown>;
  /** 進廠資訊（aftersales 任務專用、metadata.work_order_id LEFT JOIN 帶回） */
  work_order: CallTaskWorkOrderInfo | null;
  created_at: string;
  updated_at: string;
};

export type CallTaskBoardKpi = {
  total: number;
  overdue: number;
  today: number;
  done_today: number;
  scheduled: number;
  /** 本月 NPS 均分（0-10，aftersales 專用、sales 永遠為 null） */
  nps_monthly_avg: number | null;
  /** 本月 NPS 樣本數（aftersales 專用） */
  nps_monthly_count: number;
};

export type CallTaskBoardFilters = {
  kind: SurveyKind;
  /** YYYY-MM-DD（Asia/Taipei 視角） */
  date: string;
  /** all | overdue | today | done | scheduled */
  status: string;
  /** all | d3_followup | d7_followup | event_invite | custom | aftersales_d3 | ... */
  call_type: string;
  /** all | mine | unassigned */
  assignee: string;
};

/** 標準通話結果 5 chip（spec § result-icons） */
export const CALL_RESULT_OPTIONS: {
  key: CallTaskResult;
  label: string;
  tint: "teal" | "amber" | "red" | "navy" | "gray";
}[] = [
  { key: "answered", label: "✅ 已接通", tint: "teal" },
  { key: "no_answer", label: "📵 未接聽", tint: "amber" },
  { key: "callback_later", label: "📅 改期再撥", tint: "navy" },
  { key: "refused", label: "❌ 結案 / 不再聯繫", tint: "red" },
  { key: "wrong_number", label: "📬 號碼錯誤", tint: "gray" },
];
