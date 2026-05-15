/**
 * Constants — 售後 派工看板 (Aftersales Technicians)
 *
 * Spec：docs/DUCATI_售後工單模組_..._最新版/07_售後管理模組_v2.html → 派工看板
 * 對應頁面：/parts/aftersales/management/dispatch
 *
 * NADA 三指標：
 *   - 效率 Efficiency  = sold ÷ actual × 100%   目標 ≥ 125%
 *   - 生產力 Productivity = sold ÷ available × 100%   目標 85-87.5%
 *   - 利用率 Utilization = actual ÷ available × 100%  目標 ≥ 80%
 *   - 1 LU = 6 分鐘 → soldHours = Σ LU / 10
 */

export const TECH_STATUS = ["working", "idle", "break", "off"] as const;
export type TechStatus = (typeof TECH_STATUS)[number];

export const TECH_STATUS_LABEL: Record<TechStatus, string> = {
  working: "施工中",
  idle: "待命",
  break: "休息",
  off: "下班",
};

export const TECH_STATUS_CHIP: Record<TechStatus, string> = {
  working: "bg-[#E6F1FB] text-[#185FA5] border border-[#4A90D9]",
  idle: "bg-[#E1F5EE] text-[#0F6E56] border border-[#1D9E75]",
  break: "bg-[#E8E7E4] text-[#6B6A68] border border-[#D1D0CE]",
  off: "bg-[#F5F5F4] text-[#9A9890] border border-[#D1D0CE]",
};

export const TECH_STATUS_ACCENT: Record<TechStatus, string> = {
  working: "#4A90D9",
  idle: "#1D9E75",
  break: "#9A9890",
  off: "#D1D0CE",
};

export const TECH_GRADE_OPTIONS = [
  "售後主管",
  "售後接待",
  "車間技師",
  "零件主管",
  "零件專員",
] as const;
export type TechGrade = (typeof TECH_GRADE_OPTIONS)[number];

export const AVATAR_COLOR_OPTIONS = [
  "#185FA5",
  "#0F6E56",
  "#854F0B",
  "#534AB7",
  "#CC0000",
  "#9A9890",
  "#1A3A5C",
  "#0F2A45",
] as const;

/* ── NADA 三指標公式 ── */

export const NADA_EFF_TARGET = 125;       // 效率目標 ≥ 125%
export const NADA_PROD_TARGET = 85;       // 生產力目標 85-87.5%
export const NADA_UTIL_TARGET = 80;       // 利用率目標 ≥ 80%

export function computeEfficiency(sold: number, actual: number): number {
  if (actual <= 0) return 0;
  return Math.round((sold / actual) * 100);
}

export function computeProductivity(sold: number, available: number): number {
  if (available <= 0) return 0;
  return Math.round((sold / available) * 100);
}

export function computeUtilization(actual: number, available: number): number {
  if (available <= 0) return 0;
  return Math.round((actual / available) * 100);
}

/** 依目標值上色（達標綠 / 接近黃 / 落後紅） */
export function effColor(pct: number): string {
  if (pct >= NADA_EFF_TARGET) return "#0F6E56";
  if (pct >= 100) return "#854F0B";
  return "#CC0000";
}

export function prodColor(pct: number): string {
  if (pct >= NADA_PROD_TARGET) return "#0F6E56";
  if (pct >= 70) return "#854F0B";
  return "#CC0000";
}

export function utilColor(pct: number): string {
  if (pct >= NADA_UTIL_TARGET) return "#0F6E56";
  if (pct >= 65) return "#854F0B";
  return "#CC0000";
}

/* ── 時間 helper ── */

/** 把 minutes → '4.5 h' 顯示 */
export function minutesToHoursStr(min: number): string {
  if (min <= 0) return "0.0 h";
  return `${(min / 60).toFixed(1)} h`;
}

/** mm:ss / HH:MM */
export function formatElapsed(min: number): string {
  if (min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m} 分`;
}

/** 計算 elapsed 分鐘數（從 started_at 到 now） */
export function elapsedMinutes(startedAt: string | null): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.floor((now - start) / 60000));
}
