const TWD = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

export function formatTWD(n: number): string {
  return TWD.format(n);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("zh-TW").format(n);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** GP ratio → 顏色等級（綠 >15% / 黃 5-15% / 紅 <5%） */
export function gpTone(ratio: number): { bg: string; text: string; label: string } {
  if (ratio >= 0.15) return { bg: "bg-emerald-50", text: "text-emerald-700", label: "健康" };
  if (ratio >= 0.05) return { bg: "bg-amber-50",   text: "text-amber-700",   label: "普通" };
  return { bg: "bg-rose-50", text: "text-rose-700", label: "偏低" };
}
