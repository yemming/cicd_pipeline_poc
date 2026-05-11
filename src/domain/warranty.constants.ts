/**
 * Warranty / Used-parts 常數（非 "use server"，可 export non-async values）
 *
 * 與 `src/domain/warranty.ts` 配對：const / array / object 一律住這裡，
 * 避免在 "use server" module 中 export 非 async value（Next 16 會 throw）。
 */

// ────────────────────────────────────────────────────────────────────────────
// 原廠處置指示（顯示用 label，與 disposal_action enum 對映）
// ────────────────────────────────────────────────────────────────────────────

export const OEM_DIRECTIVE = {
  KEEP_DESTROY: "原地保管後銷毀",
  RETURN_AGENT: "寄回台灣總代理",
  RETURN_OEM: "寄回義大利原廠",
} as const;

export type OemDirectiveLabel = (typeof OEM_DIRECTIVE)[keyof typeof OEM_DIRECTIVE];

export const OEM_DIRECTIVE_LIST: OemDirectiveLabel[] = [
  OEM_DIRECTIVE.KEEP_DESTROY,
  OEM_DIRECTIVE.RETURN_AGENT,
  OEM_DIRECTIVE.RETURN_OEM,
];

/**
 * 中文 label → DB disposal_action enum
 */
export function directiveToDisposalAction(
  label: string,
):
  | "destroy_onsite"
  | "return_agent"
  | "return_oem"
  | "pending" {
  switch (label) {
    case OEM_DIRECTIVE.KEEP_DESTROY:
      return "destroy_onsite";
    case OEM_DIRECTIVE.RETURN_AGENT:
      return "return_agent";
    case OEM_DIRECTIVE.RETURN_OEM:
      return "return_oem";
    default:
      return "pending";
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Derived status（依 status + days_remaining 計算）
// ────────────────────────────────────────────────────────────────────────────

export type DerivedStatus =
  | "overdue"
  | "warn"
  | "ok"
  | "sent"
  | "destroyed";

export const DERIVED_STATUS_LABEL: Record<DerivedStatus, string> = {
  overdue: "🔴 已逾期",
  warn: "🟠 即將到期",
  ok: "🟢 保管中",
  sent: "🔵 已寄回原廠",
  destroyed: "⚫ 已銷毀",
};

export const DERIVED_STATUS_CHIP: Record<DerivedStatus, string> = {
  overdue: "bg-[#FDECEA] text-[#CC0000]",
  warn: "bg-[#FDF3E3] text-[#854F0B]",
  ok: "bg-[#EAF3DE] text-[#3B6D11]",
  sent: "bg-[#DBEAFE] text-[#1D4ED8]",
  destroyed: "bg-[#F2F2F2] text-[#6B6A68]",
};

/**
 * application 層計算 derived_status — 不寫入 DB
 */
export function computeDerivedStatus(args: {
  db_status: string;
  expiry_date: string | null;
  today?: Date;
}): DerivedStatus {
  const { db_status, expiry_date } = args;
  if (db_status === "disposed") return "destroyed";
  if (db_status === "returned_oem") return "sent";
  if (db_status === "cancelled" || db_status === "retained")
    return "destroyed";

  if (!expiry_date) return "ok";
  const today = args.today ?? new Date();
  // 取 UTC date 切齊：避免 timezone 飄
  const expiry = new Date(expiry_date);
  const todayDateOnly = new Date(today.toISOString().slice(0, 10));
  const expiryDateOnly = new Date(expiry.toISOString().slice(0, 10));
  const diffDays = Math.floor(
    (expiryDateOnly.getTime() - todayDateOnly.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "warn";
  return "ok";
}

export function daysRemaining(
  expiry_date: string | null,
  today: Date = new Date(),
): number {
  if (!expiry_date) return 0;
  const expiry = new Date(expiry_date);
  const todayDateOnly = new Date(today.toISOString().slice(0, 10));
  const expiryDateOnly = new Date(expiry.toISOString().slice(0, 10));
  return Math.floor(
    (expiryDateOnly.getTime() - todayDateOnly.getTime()) /
      (1000 * 60 * 60 * 24),
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Pills（列表上方狀態切換）
// ────────────────────────────────────────────────────────────────────────────

export const PILL_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "overdue", label: "🔴 逾期" },
  { key: "warn", label: "🟠 即將到期" },
  { key: "ok", label: "🟢 保管中" },
  { key: "sent", label: "🔵 已寄回" },
  { key: "destroyed", label: "⚫ 已銷毀" },
];

// ────────────────────────────────────────────────────────────────────────────
// 收件方
// ────────────────────────────────────────────────────────────────────────────

export const RETURN_RECIPIENTS = [
  "台灣 DUCATI 總代理",
  "義大利 Ducati 原廠",
] as const;

export const DEFAULT_KEEP_DAYS = 90;
