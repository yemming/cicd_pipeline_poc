/**
 * Client-safe constants for call-tasks（電訪工作檯）
 *
 * 純展示常數（labels / badges）拆出來，這支沒 import server-only / next/headers，
 * client component 可以直接 import 而不會把 supabase server client 拉進 bundle。
 *
 * 業務 type（CallTaskStatus / CallTaskResult / SurveyKind）也在這裡 re-export 一份，
 * client component 統一從 .constants 拿。Server-only 的 query / shape 仍走 sales-call-tasks.ts。
 */

export type CallTaskStatus =
  | "pending"
  | "in_progress"
  | "completed"
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
