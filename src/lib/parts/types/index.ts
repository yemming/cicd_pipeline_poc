/**
 * Parts 模組 Domain Types — 從 Supabase autogen 的 Database['public']['Tables']
 * re-export 並給語意化命名，讓業務 code 不用記 row/insert/update 三層結構。
 *
 * 規則：
 *   - Row 別名 = 表名單數駝峰（Item, Supplier, StockItem...）
 *   - Insert / Update 加後綴（ItemInsert, ItemUpdate）
 *   - 業務常用 enum / status 字面型別放這裡（避免散落）
 */

import type { Database } from "@/lib/database.types";

type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
type Insert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
type Update<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

// ──────────────────────────────────────────────────────────
// 主檔
// ──────────────────────────────────────────────────────────
export type Organization = Row<"organizations">;
export type Warehouse = Row<"warehouses">;
export type WarehouseZone = Row<"warehouse_zones">;
export type WarehouseBin = Row<"warehouse_bins">;
export type Account = Row<"chart_of_accounts">;
export type Supplier = Row<"suppliers">;
export type SupplierContract = Row<"supplier_contracts">;
export type Customer = Row<"customers">;
export type VehicleModel = Row<"vehicle_models">;
export type Item = Row<"items">;
export type ItemSku = Row<"item_skus">;
export type ItemStorePrice = Row<"item_store_prices">;
export type ItemVehicleCompatibility = Row<"item_vehicle_compatibility">;
export type DocumentNumberRule = Row<"document_number_rules">;
export type Department = Row<"departments">;
export type Employee = Row<"employees">;
export type EmployeeCertification = Row<"employee_certifications">;
export type EmployeeInsert = Insert<"employees">;
export type EmployeeUpdate = Update<"employees">;
export type EmployeeCertificationInsert = Insert<"employee_certifications">;
export type EmployeeCertificationUpdate = Update<"employee_certifications">;

export type EmploymentStatus = "active" | "on_leave" | "terminated" | "retired";

export type CustomerVehicle = Row<"customer_vehicles">;
export type CustomerVehicleInsert = Insert<"customer_vehicles">;
export type CustomerVehicleUpdate = Update<"customer_vehicles">;
export type CustomerContact = Row<"customer_contacts">;
export type CustomerContactInsert = Insert<"customer_contacts">;
export type CustomerContactUpdate = Update<"customer_contacts">;

export type VehicleAcquiredFrom = "new" | "transfer" | "used" | "import" | "other";
export type CustomerContactRole =
  | "primary"
  | "emergency"
  | "family"
  | "secretary"
  | "other";

// ──────────────────────────────────────────────────────────
// Service / 維修（Wave 2.0）
// ──────────────────────────────────────────────────────────
export type ServiceAppointment = Row<"service_appointments">;
export type ServiceAppointmentInsert = Insert<"service_appointments">;
export type ServiceAppointmentUpdate = Update<"service_appointments">;
export type WorkOrder = Row<"work_orders">;
export type WorkOrderInsert = Insert<"work_orders">;
export type WorkOrderUpdate = Update<"work_orders">;
export type RepairOrder = Row<"repair_orders">;
export type WorkOrderItem = Row<"work_order_items">;
export type WorkOrderItemInsert = Insert<"work_order_items">;
export type InspectionRecord = Row<"inspection_records">;
export type InspectionRecordInsert = Insert<"inspection_records">;
export type InspectionFinding = Row<"inspection_findings">;
export type InspectionFindingInsert = Insert<"inspection_findings">;
export type WarrantyClaim = Row<"warranty_claims">;
export type WarrantyClaimInsert = Insert<"warranty_claims">;
export type WarrantyClaimLine = Row<"warranty_claim_lines">;
export type WarrantyClaimLineInsert = Insert<"warranty_claim_lines">;
export type WarrantyClaimType =
  | "oem_warranty"
  | "extended_warranty"
  | "tsb"
  | "pdi"
  | "goodwill";
export type WarrantyClaimStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "partial_approved"
  | "rejected"
  | "received"
  | "cancelled";

export type AppointmentStatus =
  | "booked"
  | "checked_in"
  | "in_progress"
  | "done"
  | "cancelled"
  | "no_show";
export type ServiceType =
  | "general"
  | "scheduled_maintenance"
  | "repair"
  | "pdi"
  | "other";
export type WorkOrderStatus =
  | "draft"
  | "dispatched"
  | "in_progress"
  | "qc"
  | "done"
  | "closed"
  | "cancelled";
export type WorkOrderItemKind = "parts" | "labor" | "external" | "discount";
export type InspectionKind = "PI" | "PDI";
export type InspectionOverallStatus = "pending" | "pass" | "fail" | "conditional";
export type FindingStatus = "ok" | "needs_attention" | "critical" | "na";

// ──────────────────────────────────────────────────────────
// 交易
// ──────────────────────────────────────────────────────────
export type PurchaseRequisition = Row<"purchase_requisitions">;
export type PurchaseRequisitionLine = Row<"purchase_requisition_lines">;
export type PurchaseOrder = Row<"purchase_orders">;
export type PurchaseOrderLine = Row<"purchase_order_lines">;
export type PurchaseReturn = Row<"purchase_returns">;
export type PurchaseReturnLine = Row<"purchase_return_lines">;
export type StockReceipt = Row<"stock_receipts">;
export type StockReceiptLine = Row<"stock_receipt_lines">;
export type StockIssue = Row<"stock_issues">;
export type StockIssueLine = Row<"stock_issue_lines">;
export type StockTransfer = Row<"stock_transfers">;
export type StockTransferLine = Row<"stock_transfer_lines">;
export type StockItem = Row<"stock_items">;
export type ConsignmentStock = Row<"consignment_stocks">;

// ──────────────────────────────────────────────────────────
// Insert / Update（建單時用）
// ──────────────────────────────────────────────────────────
export type ItemInsert = Insert<"items">;
export type ItemUpdate = Update<"items">;
export type PurchaseOrderInsert = Insert<"purchase_orders">;
export type PurchaseOrderLineInsert = Insert<"purchase_order_lines">;
export type StockReceiptInsert = Insert<"stock_receipts">;
export type StockReceiptLineInsert = Insert<"stock_receipt_lines">;
export type StockIssueInsert = Insert<"stock_issues">;
export type StockIssueLineInsert = Insert<"stock_issue_lines">;
export type StockTransferInsert = Insert<"stock_transfers">;
export type StockItemInsert = Insert<"stock_items">;

// ──────────────────────────────────────────────────────────
// 業務狀態字面型別
// ──────────────────────────────────────────────────────────
export type StockItemStatus =
  | "available"
  | "reserved"
  | "frozen"
  | "in_transit"
  | "consigned"
  | "scrapped";

export type PurchaseOrderStatus =
  | "draft"
  | "submitted"
  | "pending"
  | "approved"
  | "partial"
  | "closed"
  // legacy 別名（DB CHECK 不接受，僅為相容舊 code/型別，不應再寫入）
  | "partial_received"
  | "received"
  | "cancelled";

export type ReceiptKind =
  | "po_grn"
  | "transfer_in"
  | "internal_sale"
  | "return_in"
  | "exception_in";

export type IssueKind =
  | "ro_picking"
  | "internal_sale"
  | "transfer_out"
  | "exception_out";

export type ItemControlType = "serial" | "lot" | "qty";
