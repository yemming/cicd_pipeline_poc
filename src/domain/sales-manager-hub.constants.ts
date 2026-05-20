/**
 * /sales/manager hub — 主管工作台入口頁的元資料（client-safe）。
 *
 * helper (sales-manager-hub.ts, server-only) 會把每張卡片需要的「動態 snapshot」
 * （本月接觸數 / 業務人數…）算出來填到 cards[*].snapshot，再交給 client 元件渲染。
 *
 * 為什麼分 constants：避免 client 元件直接 import server-only helper
 * 觸發 next 的 client/server 邊界錯誤；同時也讓「卡片清單」這份靜態元資料
 * 可被 storybook / test 引用。
 */

import type { ToneKey } from "@/components/visualization/tone";

export type ManagerHubCardKey =
  | "funnel"
  | "sales-report"
  | "kpi-targets"
  | "staff"
  | "staff-grid"
  | "card-config";

export interface ManagerHubCardMeta {
  key: ManagerHubCardKey;
  /** route */
  href: string;
  /** 卡片標題（與子頁標題一致） */
  title: string;
  /** 子頁短描述（< 32 字） */
  description: string;
  /** material-symbols 圖示名 */
  icon: string;
  /** KpiCard tone — 僅可用 visualization/tone 的 7 色 */
  tone: ToneKey;
  /** 主指標 label（snapshot 的人話） */
  metricLabel: string;
  /** 主指標單位（如「人」「筆」「%」） */
  unit?: string;
  /** 副指標 label */
  subLabel?: string;
}

/** 6 張子模組卡片，sort_order 決定 grid 排列 */
export const MANAGER_HUB_CARDS: ManagerHubCardMeta[] = [
  {
    key: "funnel",
    href: "/sales/manager/funnel",
    title: "銷售漏斗看板",
    description: "RS_M1 六階段漏斗、本月轉換率、HABC 自動建議",
    icon: "filter_list",
    tone: "blue",
    metricLabel: "本月接觸",
    unit: "筆",
    subLabel: "成交 / 轉換率",
  },
  {
    key: "sales-report",
    href: "/sales/manager/sales-report",
    title: "業績報表",
    description: "RS_M2 三層 KPI、月度趨勢、車型銷售排行",
    icon: "leaderboard",
    tone: "teal",
    metricLabel: "本月成交",
    unit: "台",
    subLabel: "目標達成率",
  },
  {
    key: "kpi-targets",
    href: "/sales/manager/kpi-targets",
    title: "KPI 目標與 HABC",
    description: "設定漏斗紅黃綠閾值、月目標、HABC 自動分級",
    icon: "flag",
    tone: "amber",
    metricLabel: "已設定目標",
    unit: "項",
    subLabel: "metric 涵蓋",
  },
  {
    key: "staff",
    href: "/sales/manager/staff",
    title: "RS 人員管理",
    description: "業務名冊、車系指派、啟用停用",
    icon: "groups",
    tone: "purple",
    metricLabel: "在職業務",
    unit: "人",
    subLabel: "本月有接觸",
  },
  {
    key: "staff-grid",
    href: "/sales/manager/staff-grid",
    title: "員工評估九宮格",
    description: "態度 × 技能 3×3 grid，自動定位可主管覆蓋",
    icon: "grid_3x3",
    tone: "green",
    metricLabel: "可評估業務",
    unit: "人",
    subLabel: "已手動定位",
  },
  {
    key: "card-config",
    href: "/sales/manager/card-config",
    title: "手卡參數設定",
    description: "客戶來源、興趣車系、購車預算等下拉值維護",
    icon: "tune",
    tone: "gray",
    metricLabel: "參數選項",
    unit: "個",
    subLabel: "規則啟用",
  },
];

/** Helper 對外回傳的「每張卡片 snapshot」型別。 */
export interface ManagerHubCardSnapshot {
  /** 主指標值（已格式化字串，例如「12」「85%」「—」） */
  value: string;
  /** 副指標值（已格式化字串），undefined 時 UI 不渲染 */
  subValue?: string;
  /** 與上期比較的 delta（百分點 / 百分比），undefined 時不顯示 chip */
  delta?: {
    value: number;
    tone?: "positive" | "negative" | "neutral";
  };
}

export interface ManagerHubData {
  /** 對應卡片 key → snapshot */
  snapshots: Record<ManagerHubCardKey, ManagerHubCardSnapshot>;
  /** 是否所有 query 都成功（用於 banner 提示 dev fallback） */
  ok: boolean;
  /** 是否完全沒 data（empty state；六張卡片全 0） */
  empty: boolean;
  /** 第一個錯誤訊息（dev 看用，prod 顯示「資料載入中…」） */
  error: string | null;
  /** 當前作用 brand_id（debug 用） */
  brand_id: string;
}

/** 失敗 / dev 時的 fallback snapshot，全 0、不影響 UI 結構 */
export const MANAGER_HUB_FALLBACK_SNAPSHOTS: Record<
  ManagerHubCardKey,
  ManagerHubCardSnapshot
> = {
  funnel: { value: "—", subValue: "—" },
  "sales-report": { value: "—", subValue: "—" },
  "kpi-targets": { value: "—", subValue: "—" },
  staff: { value: "—", subValue: "—" },
  "staff-grid": { value: "—", subValue: "—" },
  "card-config": { value: "—", subValue: "—" },
};
