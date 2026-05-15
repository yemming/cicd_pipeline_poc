/**
 * Constants — 售後 工位看板 (Service Bays)
 *
 * Spec：docs/DUCATI_售後工單模組_..._最新版/07_售後管理模組_v2.html
 * 對應頁面：/parts/aftersales/management/bays
 */

export const BAY_STATUS = ["free", "busy", "urgent", "offline"] as const;
export type BayStatus = (typeof BAY_STATUS)[number];

export const BAY_STATUS_LABEL: Record<BayStatus, string> = {
  free: "空閒",
  busy: "使用中",
  urgent: "逾時警示",
  offline: "停用",
};

export const BAY_STATUS_CHIP: Record<BayStatus, string> = {
  free: "bg-[#E1F5EE] text-[#0F6E56] border border-[#1D9E75]",
  busy: "bg-[#FAEEDA] text-[#854F0B] border border-[#BA7517]",
  urgent: "bg-[#FCEBEB] text-[#CC0000] border border-[#F09595]",
  offline: "bg-[#E8E7E4] text-[#6B6A68] border border-[#D1D0CE]",
};

export const BAY_STATUS_ACCENT: Record<BayStatus, string> = {
  free: "#1D9E75",
  busy: "#BA7517",
  urgent: "#CC0000",
  offline: "#999999",
};

export const BAY_TYPE_OPTIONS = ["機電", "電裝", "PDI", "多功能"] as const;
export type BayType = (typeof BAY_TYPE_OPTIONS)[number];

export const DAILY_HOURS_OPTIONS = [8, 9, 10, 12] as const;
export type DailyHours = (typeof DAILY_HOURS_OPTIONS)[number];

export const URGENT_THRESHOLD_MINUTES = 120;

/** 把 minutes 算成 H 顯示，1 位小數 */
export function minutesToHours(min: number): number {
  return Math.round((min / 60) * 10) / 10;
}

/** 計算今日 elapsed 分鐘數（從 started_at 到 now） */
export function elapsedMinutes(startedAt: string | null): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 60000));
}

/** mm:ss 或 HH:MM:SS */
export function formatTimer(min: number): string {
  if (min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m} 分`;
}
