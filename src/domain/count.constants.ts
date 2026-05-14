/**
 * Count Ops 共用常數 / 純值（給 client component 也可 import）
 *
 * 拆檔原因：domain/count.ts 是 "use server"，禁止 export 非 async 值。
 */

export const COUNT_STATUS_CHIP: Record<
  string,
  { label: string; chip: string }
> = {
  draft: { label: "草稿", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  counting: { label: "進行中", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  first_done: { label: "首盤完成", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  second_done: { label: "複盤完成", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  pending_approval: { label: "待覆核", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  completed: { label: "已完成", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  cancelled: { label: "已取消", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

export const COUNT_TYPE_CHIP: Record<
  string,
  { label: string; chip: string }
> = {
  full_a: { label: "A 類全盤", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  monthly: { label: "月度例盤", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  sample: { label: "抽盤", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  dynamic: { label: "動態盤", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  manual: { label: "臨時盤", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

export const COUNT_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "manual", label: "臨時盤" },
  { value: "full_a", label: "A 類全盤" },
  { value: "monthly", label: "月度例盤" },
  { value: "sample", label: "抽盤" },
  { value: "dynamic", label: "動態盤" },
];

export const COUNT_PLAN_TYPE_CHIP: Record<
  string,
  { label: string; chip: string }
> = {
  cycle: { label: "循環盤", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  full: { label: "全盤", chip: "bg-[#FDECEA] text-[#CC0000]" },
  spot: { label: "抽盤", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  abc_a: { label: "ABC-A", chip: "bg-[#FDECEA] text-[#CC0000]" },
  abc_b: { label: "ABC-B", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  abc_c: { label: "ABC-C", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
};

export const COUNT_PLAN_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "cycle", label: "循環盤點" },
  { value: "full", label: "全盤" },
  { value: "spot", label: "抽盤" },
  { value: "abc_a", label: "ABC-A 類" },
  { value: "abc_b", label: "ABC-B 類" },
  { value: "abc_c", label: "ABC-C 類" },
];

export const ABC_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "（無）" },
  { value: "A", label: "A 類" },
  { value: "B", label: "B 類" },
  { value: "C", label: "C 類" },
  { value: "all", label: "全部" },
];

export const COUNT_ACTIVE_STATUSES = ["counting", "first_done", "second_done"] as const;

export function isCountActive(status: string): boolean {
  return (COUNT_ACTIVE_STATUSES as readonly string[]).includes(status);
}

export function fmtDate(d: string | null | undefined): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return "NT$ " + Math.round(n).toLocaleString("zh-TW");
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toFixed(1)}%`;
}
