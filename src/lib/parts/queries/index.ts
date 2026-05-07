/**
 * Parts 模組 read-only queries — server-only。
 *
 * 規則（CRITICAL）：
 *   - 一律用 `createClient`（吃 RLS）— 禁用 createServiceClient
 *   - 所有 query 隱含吃 brand 隔離（透過 RLS user_has_brand()）
 *   - 不需要在這裡顯式 `.eq('brand_id', ...)` — RLS 自動過濾
 *
 * Phase 2.3 階段：列出主要查詢 signature 不寫實作；W1-W6 Faithful Clone 時逐個 wire。
 */

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Item,
  PurchaseOrder,
  StockItem,
  StockReceipt,
  Supplier,
  Warehouse,
} from "../types";

// ──────────────────────────────────────────────────────────
// 主檔查詢
// ──────────────────────────────────────────────────────────

export async function getActiveItems(): Promise<Item[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`getActiveItems: ${error.message}`);
  return data ?? [];
}

export async function getItemByCode(code: string): Promise<Item | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("items")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw new Error(`getItemByCode: ${error.message}`);
  return data;
}

export async function getActiveSuppliers(): Promise<Supplier[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`getActiveSuppliers: ${error.message}`);
  return data ?? [];
}

export async function getActiveWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`getActiveWarehouses: ${error.message}`);
  return data ?? [];
}

// ──────────────────────────────────────────────────────────
// 庫存查詢（聚合 view）
// ──────────────────────────────────────────────────────────

/** v_stock_balances 聚合：每料件每庫位的可用 / 凍結 / 寄存等數量。 */
export async function getStockBalances() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_stock_balances")
    .select("*")
    .order("item_code");
  if (error) throw new Error(`getStockBalances: ${error.message}`);
  return data ?? [];
}

/** 細粒度：某料件某庫位的所有 stock_items（含序列號 / 批次明細）。 */
export async function getStockItemsForItem(itemId: string): Promise<StockItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_items")
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getStockItemsForItem: ${error.message}`);
  return data ?? [];
}

// ──────────────────────────────────────────────────────────
// 採購查詢
// ──────────────────────────────────────────────────────────

export async function getOpenPurchaseOrders(): Promise<PurchaseOrder[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .in("status", ["pending", "approved", "partial_received"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getOpenPurchaseOrders: ${error.message}`);
  return data ?? [];
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getPurchaseOrderById: ${error.message}`);
  return data;
}

// ──────────────────────────────────────────────────────────
// 入庫 / 出庫查詢
// ──────────────────────────────────────────────────────────

export async function getRecentReceipts(limit = 50): Promise<StockReceipt[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_receipts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getRecentReceipts: ${error.message}`);
  return data ?? [];
}

// ──────────────────────────────────────────────────────────
// W1-W6 待補（Faithful Clone 接 actions 時填）
// ──────────────────────────────────────────────────────────
//
// TODO W1：getRequisitionsByStatus / getOpenReceipts / getStaleStockItems
// TODO W2：getOpenIssues / getRepairPickQueue
// TODO W3：getCountSessions / getOpenAdjustments / getInTransitTransfers
// TODO W4：getOrgTree / getItemHierarchy / getStorePricing
// TODO W6：getStaleInventory / getInventoryTurnover / getABCClassification
