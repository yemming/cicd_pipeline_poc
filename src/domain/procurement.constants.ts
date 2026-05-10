/**
 * Procurement constants (client-importable)
 *
 * src/domain/procurement.ts 是 'use server' module，不能 export 非 async value。
 * 純常數 / type 拆到這裡讓 client component 也能 import。
 */

export const RETURN_REASONS = [
  { value: "spec_mismatch", label: "規格不符" },
  { value: "quality_issue", label: "品質問題（瑕疵品）" },
  { value: "overship", label: "數量多送" },
  { value: "wrong_item", label: "錯誤商品" },
  { value: "damaged", label: "破損" },
  { value: "other", label: "其他" },
] as const;

export const RETURN_STATUSES = [
  { value: "pending", label: "待審核", chip: "pend" as const },
  { value: "approved", label: "待出貨", chip: "teal" as const },
  { value: "shipped", label: "退貨中", chip: "navy" as const },
  { value: "completed", label: "已完成", chip: "done" as const },
  { value: "cancelled", label: "已作廢", chip: "gry" as const },
] as const;

/**
 * 把 ISO timestamp 格式成 `YYYY/MM/DD HH:mm:ss`、固定 Asia/Taipei timezone。
 *
 * 為何不直接用 `toLocaleString("zh-TW", { hour12: false })`：
 * server 跑 UTC（或 container 系統 tz）、browser 跑使用者 tz，
 * 不 pin timeZone 會 hydration mismatch（即使視覺看起來一樣）。
 */
export function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  // Intl.DateTimeFormat with explicit timeZone is deterministic across server/client
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}
