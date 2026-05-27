/**
 * 展廳新車庫存 — 狀態常數與 label map + Row types
 * 對應 DB: new_car_inventory.status / license_plate_status
 * Row types 放這裡，讓 client component 可安全 import（不帶 server-only）
 */

export type NewCarInventoryStatus =
  | "in_transit"
  | "pending_pdi"
  | "arrived"
  | "displayed"
  | "reserved"
  | "sold"
  | "delivered"
  | "damaged";

export type LicensePlateStatus =
  | "not_applied"
  | "applying"
  | "registered"
  | "customer";

export const NEW_CAR_STATUS_LABELS: Record<NewCarInventoryStatus, string> = {
  in_transit: "在途",
  pending_pdi: "待 PDI",
  arrived: "已到廠",
  displayed: "展示中",
  reserved: "已保留",
  sold: "已售出",
  delivered: "已交車",
  damaged: "報損",
};

export const LICENSE_PLATE_STATUS_LABELS: Record<LicensePlateStatus, string> = {
  not_applied: "未申請",
  applying: "申請中",
  registered: "已領牌",
  customer: "客戶自理",
};

/** 狀態 chip 配色 */
export const NEW_CAR_STATUS_CHIP: Record<NewCarInventoryStatus, string> = {
  in_transit: "bg-[#EAF4FB] text-[#185FA5]",
  pending_pdi: "bg-[#EEEDFE] text-[#534AB7]",
  arrived: "bg-[#F2F2F2] text-[#6B6A68]",
  displayed: "bg-[#EAF3DE] text-[#3B6D11]",
  reserved: "bg-[#FDF3E3] text-[#854F0B]",
  sold: "bg-[#FDECEA] text-[#CC0000]",
  delivered: "bg-[#E1F5EE] text-[#0F6E56]",
  damaged: "bg-[#F2F2F2] text-[#9A9890]",
};

export const ALL_STATUSES: NewCarInventoryStatus[] = [
  "in_transit",
  "pending_pdi",
  "arrived",
  "displayed",
  "reserved",
  "sold",
  "delivered",
  "damaged",
];

export const ALL_LICENSE_PLATE_STATUSES: LicensePlateStatus[] = [
  "not_applied",
  "applying",
  "registered",
  "customer",
];

// ─────────────────────────────────────────────────────────────
// 純顯示 helpers（client-safe — 無 supabase）
// ─────────────────────────────────────────────────────────────

/**
 * PDI 整備進度（0–100）。
 *
 * 資料源：metadata.pdi_progress（純顯示、單頁專用 → 走 jsonb，不升 typed column）。
 * 待 PDI 工單（T8）回寫完工項數 % 時更新此值；缺值時 pending_pdi 顯示 0、其餘狀態視為 100（已完成）。
 */
export function pdiProgress(row: { status: NewCarInventoryStatus; metadata?: Record<string, unknown> }): number {
  const raw = row.metadata?.pdi_progress;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.max(0, Math.min(100, Math.round(raw)));
  }
  // pending_pdi 無進度資料 → 視為剛入庫 0%；已過 PDI 的狀態視為 100%
  return row.status === "pending_pdi" || row.status === "in_transit" ? 0 : 100;
}

/** metadata.pdi_workorder_no — PDI 工單顯示單號（純顯示） */
export function pdiWorkorderNo(row: { metadata?: Record<string, unknown> }): string | null {
  const raw = row.metadata?.pdi_workorder_no;
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/** 整車成本毛利空間 = list_price − total_cost；任一缺則 null */
export function grossMargin(row: { list_price: number | null; total_cost: number | null }): number | null {
  if (row.list_price == null || row.total_cost == null || row.total_cost <= 0) return null;
  return row.list_price - row.total_cost;
}

// ─────────────────────────────────────────────────────────────
// Row types（client-safe — 純資料結構，無 supabase 呼叫）
// ─────────────────────────────────────────────────────────────

export type NewCarInventoryRow = {
  id: string;
  brand_id: string;
  subsidiary_id: string | null;
  organization_id: string | null;
  vin: string | null;
  external_id: string | null;
  vehicle_model_id: string | null;
  color: string | null;
  color_hex: string | null;
  config: Record<string, unknown>;
  year: number | null;
  engine_no: string | null;
  build_date: string | null;
  cost_price: number | null;
  list_price: number | null;
  /** 整備人工成本（PDI 工單回寫） */
  pdi_labor_cost: number | null;
  /** 整備零件成本（PDI 工單回寫） */
  pdi_parts_cost: number | null;
  /** 調撥運費（跨店調車回寫） */
  transfer_freight_cost: number | null;
  /** 整車成本（generated = cost_price + pdi_labor + pdi_parts + transfer_freight，唯讀） */
  total_cost: number | null;
  /** 對應 PDI 整備工單（repair_orders.id） */
  pdi_workorder_id: string | null;
  /** 整車採購訂單 */
  purchase_order_id: string | null;
  /** 到港批次 */
  arrival_batch_id: string | null;
  /** 是否運損 */
  damage_flag: boolean | null;
  /** 運損備註 */
  damage_notes: string | null;
  status: NewCarInventoryStatus;
  arrival_date: string | null;
  displayed_date: string | null;
  reserved_date: string | null;
  sold_date: string | null;
  delivered_date: string | null;
  license_plate_status: LicensePlateStatus;
  license_plate_no: string | null;
  linked_sales_order_id: string | null;
  note: string | null;
  images: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
  /** join: vehicle_models.display_name */
  model_display_name?: string | null;
  /** join: vehicle_models.series */
  model_series?: string | null;
  /** join: organizations.name */
  organization_name?: string | null;
};

export type NewCarInventoryFilters = {
  status?: string;
  series?: string;
  color?: string;
  license_plate_status?: string;
  q?: string;
};

export type NewCarInventoryInput = {
  brand_id: string;
  subsidiary_id?: string | null;
  organization_id?: string | null;
  vin?: string | null;
  external_id?: string | null;
  vehicle_model_id?: string | null;
  color?: string | null;
  color_hex?: string | null;
  config?: Record<string, unknown>;
  year?: number | null;
  engine_no?: string | null;
  build_date?: string | null;
  cost_price?: number | null;
  list_price?: number | null;
  status?: NewCarInventoryStatus;
  arrival_date?: string | null;
  displayed_date?: string | null;
  reserved_date?: string | null;
  sold_date?: string | null;
  delivered_date?: string | null;
  license_plate_status?: LicensePlateStatus;
  license_plate_no?: string | null;
  linked_sales_order_id?: string | null;
  note?: string | null;
  images?: string[];
  metadata?: Record<string, unknown>;
};

export type VehicleModelOption = {
  id: string;
  display_name: string;
  series: string | null;
  msrp: number | null;
};

export type OrganizationOption = {
  id: string;
  name: string;
};

export type NewCarKpiSummary = {
  /** 現車可售（displayed） */
  displayed: number;
  /** 待 PDI（pending_pdi）— 整備工單進行中 */
  pending_pdi: number;
  reserved: number;
  in_transit: number;
  arrived: number;
  sold_this_month: number;
};

export type NewCarByModelDatum = {
  model: string;
  series: string | null;
  in_transit: number;
  arrived: number;
  displayed: number;
  reserved: number;
  sold: number;
  delivered: number;
  damaged: number;
  total: number;
} & Record<NewCarInventoryStatus, number>;

export type NewCarSlowMover = {
  id: string;
  vin: string | null;
  model_display_name: string | null;
  color: string | null;
  status: NewCarInventoryStatus;
  arrival_date: string;
  days_in_stock: number;
  list_price: number | null;
};
