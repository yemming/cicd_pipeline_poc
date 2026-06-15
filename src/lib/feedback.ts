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
  review: "檢查",
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
  archived_at: string | null;
  metadata: Record<string, unknown> | null;
};

/** Ticket-level 附件（建單時上傳，存 metadata.attachments[]、與 comment-level 不同表） */
export type TicketAttachment = {
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  uploaded_at: string | null;
  signed_url: string | null;
};

// ─────────────────────────── DevOps 4 層結構（存 metadata jsonb）───────────────────────────
//
// 一張單 = 一個需求 = 改一個東西。許願單同時是「驗收規格」，讓單據可 end-to-end 測。
//   ① 意圖 Intent     → 既有 title + description（許願者填）
//   ② 範圍 Scope      → metadata.scope（改哪條 route，強制「一個東西」）
//   ③ 驗收 Acceptance → metadata.acceptance[]（given-when-then 原子斷言，1:1 對應一條 E2E）
//   ④ 證據 Evidence   → metadata.evidence（commit SHA + E2E 結果，由 pipeline 現場產、即用即拋）

/** ② 範圍：這張單會動到的「唯一」位置。route 超過一條 → 拆單。 */
export type TicketScope = {
  route: string;        // e.g. "/sales/showroom"；機器據此 page.goto
  area?: string | null; // 選填：元件/模組描述（人看的）
};

/** ③ 驗收：一條原子斷言，可觀察、1:1 編成一個 Playwright 步驟 */
export type AcceptanceCriterion = {
  id: string;    // 短碼，如 "AC1"
  given: string; // 前提（在什麼情境）
  when: string;  // 動作（做了什麼）
  then: string;  // 預期結果（可觀察）
};

export type TicketE2EStatus = "none" | "pending" | "pass" | "fail";

/** ④ 證據：實作後由 pipeline / 我們回填，不是許願者給 */
export type TicketEvidence = {
  sha?: string | null; // 實作此單的 commit
  e2e?: {
    status: TicketE2EStatus;
    passed?: number;
    failed?: number;
    ran_at?: string | null;
    report?: string | null; // 摘要或檔案路徑
  } | null;
  updated_at?: string | null;
};

/** 完整 metadata 形狀（含既有 attachments） */
export type TicketMetadata = {
  attachments?: TicketAttachment[];
  scope?: TicketScope | null;
  acceptance?: AcceptanceCriterion[];
  evidence?: TicketEvidence | null;
};

/** 從 ticket.metadata 安全取出各層（容錯：欄位缺/型別不符一律回 null/空陣列） */
export function getTicketScope(meta: Record<string, unknown> | null | undefined): TicketScope | null {
  const s = (meta as TicketMetadata | null)?.scope;
  if (s && typeof s === "object" && typeof s.route === "string" && s.route.trim()) {
    return { route: s.route.trim(), area: s.area?.toString().trim() || null };
  }
  return null;
}

export function getTicketAcceptance(meta: Record<string, unknown> | null | undefined): AcceptanceCriterion[] {
  const a = (meta as TicketMetadata | null)?.acceptance;
  if (!Array.isArray(a)) return [];
  return a
    .filter((c): c is AcceptanceCriterion => !!c && typeof c === "object")
    .map((c, i) => ({
      id: (c.id?.toString().trim()) || `AC${i + 1}`,
      given: c.given?.toString() ?? "",
      when: c.when?.toString() ?? "",
      then: c.then?.toString() ?? "",
    }))
    .filter((c) => c.given || c.when || c.then);
}

export function getTicketEvidence(meta: Record<string, unknown> | null | undefined): TicketEvidence | null {
  const e = (meta as TicketMetadata | null)?.evidence;
  if (e && typeof e === "object") return e;
  return null;
}

/** E2E 狀態的顯示色票（沿用 List View design token 風格） */
export const TICKET_E2E_TONE: Record<TicketE2EStatus, { bg: string; text: string; label: string }> = {
  none:    { bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]", label: "未測" },
  pending: { bg: "bg-[#EAF4FB]", text: "text-[#185FA5]", label: "測試中" },
  pass:    { bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]", label: "通過" },
  fail:    { bg: "bg-[#FDECEA]", text: "text-[#CC0000]", label: "未過" },
};

export type FeedbackAttachment = {
  id: string;
  comment_id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  created_at: string;
  /** Signed URL 於 server component 產生後帶給 client */
  signed_url?: string | null;
};

export const FEEDBACK_ATTACHMENT_BUCKET = "feedback-attachments";
export const FEEDBACK_ATTACHMENT_MAX_SIZE = 20 * 1024 * 1024; // 20MB per file
export const FEEDBACK_ATTACHMENT_MAX_COUNT = 5;

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
