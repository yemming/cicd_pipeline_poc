/**
 * 業績報表（M01-2 A 級）— client-safe types & constants。
 *
 * 對應頁面：/sales/manager/sales-report
 *
 * 設計：與 `sales-manager-report.constants.ts` 區別 — 本檔聚焦在
 *   業績主軸（amount / count / SA 排名 / 車型熱銷 / 來源 ROI / 趨勢），
 *   並 reuse 既有 `sales_orders / sales_handcards / sales_leads` schema、
 *   不再依賴不存在的 `sales_metrics_monthly` mview。
 */

export type ReportPeriod = "month" | "quarter" | "year";

export const PERIOD_LABELS: Record<ReportPeriod, string> = {
  month: "本月",
  quarter: "本季",
  year: "本年",
};

/** KPI 卡片資料（給 KpiCard component 用）。tone 走 visualization/tone.ts 7 色。 */
export interface SalesReportKpis {
  /** 本期銷售額（元） */
  revenue: number;
  /** 銷售額同比（上一期；用相同期型對齊，例：上個月 / 上季 / 去年） */
  revenuePrev: number;
  /** 本期訂單數（成交 = signed + fulfilled） */
  orderCount: number;
  /** 訂單數同比 */
  orderCountPrev: number;
  /** 平均單價（元） */
  avgPrice: number;
  /** 平均單價同比 */
  avgPricePrev: number;
  /** 月度目標達成率 % */
  targetRate: number;
  /** 目標金額（元） */
  targetAmount: number;
}

/** SA 個人業績排名 */
export interface SalesConsultantRank {
  name: string;
  /** 本期訂單數 */
  orders: number;
  /** 本期業績（元） */
  revenue: number;
  /** 上期業績（元） */
  revenuePrev: number;
  /** 個人目標（元） — 沒設就 0 */
  target: number;
}

/** 車型熱銷度 */
export interface ModelSalesRow {
  modelId: string | null;
  modelName: string;
  series: string;
  count: number;
  revenue: number;
}

/** 客戶來源 ROI */
export interface LeadSourceRow {
  source: string;
  orders: number;
  revenue: number;
}

/** 每日銷售趨勢 */
export interface DailyTrendPoint {
  date: string;        // 'MM-DD'
  count: number;
  revenue: number;     // 元
}

/** 訂單明細列（DataGrid row） */
export interface OrderDetailRow {
  id: string;
  order_no: string;
  signed_at: string | null;
  rs_name: string | null;
  customer_name: string | null;
  vehicle_model_name: string | null;
  total_amount: number | null;
  status: "draft" | "submitted" | "signed" | "cancelled" | "fulfilled";
  lead_source: string | null;
}

/** 過濾條件（page → helper） */
export interface SalesReportFilters {
  period?: ReportPeriod;
  saName?: string | null;
  modelId?: string | null;
  source?: string | null;
}

export const ORDER_STATUS_CHIP: Record<OrderDetailRow["status"], { label: string; bg: string; text: string }> = {
  draft:     { label: "草稿",   bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]" },
  submitted: { label: "送簽中", bg: "bg-[#FDF3E3]", text: "text-[#854F0B]" },
  signed:    { label: "已簽約", bg: "bg-[#EAF4FB]", text: "text-[#185FA5]" },
  cancelled: { label: "已作廢", bg: "bg-[#FDECEA]", text: "text-[#CC0000]" },
  fulfilled: { label: "已交車", bg: "bg-[#EAF3DE]", text: "text-[#3B6D11]" },
};

/** 預設月度目標：當沒設 kpi_targets.target_value 時的 fallback（元） */
export const DEFAULT_MONTHLY_TARGET = 15_000_000;
