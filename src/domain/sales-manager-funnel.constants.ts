/**
 * RS_M1 銷售漏斗看板（主管工作台）— 靜態 mock data。
 *
 * 對應 nav_node `3b732995-c5a8-46d7-8e2b-730d7c7a8933`（Indian / 主管工作台 / 銷售漏斗）。
 * Phase 1 全部 mock；Phase 2 接 sales_funnel_metrics view + KPI 目標表。
 */

export type RsKey = "lin" | "zhang" | "wang" | "chen";
export type ViewRole = "manager" | "personal";
export type Period = "month" | "quarter" | "year";

export interface HabcBreakdown {
  H: number;
  A: number;
  B: number;
  C: number;
}

export interface RsMetrics {
  key: RsKey;
  name: string;
  contacts: number;
  builds: number;
  trials: number;
  quotes: number;
  orders: number;
  deliveries: number;
  habc: HabcBreakdown;
}

export const PERIOD_LABEL: Record<Period, string> = {
  month: "本月",
  quarter: "本季",
  year: "本年",
};

export const KPI_TARGETS = {
  build: 90, // 建檔完整率 %
  trial: 60, // 試乘試駕率 %
  quote: 70, // 報價轉化率 %
  order: 60, // 訂車成交率 %
  deliveries: 15, // 本月成交台數
  ordersAbs: 16, // 本月訂車台數
  closeRate: 12, // 整體成交率 %
};

// mock：四位 RS 本月績效
export const RS_LIST: RsMetrics[] = [
  {
    key: "lin", name: "林佳蓉",
    contacts: 42, builds: 38, trials: 28, quotes: 22, orders: 14, deliveries: 11,
    habc: { H: 4, A: 8, B: 12, C: 14 },
  },
  {
    key: "zhang", name: "張志明",
    contacts: 35, builds: 30, trials: 18, quotes: 14, orders: 8, deliveries: 7,
    habc: { H: 2, A: 6, B: 10, C: 12 },
  },
  {
    key: "wang", name: "王大明",
    contacts: 28, builds: 24, trials: 22, quotes: 20, orders: 16, deliveries: 14,
    habc: { H: 5, A: 9, B: 6, C: 4 },
  },
  {
    key: "chen", name: "陳雅惠",
    contacts: 31, builds: 26, trials: 14, quotes: 10, orders: 6, deliveries: 5,
    habc: { H: 1, A: 4, B: 8, C: 13 },
  },
];

// 標籤群組（客群畫像）
export interface TagItem {
  name: string;
  count: number;
  closed: number;
}
export interface TagGroup {
  key: string;
  color: string;
  bg: string;
  border: string;
  emoji: string;
  name: string;
  tags: TagItem[];
}

export const CUSTOMER_TAG_GROUPS: TagGroup[] = [
  {
    key: "alert", color: "#C8001A", bg: "#FDECEA", border: "#F5AEAD", emoji: "🔴", name: "注意類",
    tags: [
      { name: "價格敏感", count: 18, closed: 3 },
      { name: "競品考慮中", count: 12, closed: 2 },
      { name: "有投訴記錄", count: 4, closed: 1 },
    ],
  },
  {
    key: "preference", color: "#854F0B", bg: "#FDF3E3", border: "#F0C97E", emoji: "🟡", name: "偏好類",
    tags: [
      { name: "偏好街跑", count: 32, closed: 14 },
      { name: "偏好越野", count: 11, closed: 4 },
      { name: "社群活躍車主", count: 22, closed: 9 },
    ],
  },
  {
    key: "service", color: "#0F6E56", bg: "#E1F5EE", border: "#5DCAA5", emoji: "🟢", name: "服務備忘",
    tags: [
      { name: "已提供型錄", count: 41, closed: 18 },
      { name: "已寄送報價", count: 28, closed: 15 },
      { name: "需要停車建議", count: 7, closed: 2 },
    ],
  },
  {
    key: "finance", color: "#185FA5", bg: "#EAF4FB", border: "#85B7EB", emoji: "🔵", name: "溝通費用",
    tags: [
      { name: "詢問車貸", count: 24, closed: 8 },
      { name: "預算偏低", count: 16, closed: 2 },
      { name: "詢問二手抵扣", count: 9, closed: 5 },
    ],
  },
];

// 漏斗 6 階段
export const FUNNEL_STAGES = [
  { key: "contacts",   label: "到店人次", icon: "🏪", color: "#1A3A5C" },
  { key: "builds",     label: "電子手卡建檔", icon: "📝", color: "#185FA5" },
  { key: "trials",     label: "試乘試駕", icon: "🏍️", color: "#534AB7" },
  { key: "quotes",     label: "報價單", icon: "📄", color: "#854F0B" },
  { key: "orders",     label: "訂車", icon: "📋", color: "#0F6E56" },
  { key: "deliveries", label: "交車", icon: "🎉", color: "#C8001A" },
] as const;

export const LAST_UPDATED = "2026-05-10 14:35";
