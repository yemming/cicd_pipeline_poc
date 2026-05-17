/**
 * 全站 permission code 單一事實來源。
 *
 * 命名慣例：`{module}.{entity}.{action}` —— 動詞用 view/create/edit/delete/approve/close。
 * 加 permission 一律加在這裡；server action 用 requirePermission(PERMISSIONS.X) 防衛。
 *
 * Wave 1 之前，role → permissions 的 mapping 寫在 src/lib/rbac/policies.ts 的 ROLE_PERMS 常數。
 * Wave 1 起改吃 DB roles / role_permissions / user_roles 表。
 */
export const PERMISSIONS = {
  // ─── Master Data ───────────────────────────────
  EMPLOYEE_VIEW: "master.employee.view",
  EMPLOYEE_EDIT: "master.employee.edit",
  CUSTOMER_VIEW: "master.customer.view",
  CUSTOMER_EDIT: "master.customer.edit",
  SUPPLIER_VIEW: "master.supplier.view",
  SUPPLIER_EDIT: "master.supplier.edit",
  ITEM_VIEW: "master.item.view",
  ITEM_EDIT: "master.item.edit",
  ORG_VIEW: "master.org.view",
  ORG_EDIT: "master.org.edit",
  WAREHOUSE_VIEW: "master.warehouse.view",
  WAREHOUSE_EDIT: "master.warehouse.edit",
  VEHICLE_VIEW: "master.vehicle.view",
  VEHICLE_EDIT: "master.vehicle.edit",

  // ─── Parts / 設定 ──────────────────────────────
  PARTS_PURCHASE_PERMISSION_VIEW: "parts.purchase_permission.view",
  PARTS_PURCHASE_PERMISSION_EDIT: "parts.purchase_permission.edit",
  PARTS_ITEM_PERMISSION_VIEW: "parts.item_permission.view",
  PARTS_ITEM_PERMISSION_EDIT: "parts.item_permission.edit",
  // ─── Parts / 商品管理權限矩陣（細粒度）— 對映 /parts/setup/item-permissions 9 capability ──
  PARTS_ITEM_VIEW: "parts.item.view",
  PARTS_ITEM_CREATE: "parts.item.create",
  PARTS_ITEM_UPDATE: "parts.item.update",
  PARTS_ITEM_ARCHIVE: "parts.item.archive",
  PARTS_PRICING_VIEW: "parts.pricing.view",
  PARTS_PRICING_EDIT: "parts.pricing.edit",
  PARTS_PRICING_DISCOUNT: "parts.pricing.discount",
  PARTS_SERIAL_CONFIG: "parts.serial.config",
  PARTS_BATCH_CONFIG: "parts.batch.config",
  PARTS_COUNT_RULE_VIEW: "parts.count_rule.view",
  PARTS_COUNT_RULE_EDIT: "parts.count_rule.edit",
  PARTS_CONTROL_TYPE_VIEW: "parts.control_type.view",
  PARTS_CONTROL_TYPE_EDIT: "parts.control_type.edit",
  PARTS_SERIAL_RULE_VIEW: "parts.serial_rule.view",
  PARTS_SERIAL_RULE_EDIT: "parts.serial_rule.edit",
  PARTS_WAREHOUSE_ARCH_VIEW: "parts.warehouse_arch.view",
  PARTS_WAREHOUSE_ARCH_EDIT: "parts.warehouse_arch.edit",

  // ─── Parts / WMS 採購 ──────────────────────────
  PR_VIEW: "parts.pr.view",
  PR_CREATE: "parts.pr.create",
  PR_APPROVE: "parts.pr.approve",
  PO_VIEW: "parts.po.view",
  PO_CREATE: "parts.po.create",
  PO_APPROVE: "parts.po.approve",
  PO_RETURN: "parts.po.return",

  // ─── MRP / 補貨計畫參數 ─────────────────────────
  SUPPLIER_PRICING_VIEW: "master.supplier_pricing.view",
  SUPPLIER_PRICING_EDIT: "master.supplier_pricing.edit",
  REPLENISHMENT_POLICY_VIEW: "master.replenishment_policy.view",
  REPLENISHMENT_POLICY_EDIT: "master.replenishment_policy.edit",
  REPLENISHMENT_RUN: "parts.replenishment.run",

  // ─── 出入庫 ────────────────────────────────────
  RECEIPT_VIEW: "parts.receipt.view",
  RECEIPT_CREATE: "parts.receipt.create",
  ISSUE_VIEW: "parts.issue.view",
  ISSUE_CREATE: "parts.issue.create",
  TRANSFER_VIEW: "parts.transfer.view",
  TRANSFER_CREATE: "parts.transfer.create",
  EXCEPTION_OPS: "parts.exception.ops",

  // ─── 盤點 ──────────────────────────────────────
  COUNT_VIEW: "parts.count.view",
  COUNT_PLAN: "parts.count.plan",
  COUNT_EXECUTE: "parts.count.execute",
  COUNT_ADJUST: "parts.count.adjust",

  // ─── 告警 / 寄存 / 舊件 ─────────────────────────
  ALERT_VIEW: "parts.alert.view",
  ALERT_CONFIG: "parts.alert.config",
  CONSIGNMENT_OPS: "parts.consignment.ops",
  USEDPART_OPS: "parts.usedpart.ops",

  // ─── Service / 維修 ────────────────────────────
  APPOINTMENT_VIEW: "service.appointment.view",
  APPOINTMENT_EDIT: "service.appointment.edit",
  PI_EXECUTE: "service.pi.execute",
  PDI_EXECUTE: "service.pdi.execute",
  INSPECTION_VIEW: "service.inspection.view",
  INSPECTION_EDIT: "service.inspection.edit",
  RO_VIEW: "service.ro.view",
  RO_CREATE: "service.ro.create",
  RO_DISPATCH: "service.ro.dispatch",
  RO_CLOSE: "service.ro.close",
  RO_APPROVE: "service.ro.approve",
  WARRANTY_VIEW: "service.warranty.view",
  WARRANTY_SUBMIT: "service.warranty.submit",
  AFTERSALES_DISCOUNT_VIEW: "service.aftersales_discount.view",
  AFTERSALES_DISCOUNT_EDIT: "service.aftersales_discount.edit",
  AFTERSALES_PERMISSION_VIEW: "service.aftersales_permission.view",
  AFTERSALES_PERMISSION_EDIT: "service.aftersales_permission.edit",

  // ─── 電子發票 ───────────────────────────────────
  EINVOICE_VIEW: "einvoice.view",
  EINVOICE_EDIT: "einvoice.edit",
  EINVOICE_VOID: "einvoice.void",
  EINVOICE_ALLOWANCE: "einvoice.allowance",
  EINVOICE_SETTINGS: "einvoice.settings",

  // ─── 銷售訂單 ───────────────────────────────────
  SALES_ORDER_VIEW: "sales.order.view",
  SALES_ORDER_EDIT: "sales.order.edit",
  SALES_ORDER_CANCEL: "sales.order.cancel",
  SALES_ORDER_APPROVE: "sales.order.approve",

  // ─── 中古車評估鑑價 ─────────────────────────────
  USED_CAR_EVALUATION_APPROVE: "usedcar.evaluation.approve",

  // ─── Admin ─────────────────────────────────────
  ADMIN_NAV: "admin.nav.edit",
  ADMIN_APPEARANCE: "admin.appearance.edit",
  ADMIN_NOTIFICATION: "admin.notification.manage",
  ADMIN_USER: "admin.user.manage",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
