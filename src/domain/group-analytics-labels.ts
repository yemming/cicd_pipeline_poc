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
