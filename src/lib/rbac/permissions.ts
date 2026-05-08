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

  // ─── Parts / WMS 採購 ──────────────────────────
  PR_VIEW: "parts.pr.view",
  PR_CREATE: "parts.pr.create",
  PR_APPROVE: "parts.pr.approve",
  PO_VIEW: "parts.po.view",
  PO_CREATE: "parts.po.create",
  PO_APPROVE: "parts.po.approve",
  PO_RETURN: "parts.po.return",

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

  // ─── Admin ─────────────────────────────────────
  ADMIN_NAV: "admin.nav.edit",
  ADMIN_APPEARANCE: "admin.appearance.edit",
  ADMIN_NOTIFICATION: "admin.notification.manage",
  ADMIN_USER: "admin.user.manage",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
