/**
 * 中古車庫存常數 — 狀態、等級、收購來源的 enum + label map。
 * Row type + pure helper function 放這裡，讓 client component 可安全 import。
 *
 * 同時相容舊 `sales-usedcar-inventory.constants.ts`（mock 版）的型別，
 * 讓 `usedcar-inventory-board.tsx` 不需要大改。
 */

// ── 狀態（DB 的 status 欄位值）──
// T0（第十五輪）新增合法值：evaluation / pending_recon / consignment / in_transit_transfer / inactive
export type UsedCarDbStatus =
  | "evaluation"
  | "pending_recon"
  | "available"
  | "reserved"
  | "sold"
  | "pending_inspection"
  | "consignment"
  | "in_transit_transfer"
  | "inactive"
  | "withdrawn";

export const USED_CAR_DB_STATUS_LABELS: Record<UsedCarDbStatus, string> = {
  evaluation: "評估中",
  pending_recon: "待整備",
  available: "在庫可售",
  reserved: "已保留",
  sold: "已售出",
  pending_inspection: "整備中",
  consignment: "寄售",
  in_transit_transfer: "調撥在途",
  inactive: "停用",
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

// ── 來源 badge（卡片左下角 + filter）──
// 設計稿 RS03B：🔄置換 / 🛒直購 / 🏷拍賣
export const USED_CAR_SOURCE_BADGE: Record<
  UsedCarAcquisitionSource,
  { label: string; icon: string; chip: string }
> = {
  trade_in: { label: "置換", icon: "🔄", chip: "bg-[#FDF3E3] text-[#6B3A00] border border-[#F0C97E]" },
  direct_buy: { label: "直購", icon: "🛒", chip: "bg-[#EAF4FB] text-[#185FA5] border border-[#85B7EB]" },
  auction: { label: "拍賣", icon: "🏷", chip: "bg-[#EEEDFE] text-[#534AB7] border border-[#C5C0F0]" },
  other: { label: "其他", icon: "📦", chip: "bg-[#F2F2F2] text-[#6B6A68] border border-[#D5D3CB]" },
};

export const USED_CAR_SOURCE_OPTIONS: { value: UsedCarAcquisitionSource | ""; label: string }[] = [
  { value: "", label: "全部來源" },
  { value: "trade_in", label: "🔄 置換收購" },
  { value: "direct_buy", label: "🛒 直接收購" },
  { value: "auction", label: "🏷 拍賣場" },
  { value: "other", label: "其他" },
];

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
  { value: "pending_recon", label: "待整備" },
  { value: "pending_inspection", label: "整備中" },
  { value: "reserved", label: "已保留" },
  { value: "sold", label: "已售出" },
  { value: "withdrawn", label: "已下架" },
];

// ─────────────────────────────────────────────────────────────
// 輪9 車況說明書（condition_report）結構
// 存在 used_car_inventory.metadata.condition_report（jsonb）
// ─────────────────────────────────────────────────────────────

/**
 * 車況說明書 — 技師填寫欄位（accident_history / flood_damage 唯讀，業務員不可改）。
 * 業務員欄位：odometer_reliable / inspection_summary / additional_notes。
 * 客戶確認：customer_acknowledged_at / customer_signature_url（走 Storage）。
 */
export type ConditionReport = {
  /** 事故歷史（技師填，唯讀）— true=有事故記錄 */
  accident_history: boolean | null;
  /** 泡水記錄（技師填，唯讀）— true=有泡水記錄 */
  flood_damage: boolean | null;
  /** 改裝改色（業務員）*/
  modification: string | null;
  /** 里程可信度（業務員）— true=可信、false=存疑 */
  odometer_reliable: boolean | null;
  /** 整體車況摘要（業務員）*/
  inspection_summary: string | null;
  /** 附加說明（業務員）*/
  additional_notes: string | null;
  /** 客戶簽名確認時間（ISO） */
  customer_acknowledged_at: string | null;
  /** 客戶簽名圖片 URL（存 Storage，非 base64）*/
  customer_signature_url: string | null;
  /** 來源 PDI 工單 id（可選）*/
  source_pdi_id: string | null;
};

/** 空白車況說明書（create 時初始化） */
export const EMPTY_CONDITION_REPORT: ConditionReport = {
  accident_history: null,
  flood_damage: null,
  modification: null,
  odometer_reliable: null,
  inspection_summary: null,
  additional_notes: null,
  customer_acknowledged_at: null,
  customer_signature_url: null,
  source_pdi_id: null,
};

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
  // ── T0（第十五輪）整備成本欄位 ──
  recon_workorder_id: string | null;
  recon_labor_cost: number | null;
  recon_parts_cost: number | null;
  bodywork_cost: number | null;
  transfer_freight_cost: number | null;
  /** generated 計算欄（acquisition_price + recon_labor + recon_parts + bodywork + transfer_freight），唯讀 */
  total_cost: number | null;
  /** join repair_orders 撈出的整備工單號（待整備車輛顯示用，非 DB column） */
  recon_workorder_code: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

// ── 整備成本合計（recon_labor + recon_parts + bodywork；不含運費 / 收購）──
export function calcReconCost(r: {
  recon_labor_cost: number | null;
  recon_parts_cost: number | null;
  bodywork_cost: number | null;
}): number {
  return (r.recon_labor_cost ?? 0) + (r.recon_parts_cost ?? 0) + (r.bodywork_cost ?? 0);
}

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
