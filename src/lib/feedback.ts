/**
 * Feedback Ticket 模組 — 型別、狀態機、Admin 判斷
 *
 * DB 查詢直接在 server components / server actions 呼叫 createClient，
 * 這裡只放純邏輯與共用常數，不做 wrapper（避免無謂抽象）。
 */

export type FeedbackStatus = "draft" | "in_progress" | "review" | "released";

export const FEEDBACK_STATUS_ORDER: FeedbackStatus[] = [
  "draft",
  "in_progress",
  "review",
  "released",
];

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  draft: "草稿",
  in_progress: "工作中",
  review: "Review",
  released: "上版",
};

export const FEEDBACK_STATUS_TONE: Record<
  FeedbackStatus,
  { bg: string; text: string; dot: string }
> = {
  draft:       { bg: "bg-surface-container",      text: "text-on-surface-variant", dot: "bg-outline-variant" },
  in_progress: { bg: "bg-tertiary-fixed/50",       text: "text-tertiary",           dot: "bg-tertiary-container" },
  review:      { bg: "bg-warning-container",       text: "text-warning",            dot: "bg-warning" },
  released:    { bg: "bg-success-container/60",    text: "text-success",            dot: "bg-success" },
};

export type FeedbackTicket = {
  id: string;
  title: string;
  url: string | null;
  description: string | null;
  status: FeedbackStatus;
  created_by: string | null;
  assignee_id: string | null;
  created_at: string;
  updated_at: string;
};

export type FeedbackCanvasSnapshot = {
  ticket_id: string;
  snapshot: unknown;
  updated_at: string;
};

// 轉成 review / released / in_progress 需要 admin
// （只有 'draft' 是任何登入者都能碰的起點狀態）
const ADMIN_ONLY_STATUSES: FeedbackStatus[] = ["in_progress", "review", "released"];

export function isAdminOnlyTransition(next: FeedbackStatus): boolean {
  return ADMIN_ONLY_STATUSES.includes(next);
}

/**
 * 解析 FEEDBACK_ADMIN_EMAILS 環境變數 (逗號分隔)。
 * 在 server side 用 — client 端透過獨立 API / cookie flag 接收結果，不直接讀 env。
 */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined, raw: string | undefined): boolean {
  if (!email) return false;
  return parseAdminEmails(raw).includes(email.toLowerCase());
}
