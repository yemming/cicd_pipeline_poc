/**
 * RS_INV04 車輛調撥 — 狀態 / 運費承擔常數 + Row types（client-safe，無 supabase）
 *
 * 對應 DB 表：vehicle_transfers
 * 設計稿：docs/20260527/RS_INV04_車輛調撥.html
 */

// ── 調撥狀態 ──────────────────────────────────────────────────────────
export type TransferStatus = "pending" | "in_transit" | "completed" | "cancelled";

export const TRANSFER_STATUS_LABELS: Record<TransferStatus, string> = {
  pending: "待處理",
  in_transit: "調撥中",
  completed: "已完成",
  cancelled: "已取消",
};

export const TRANSFER_STATUS_CHIP: Record<TransferStatus, string> = {
  pending: "bg-[#EEEDFE] text-[#534AB7]",
  in_transit: "bg-[#FDF3E3] text-[#854F0B]",
  completed: "bg-[#EAF3DE] text-[#3B6D11]",
  cancelled: "bg-[#F2F2F2] text-[#6B6A68]",
};

export const ALL_TRANSFER_STATUSES: TransferStatus[] = [
  "pending",
  "in_transit",
  "completed",
  "cancelled",
];

// ── 運費承擔方式（5 種，對應 DB freight_type CHECK）────────────────────
export type FreightType =
  | "A_VEHICLE_COST"
  | "B_FROM"
  | "C_TO"
  | "D_SPLIT"
  | "E_NONE";

export const ALL_FREIGHT_TYPES: FreightType[] = [
  "A_VEHICLE_COST",
  "B_FROM",
  "C_TO",
  "D_SPLIT",
  "E_NONE",
];

/** 單一字母代碼（給設計稿卡片大字用） */
export const FREIGHT_CODE: Record<FreightType, string> = {
  A_VEHICLE_COST: "A",
  B_FROM: "B",
  C_TO: "C",
  D_SPLIT: "D",
  E_NONE: "E",
};

export const FREIGHT_TYPE_LABELS: Record<FreightType, string> = {
  A_VEHICLE_COST: "計入整車成本",
  B_FROM: "調出方負擔",
  C_TO: "調入方負擔",
  D_SPLIT: "各半平攤",
  E_NONE: "免運費",
};

/** 卡片副標 / 列表 chip 用的簡短說明 */
export const FREIGHT_TYPE_DESC: Record<FreightType, string> = {
  A_VEHICLE_COST: "增加 total_cost",
  B_FROM: "調出倉費用認列",
  C_TO: "寄倉方費用認列",
  D_SPLIT: "雙方各 50%",
  E_NONE: "特殊公關 / 免費",
};

/** 列表 chip 配色 */
export const FREIGHT_TYPE_CHIP: Record<FreightType, string> = {
  A_VEHICLE_COST: "bg-[#E1F5EE] text-[#0F6E56]",
  B_FROM: "bg-[#EAF4FB] text-[#185FA5]",
  C_TO: "bg-[#E8EDF2] text-[#1A3A5C]",
  D_SPLIT: "bg-[#EEEDFE] text-[#534AB7]",
  E_NONE: "bg-[#F2F2F2] text-[#6B6A68]",
};

/** 只有 A（計入整車成本）會寫回該車 transfer_freight_cost、影響毛利 */
export function freightHitsVehicleCost(t: FreightType): boolean {
  return t === "A_VEHICLE_COST";
}

// ── 車輛種類 ──────────────────────────────────────────────────────────
export type VehicleKind = "new" | "used";

export const VEHICLE_KIND_LABELS: Record<VehicleKind, string> = {
  new: "新車",
  used: "中古車",
};

// ─────────────────────────────────────────────────────────────────────
// Row types（client-safe）
// ─────────────────────────────────────────────────────────────────────

export type VehicleTransferRow = {
  id: string;
  brand_id: string;
  transfer_no: string;
  vehicle_kind: VehicleKind | null;
  new_car_id: string | null;
  used_car_id: string | null;
  from_warehouse_id: string | null;
  to_warehouse_id: string | null;
  transfer_date: string | null;
  freight_type: FreightType | null;
  freight_amount: number | null;
  carrier: string | null;
  reason: string | null;
  status: TransferStatus;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string | null;
  created_by: string | null;
  // ── 衍生顯示欄（domain join 後攤平）──
  vehicle_label: string | null; // 車型 + VIN 末 6 碼
  vin_tail: string | null;
  from_warehouse_name: string | null;
  to_warehouse_name: string | null;
};

/** 可調撥車輛清單（new + used 合併） */
export type TransferableVehicle = {
  id: string;
  kind: VehicleKind;
  label: string; // 車型名
  vin: string | null;
  vin_tail: string | null;
  status: string; // 原始庫存狀態（new/used 各自的 enum）
  status_label: string;
  /** 整車成本（顯示毛利影響用） */
  total_cost: number | null;
  /** 中古車才有：上架售價（算毛利用），新車為 null */
  listing_price: number | null;
  organization_id: string | null;
  /** 是否待整備（顯示整備工單暫停警告用） */
  pending_recon: boolean;
};

export type WarehouseOption = {
  id: string;
  name: string;
};

export type VehicleTransferFilters = {
  status?: string;
  freight_type?: string;
  vehicle_kind?: string;
  q?: string;
};
