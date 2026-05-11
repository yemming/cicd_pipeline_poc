/**
 * Parts 模組 barrel — 從這裡 import 所有 parts 公開 API。
 *
 *   import { getActiveItems, PARTS_PERMISSIONS } from "@/lib/parts";
 *
 * 注意：採購 PO 的 mutation（createPurchaseOrder / approve / cancel）
 *       已遷至 `@/domain/orders`，不從此 barrel 出口。
 *
 * 內部結構（不直接 import）：
 *   - types/   domain types（Item, StockItem, PurchaseOrder, ...）
 *   - queries/ read-only server queries（吃 RLS）
 *   - actions/ server actions（'use server'）
 *   - permissions.ts  RBAC keys
 */

export * from "./types";
export * from "./queries";
export * from "./actions";
export { PARTS_PERMISSIONS, type PartsPermissionKey } from "./permissions";
