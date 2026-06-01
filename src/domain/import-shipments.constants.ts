/**
 * 進口批次（import_shipments）— 純型別 + 標籤（client / server 共用）
 */

export type ShipmentStage =
  | "ordered" // 下單與訂金
  | "producing" // 原廠生產出貨
  | "shipping" // 海運/空運
  | "customs" // 到港報關
  | "inspection" // 商檢車測 VSCC
  | "stocked" // 入庫領牌
  | "sold"; // 銷售出庫

export type ShipmentStatus = "open" | "settled" | "closed" | "cancelled";

/** 7-stage 進度（對應 BrandDump P2P 卡 §1）— 顯示順序 */
export const SHIPMENT_STAGES: Array<{ value: ShipmentStage; label: string; short: string }> = [
  { value: "ordered", label: "Stage 1 下單與訂金", short: "下單" },
  { value: "producing", label: "Stage 2 生產出貨準備", short: "生產" },
  { value: "shipping", label: "Stage 3 海運/空運", short: "海運" },
  { value: "customs", label: "Stage 4 到港與報關", short: "報關" },
  { value: "inspection", label: "Stage 5 商檢車測（VSCC）", short: "商檢" },
  { value: "stocked", label: "Stage 6 入庫與領牌", short: "入庫" },
  { value: "sold", label: "Stage 7 銷售出庫", short: "出庫" },
];

export const SHIPMENT_STAGE_LABEL: Record<string, string> = Object.fromEntries(
  SHIPMENT_STAGES.map((s) => [s.value, s.short]),
);
export function stageIndex(stage: string): number {
  return SHIPMENT_STAGES.findIndex((s) => s.value === stage);
}

export const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  open: "結算中",
  settled: "已結算",
  closed: "已關閉",
  cancelled: "已取消",
};
export const SHIPMENT_STATUS_CHIP: Record<string, string> = {
  open: "bg-[#FDF3E3] text-[#854F0B]",
  settled: "bg-[#EAF3DE] text-[#3B6D11]",
  closed: "bg-[#F2F2F2] text-[#6B6A68]",
  cancelled: "bg-[#FDECEA] text-[#CC0000]",
};

export const INCOTERMS = ["EXW", "FOB", "CIF", "DDP", "CFR", "DAP"] as const;

export type ShipmentRow = {
  id: string;
  brand_id: string;
  shipment_no: string;
  purchase_order_id: string | null;
  bl_no: string | null;
  awb_no: string | null;
  customs_decl_no: string | null;
  vessel: string | null;
  forwarder: string | null;
  incoterms: string | null;
  total_cif: number | null;
  customs_valuation: number | null;
  etd: string | null;
  eta: string | null;
  customs_clear_date: string | null;
  stage: ShipmentStage;
  status: ShipmentStatus;
  notes: string | null;
  created_at: string | null;
  gl_posted: boolean;
  // 衍生
  vehicle_count: number;
  pool_total: number; // 已登錄費用池合計
  settled: boolean;
};

export type ShipmentVehicleRow = {
  id: string;
  vin: string | null;
  color: string | null;
  model_display_name: string | null;
  status: string;
  cif_value: number;
  gross_weight_kg: number;
  cost_price: number;
  customs_duty: number;
  commodity_tax: number;
  import_fees: number;
  model_amortized_cost: number;
  total_cost: number;
  cost_frozen_at: string | null;
};

export type PoolLineRow = {
  id: string;
  shipment_id: string;
  cost_type: string;
  amount: number;
  allocation_basis: string;
  is_inventoriable: boolean;
  target_vehicle_id: string | null;
  payee: string | null;
  invoice_no: string | null;
  occurred_at: string | null;
};
