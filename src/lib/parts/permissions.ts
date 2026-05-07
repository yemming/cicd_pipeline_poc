/**
 * Parts 模組 RBAC permission keys — 集中定義，方便 grep / refactor。
 *
 * 對應 nav_nodes.permission 欄位 + (未來) profiles.permissions[]。
 * Phase 2 階段先列字串常數，W1 開工時 server actions / page guard 開始 import。
 */

export const PARTS_PERMISSIONS = {
  /** 看得見 parts 模組（基礎） */
  ACCESS: "parts.access",
  /** 基礎設定 17 頁全 CRUD（管理員） */
  ADMIN: "parts.admin",

  // 採購
  PURCHASE_CREATE: "parts.purchase.create",
  PURCHASE_APPROVE: "parts.purchase.approve",
  PURCHASE_RETURN: "parts.purchase.return",

  // 入庫
  RECEIPT_CREATE: "parts.receipt.create",
  RECEIPT_POST: "parts.receipt.post",

  // 出庫
  ISSUE_CREATE: "parts.issue.create",
  ISSUE_APPROVE: "parts.issue.approve",

  // 調撥
  TRANSFER_CREATE: "parts.transfer.create",
  TRANSFER_APPROVE: "parts.transfer.approve",

  // 盤點
  COUNT_PLAN: "parts.count.plan",
  COUNT_SUBMIT: "parts.count.submit",
  COUNT_POST: "parts.count.post",

  // 預警 / 告警
  ALERTS_CONFIGURE: "parts.alerts.configure",

  // 保固索賠
  WARRANTY_CLAIM: "parts.warranty.claim",

  // 分析
  ANALYTICS_VIEW: "parts.analytics.view",
} as const;

export type PartsPermissionKey = (typeof PARTS_PERMISSIONS)[keyof typeof PARTS_PERMISSIONS];
