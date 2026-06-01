/**
 * 進口文件（import_documents）— 純型別 + 文件類型目錄（client / server 共用）
 *
 * 文件類型對映 7-stage 進口流程（見 import-shipments.constants.ts 的 SHIPMENT_STAGES）。
 * 一份文件可掛在 批次(shipment) / 採購單(PO) / 單一車輛(vehicle) 任一層級。
 */

import type { ShipmentStage } from "./import-shipments.constants";

export type ImportDocType =
  | "pi" // 預估發票 Proforma Invoice
  | "po" // 採購訂單 Purchase Order
  | "ci" // 商業發票 Commercial Invoice
  | "packing_list" // 裝箱單 Packing List
  | "bl" // 提單 Bill of Lading
  | "awb" // 空運提單 Air Waybill
  | "coo" // 產地證明 Certificate of Origin
  | "insurance" // 保險單 Insurance Policy
  | "customs_decl" // 進口報單 Customs Declaration
  | "duty_payment" // 海關完稅證明
  | "import_permit" // 輸入許可證
  | "vscc" // 車輛安全審驗合格證明（VSCC）
  | "emission" // 排氣/噪音審驗合格
  | "commodity_tax_cert" // 貨物稅完稅照
  | "origin_cert" // 出廠證明
  | "delivery_doc" // 交車文件
  | "other"; // 其他

/** doc_type 目錄（顯示順序 ≈ 文件在流程出現的順序） */
export const DOC_TYPES: Array<{
  value: ImportDocType;
  label: string;
  stage: ShipmentStage;
}> = [
  { value: "pi", label: "預估發票 PI", stage: "ordered" },
  { value: "po", label: "採購訂單 PO", stage: "ordered" },
  { value: "ci", label: "商業發票 CI", stage: "shipping" },
  { value: "packing_list", label: "裝箱單 Packing List", stage: "shipping" },
  { value: "bl", label: "提單 B/L", stage: "shipping" },
  { value: "awb", label: "空運提單 AWB", stage: "shipping" },
  { value: "coo", label: "產地證明 COO", stage: "shipping" },
  { value: "insurance", label: "保險單", stage: "shipping" },
  { value: "customs_decl", label: "進口報單", stage: "customs" },
  { value: "duty_payment", label: "海關完稅證明", stage: "customs" },
  { value: "import_permit", label: "輸入許可證", stage: "customs" },
  { value: "vscc", label: "車輛安全審驗（VSCC）", stage: "inspection" },
  { value: "emission", label: "排氣/噪音審驗", stage: "inspection" },
  { value: "commodity_tax_cert", label: "貨物稅完稅照", stage: "stocked" },
  { value: "origin_cert", label: "出廠證明", stage: "stocked" },
  { value: "delivery_doc", label: "交車文件", stage: "sold" },
  { value: "other", label: "其他", stage: "ordered" },
];

export const DOC_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  DOC_TYPES.map((d) => [d.value, d.label]),
);
export const DOC_TYPE_STAGE: Record<string, ShipmentStage> = Object.fromEntries(
  DOC_TYPES.map((d) => [d.value, d.stage]),
);

export type DocLinkLevel = "shipment" | "purchase_order" | "vehicle";

export type ImportDocumentRow = {
  id: string;
  brand_id: string;
  doc_type: ImportDocType;
  shipment_id: string | null;
  purchase_order_id: string | null;
  vehicle_id: string | null;
  doc_no: string | null;
  issued_by: string | null;
  issued_date: string | null;
  stage: ShipmentStage | null;
  file_url: string | null;
  created_at: string | null;
  // 衍生顯示欄（join 來的）
  shipment_no: string | null;
  po_no: string | null;
  vehicle_vin: string | null;
};
