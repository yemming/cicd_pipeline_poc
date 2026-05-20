/**
 * 常數 — `src/domain/parts-return-in.ts` 是 "use server" module，
 * 依紀律不可 export 非 async value。
 *
 * 領料退貨入庫（ro_return）= 維修廠 / 工單師傅領料後未用完退回倉庫，是 service → parts 的逆流。
 * 對映 stock_receipts.type='ro_return'，source_doc_type 通常為 'stock_issue' 或 'work_order'。
 */

export const RETURN_IN_PAGE_SIZE_DEFAULT = 50;

export type ReturnInStatus = "draft" | "completed" | "cancelled";

export type StatusChip = "navy" | "done" | "void" | "pend";

export const RETURN_IN_STATUSES: ReadonlyArray<{
  value: ReturnInStatus;
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
  return RETURN_IN_STATUSES.find((x) => x.value === s)?.label ?? s;
}

export function statusChipClass(s: string): string {
  const def = RETURN_IN_STATUSES.find((x) => x.value === s);
  return def ? STATUS_CHIP_CLASS[def.chip] : "bg-[#F2F2F2] text-[#6B6A68]";
}

/**
 * 退料原因預設選項（建單 form / DonutChart 都用）。
 * 業務上常見 4 大類；user 也可填自由文本，落到「其他」。
 */
export const RETURN_REASONS = [
  { value: "師傅多領未用", color: "#185FA5" }, // tone-blue
  { value: "工單取消", color: "#854F0B" },     // tone-amber
  { value: "料件規格不符", color: "#0F6E56" }, // tone-teal
  { value: "料件瑕疵", color: "#CC0000" },     // tone-red
  { value: "其他", color: "#6B6A68" },         // tone-gray
] as const;

export function reasonColor(reason: string): string {
  return RETURN_REASONS.find((r) => r.value === reason)?.color ?? "#6B6A68";
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

export function fmtNTShort(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}K`;
  return n.toLocaleString("en-US");
}

export function fmtQty(n: number | null | undefined): string {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-US");
}
