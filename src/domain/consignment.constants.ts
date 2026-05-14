/**
 * Consignment 共用常數 / 純值（給 client component 也可 import）
 *
 * 拆檔原因：domain/consignment.ts 是 "use server"，禁止 export 非 async 值。
 */

export const STATUS_CHIP: Record<
  string,
  { label: string; chip: string; icon: string }
> = {
  active: {
    label: "寄存中",
    chip: "bg-[#EAF3DE] text-[#3B6D11]",
    icon: "✅",
  },
  partial: {
    label: "部分轉購",
    chip: "bg-[#FDF3E3] text-[#854F0B]",
    icon: "🟡",
  },
  transferred: {
    label: "已轉入",
    chip: "bg-[#EBF3FF] text-[#1A3A5C]",
    icon: "📦",
  },
  returned: {
    label: "已退還",
    chip: "bg-[#F2F2F2] text-[#6B6A68]",
    icon: "↩",
  },
  expired: {
    label: "已過期",
    chip: "bg-[#FDECEA] text-[#CC0000]",
    icon: "🔴",
  },
};

export function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function fmtMoney(n: number): string {
  return "NT$ " + n.toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}
