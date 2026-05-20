/**
 * /crm/aftersales/nps 專屬常數（M02-7）
 *
 * 與 sales-nps.constants 區隔：
 *   - 期間多了 3m（短週期主管巡檢用）
 *   - service_type label / icon 一覽
 *
 * NPS 分類規則 (classifyScore / NPS_CATEGORY_*) 仍重用 sales-nps.constants —
 * 那是業界定義、不會兩種演算法。
 */

export type AftersalesNpsRangeKey = "3m" | "6m" | "12m";

export const AFTERSALES_NPS_RANGE_MONTHS: Record<AftersalesNpsRangeKey, number> = {
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

export const AFTERSALES_NPS_RANGE_LABEL: Record<AftersalesNpsRangeKey, string> = {
  "3m": "近 3 個月",
  "6m": "近 6 個月",
  "12m": "近 12 個月",
};

/** service_type 對映顯示名（與 aftersales 維修域對齊） */
export const SERVICE_TYPE_LABEL: Record<string, string> = {
  repair: "故障維修",
  maintenance: "定期保養",
  warranty: "保固服務",
  recall: "原廠召回",
  accessory: "改裝配件",
  inspection: "驗車檢查",
  unknown: "（未分類）",
};

export function serviceTypeLabel(key: string | null | undefined): string {
  if (!key) return SERVICE_TYPE_LABEL.unknown;
  return SERVICE_TYPE_LABEL[key] ?? key;
}
