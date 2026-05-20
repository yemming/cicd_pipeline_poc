/**
 * 展廳新車庫存 — 狀態常數與 label map + Row types
 * 對應 DB: new_car_inventory.status / license_plate_status
 * Row types 放這裡，讓 client component 可安全 import（不帶 server-only）
 */

export type NewCarInventoryStatus =
  | "in_transit"
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
  arrived: "bg-[#F2F2F2] text-[#6B6A68]",
  displayed: "bg-[#EAF3DE] text-[#3B6D11]",
  reserved: "bg-[#FDF3E3] text-[#854F0B]",
  sold: "bg-[#FDECEA] text-[#CC0000]",
  delivered: "bg-[#E1F5EE] text-[#0F6E56]",
  damaged: "bg-[#F2F2F2] text-[#9A9890]",
};

export const ALL_STATUSES: NewCarInventoryStatus[] = [
  "in_transit",
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
  displayed: number;
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
