/**
 * 常數 — `src/domain/internal-sale-receipts.ts` 是 "use server" module，
 * 依紀律不可 export 非 async value。
 *
 * 內售入庫（internal sale return / 內部銷售退回入庫）= 把已開單售出去的零件
 * 因故被退回時，重新入庫到指定倉。對映 stock_receipts.type = 'internal_sale_return'。
 */

export const INTERNAL_SALE_RECEIPTS_PAGE_SIZE_DEFAULT = 50;

export type InternalSaleReceiptStatus =
  | "draft" // 草稿
  | "completed" // 已過帳（庫存已增加）
  | "cancelled"; // 已作廢

export type StatusChip = "navy" | "done" | "void" | "pend";

export const INTERNAL_SALE_RECEIPT_STATUSES: ReadonlyArray<{
  value: InternalSaleReceiptStatus;
  label: string;
  chip: StatusChip;
}> = [
  { value: "draft", label: "草稿", chip: "pend" },
  { value: "completed", label: "已過帳", chip: "done" },
  { value: "cancelled", label: "已作廢", chip: "void" },
] as const;

export const STATUS_CHIP_CLASS: Record<StatusChip, string> = {
  pend: "bg-[#FDF3E3] text-[#854F0B]",
  navy: "bg-[#EBF3FF] text-[#1A3A5C]",
  done: "bg-[#EAF3DE] text-[#3B6D11]",
  void: "bg-[#FDECEA] text-[#CC0000]",
};

export function statusLabel(s: string): string {
  return INTERNAL_SALE_RECEIPT_STATUSES.find((x) => x.value === s)?.label ?? s;
}

export function statusChipClass(s: string): string {
  const def = INTERNAL_SALE_RECEIPT_STATUSES.find((x) => x.value === s);
  return def ? STATUS_CHIP_CLASS[def.chip] : "bg-[#F2F2F2] text-[#6B6A68]";
}

export function fmtDate(d: string | null | undefined): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

export function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Math.round(Number(n)).toLocaleString("en-US")}`;
}

export function fmtQty(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US");
}
