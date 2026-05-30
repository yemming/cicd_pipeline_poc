/**
 * 集團能效 — 六維健康分共用常數 / 型別。
 *
 * ⚠️ 為什麼獨立成檔：`group-analytics.ts` 帶 `"use server"`，該類檔**只能 export async function**，
 * 不能 export 非 async 的值（如物件常數）。`HEALTH_DIM_LABEL` 是 Record 物件 → 必須放在這個
 * 普通模組，供 group-analytics（server）內部 import 與 UI（client）直接 import。
 */

/** 六維名稱（健康分數雷達 6 軸）。 */
export type HealthDim =
  | "dim_sales"
  | "dim_after"
  | "dim_parts"
  | "dim_people"
  | "dim_csat"
  | "dim_finance";

/** 六維 → 中文標籤（雷達軸 / issue 文字共用）。 */
export const HEALTH_DIM_LABEL: Record<HealthDim, string> = {
  dim_sales: "銷售",
  dim_after: "售後",
  dim_parts: "零件",
  dim_people: "人才",
  dim_csat: "客戶滿意",
  dim_finance: "財務",
};

/* ══════════════════════════════════════════════════════════════
   第十九輪 GRP18 集團客戶動態 — 共用標籤 / 色票 / 閾值常數
   （group-analytics.ts〔server〕內部 import 組資料合約；
     /group/customer-dynamics 頁〔client〕import 同一份畫圖、保口徑一致）
   ══════════════════════════════════════════════════════════════ */

/** 一個帶 metric_key + 中文 label + 配色的維度定義。 */
export type DimDef = { key: string; label: string; color: string };

/** 客戶旅程漏斗 5 階段（生命週期；末階段「回購」是獨立 cohort、可能 > 首購）。 */
export const FUNNEL_STAGES: DimDef[] = [
  { key: "lc_funnel_prospect", label: "潛在客戶", color: "#1A3A5C" },
  { key: "lc_funnel_contact", label: "首次接觸", color: "#2A5A8C" },
  { key: "lc_funnel_testride", label: "試乘/到店", color: "#3A7AB2" },
  { key: "lc_funnel_firstbuy", label: "首購成交", color: "#0F6E56" },
  { key: "lc_funnel_repurchase", label: "回購客戶", color: "#3DBE6E" },
];

/** 新客來源 donut 5 桶（百分比）。 */
export const SOURCE_BUCKETS: DimDef[] = [
  { key: "source_referral", label: "客戶介紹", color: "#1A3A5C" },
  { key: "source_event", label: "展場/活動", color: "#3A7AB2" },
  { key: "source_online", label: "網路/社群", color: "#0F6E56" },
  { key: "source_walkin", label: "路過到店", color: "#854F0B" },
  { key: "source_other", label: "其他", color: "#9A9890" },
];

/** 客戶狀態分佈 5 段（計數；活躍 → 各休眠階段 → 流失）。 */
export const CUST_STATES: DimDef[] = [
  { key: "cust_state_active", label: "活躍客戶", color: "#0F6E56" },
  { key: "cust_state_dormant60", label: "休眠 60 天", color: "#3DBE6E" },
  { key: "cust_state_dormant120", label: "休眠 120 天", color: "#F5B942" },
  { key: "cust_state_dormant180", label: "休眠 180 天", color: "#854F0B" },
  { key: "cust_state_lost", label: "已流失", color: "#C8001A" },
];

/** 門店客戶流動對比 3 系列（grouped bar）。 */
export const FLOW_SERIES: DimDef[] = [
  { key: "flow_new", label: "新客戶", color: "#3DBE6E" },
  { key: "flow_repeat", label: "回購客戶", color: "#1A3A5C" },
  { key: "flow_churn", label: "流失客戶", color: "#C8001A" },
];

/** 客戶流失原因 5 桶（百分比；水平 bar）。 */
export const LOST_REASONS: DimDef[] = [
  { key: "lost_reason_service", label: "服務體驗不佳", color: "#C8001A" },
  { key: "lost_reason_competitor", label: "競品吸引", color: "#854F0B" },
  { key: "lost_reason_price", label: "價格因素", color: "#F5B942" },
  { key: "lost_reason_relocate", label: "搬遷/換車", color: "#1A3A5C" },
  { key: "lost_reason_other", label: "其他", color: "#9A9890" },
];

/**
 * 客戶未回廠流失風險門檻（天）。
 * ⚠️ 與售後 SA 層（CRM04A 休眠/流失客戶）**共用同一份定義** — 第十九輪 Q4/Q8 拍板：
 *    跨頁「客戶活躍度計算」以閾值口徑對齊兌現（兩頁 import 同一份常數），而非資料上捲。
 *    GRP18 集團層為 demo seed、CRM04A 門店層為真實 dormancy 計算，但**門檻單一事實來源**。
 */
export const CHURN_RISK_DAYS = {
  /** 高風險：≥ 90 天未回廠 */
  high: 90,
  /** 最高風險：≥ 180 天未回廠 */
  critical: 180,
} as const;

/* ══════════════════════════════════════════════════════════════
   第二十輪 GRP12 集團零件財務總覽 — 共用標籤 / 色票 / 閾值常數
   （group-analytics.ts〔server〕內部 import 組資料合約；
     /group/parts-financials 頁〔client〕import 同一份畫圖、保口徑一致）
   ══════════════════════════════════════════════════════════════ */

/**
 * 零件品項業務分類 4 桶（donut；對齊 spec「原廠保養件/維修零件/精品配件/輪胎」）。
 * ⚠️ DB items.category 實值是 8 類「功能分類」（車身/煞車/傳動/排氣/懸吊/引擎/耗材/電氣），
 *    與此業務分類完全不同 → donut 走 seed 聚合值（metadata.cat=key），不即時 join items。
 */
export const PARTS_CATEGORIES: DimDef[] = [
  { key: "oem_service", label: "原廠保養件", color: "#F5B942" },
  { key: "repair_parts", label: "維修零件", color: "#1A3A5C" },
  { key: "accessory", label: "精品配件", color: "#534AB7" },
  { key: "tire", label: "輪胎類", color: "#0F6E56" },
];

/** 零件庫存周轉率目標（次/年）；低於此在水平 bar 標警示色。 */
export const PARTS_TURNOVER_TARGET = 6.0;

/** 零件呆滯率警戒線（佔總庫存）；超過此 KPI 卡標紅。 */
export const PARTS_DEADSTOCK_WARN = 0.05;

/** 零件毛利率 benchmark（集團政策下限）。 */
export const PARTS_MARGIN_BENCHMARK = 0.3;

/** SKU 滯銷天數分級（單店深鑽 SKU 表 / 呆滯清單共用口徑）。 */
export const SKU_STALE_DAYS = {
  /** 滯銷：≥ 90 天未異動 */
  warn: 90,
  /** 呆滯：≥ 180 天未異動 */
  dead: 180,
} as const;
