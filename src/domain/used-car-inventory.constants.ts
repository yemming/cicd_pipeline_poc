/**
 * 中古車庫存常數 — 狀態、等級、收購來源的 enum + label map。
 * Row type + pure helper function 放這裡，讓 client component 可安全 import。
 *
 * 同時相容舊 `sales-usedcar-inventory.constants.ts`（mock 版）的型別，
 * 讓 `usedcar-inventory-board.tsx` 不需要大改。
 */

// ── 狀態（DB 的 status 欄位值）──
export type UsedCarDbStatus =
  | "available"
  | "reserved"
  | "sold"
  | "pending_inspection"
  | "withdrawn";

export const USED_CAR_DB_STATUS_LABELS: Record<UsedCarDbStatus, string> = {
  available: "在庫可售",
  reserved: "已保留",
  sold: "已售出",
  pending_inspection: "整備中",
  withdrawn: "已下架",
};

// ── 等級（condition_grade）──
export type UsedCarConditionGrade = "S" | "A" | "B" | "C" | "D";

export const USED_CAR_GRADE_LABELS: Record<UsedCarConditionGrade, string> = {
  S: "S — CPO 認證",
  A: "A — 優良",
  B: "B — 良好",
  C: "C — 普通",
  D: "D — 需整備",
};

// ── 收購來源（acquisition_source）──
export type UsedCarAcquisitionSource = "trade_in" | "auction" | "direct_buy" | "other";

export const USED_CAR_ACQUISITION_SOURCE_LABELS: Record<UsedCarAcquisitionSource, string> = {
  trade_in: "舊換新收購",
  auction: "拍賣場",
  direct_buy: "直接收購",
  other: "其他",
};

// ── 衍生業務推薦 tag ──
export type UsedCarBusinessTag = "保險" | "配件升級" | "Track Day";

// ── 里程區間 ──
export type UsedCarKmRange = "low" | "mid" | "high";

export const USED_CAR_KM_RANGE_OPTIONS: { value: UsedCarKmRange | ""; label: string }[] = [
  { value: "", label: "全部里程" },
  { value: "low", label: "10,000 km 以下" },
  { value: "mid", label: "10,001 — 30,000 km" },
  { value: "high", label: "30,001 km 以上" },
];

export function inKmRange(km: number, range: UsedCarKmRange | ""): boolean {
  if (!range) return true;
  if (range === "low") return km <= 10000;
  if (range === "mid") return km > 10000 && km <= 30000;
  return km > 30000;
}

// ── filter / dropdown options ──
export const USED_CAR_GRADE_OPTIONS: { value: UsedCarConditionGrade | ""; label: string }[] = [
  { value: "", label: "全部等級" },
  { value: "S", label: "S — CPO 認證" },
  { value: "A", label: "A — 優良" },
  { value: "B", label: "B — 良好" },
  { value: "C", label: "C — 普通" },
  { value: "D", label: "D — 需整備" },
];

export const USED_CAR_STATUS_OPTIONS: { value: UsedCarDbStatus | ""; label: string }[] = [
  { value: "", label: "全部狀態" },
  { value: "available", label: "在庫可售" },
  { value: "pending_inspection", label: "整備中" },
  { value: "reserved", label: "已保留" },
  { value: "sold", label: "已售出" },
  { value: "withdrawn", label: "已下架" },
];

// ─────────────────────────────────────────────────────────────
// Row type（client-safe — 純資料結構，無 supabase 呼叫）
// ─────────────────────────────────────────────────────────────

export type UsedCarInventoryRow = {
  id: string;
  brand_id: string;
  organization_id: string | null;
  vehicle_model_id: string | null;
  model_display_name: string;
  year: number;
  vin: string | null;
  license_plate: string | null;
  color: string | null;
  color_hex: string | null;
  mileage_km: number;
  acquisition_price: number | null;
  listing_price: number | null;
  cost: number | null;
  margin: number | null;
  acquisition_source: UsedCarAcquisitionSource | null;
  acquisition_date: string | null;
  listed_date: string | null;
  sold_date: string | null;
  status: UsedCarDbStatus;
  condition_grade: UsedCarConditionGrade | null;
  lien_cleared: boolean | null;
  inspection_due_date: string | null;
  recommended_services: string[] | null;
  inspection_report: Record<string, unknown>;
  images: string[] | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── 計算在庫天數（listed_date 到今天）──
export function calcDaysInStock(listedDate: string | null, soldDate: string | null): number {
  if (!listedDate) return 0;
  const end = soldDate ? new Date(soldDate) : new Date();
  const start = new Date(listedDate);
  return Math.max(0, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

// ── status 轉中文 label ──
export function statusLabel(status: UsedCarDbStatus): string {
  return USED_CAR_DB_STATUS_LABELS[status] ?? status;
}
