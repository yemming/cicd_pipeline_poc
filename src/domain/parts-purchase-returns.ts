"use server";

/**
 * Domain Helper — Parts Purchase Returns（採購退貨）
 *
 * M04U-13 升 A 級新建檔。對外是「採購退貨」業務動作的單一入口。
 *
 * 設計分層：
 *  - 通用 procurement helpers 長期住 `procurement.ts`，本檔薄薄 wrap 一層
 *    （`"use server"` 不能用 `export { ... } from` re-export 語法，所以 wrap 成
 *    本檔自己的 async function — 邏輯仍 fully delegate 到 procurement.ts）。
 *  - 本檔額外提供 list view 專用的進階 helper（reason breakdown）。
 *
 * 純常數 / type / formatter 在 `./parts-purchase-returns.constants.ts`。
 */

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import * as proc from "./procurement";

// ──────────────────────────────────────────────────────────────────────────
// Wrap procurement.ts 的退貨業務動作（不能用 export { ... } from 的 re-export
// 語法，"use server" module 限制只能 export async function declaration）。
// ──────────────────────────────────────────────────────────────────────────

export async function listPurchaseReturns(
  ...args: Parameters<typeof proc.listPurchaseReturns>
): ReturnType<typeof proc.listPurchaseReturns> {
  return proc.listPurchaseReturns(...args);
}

export async function getPurchaseReturnById(
  ...args: Parameters<typeof proc.getPurchaseReturnById>
): ReturnType<typeof proc.getPurchaseReturnById> {
  return proc.getPurchaseReturnById(...args);
}

export async function getPurchaseReturnKpis(
  ...args: Parameters<typeof proc.getPurchaseReturnKpis>
): ReturnType<typeof proc.getPurchaseReturnKpis> {
  return proc.getPurchaseReturnKpis(...args);
}

export async function listPurchaseOrderOptions(
  ...args: Parameters<typeof proc.listPurchaseOrderOptions>
): ReturnType<typeof proc.listPurchaseOrderOptions> {
  return proc.listPurchaseOrderOptions(...args);
}

export async function getPurchaseOrderLinesForReturn(
  ...args: Parameters<typeof proc.getPurchaseOrderLinesForReturn>
): ReturnType<typeof proc.getPurchaseOrderLinesForReturn> {
  return proc.getPurchaseOrderLinesForReturn(...args);
}

export async function listVendorOptions(
  ...args: Parameters<typeof proc.listVendorOptions>
): ReturnType<typeof proc.listVendorOptions> {
  return proc.listVendorOptions(...args);
}

export async function addPurchaseReturn(
  ...args: Parameters<typeof proc.addPurchaseReturn>
): ReturnType<typeof proc.addPurchaseReturn> {
  return proc.addPurchaseReturn(...args);
}

export async function updatePurchaseReturn(
  ...args: Parameters<typeof proc.updatePurchaseReturn>
): ReturnType<typeof proc.updatePurchaseReturn> {
  return proc.updatePurchaseReturn(...args);
}

export async function approvePurchaseReturn(
  ...args: Parameters<typeof proc.approvePurchaseReturn>
): ReturnType<typeof proc.approvePurchaseReturn> {
  return proc.approvePurchaseReturn(...args);
}

export async function shipPurchaseReturn(
  ...args: Parameters<typeof proc.shipPurchaseReturn>
): ReturnType<typeof proc.shipPurchaseReturn> {
  return proc.shipPurchaseReturn(...args);
}

export async function completePurchaseReturn(
  ...args: Parameters<typeof proc.completePurchaseReturn>
): ReturnType<typeof proc.completePurchaseReturn> {
  return proc.completePurchaseReturn(...args);
}

export async function cancelPurchaseReturn(
  ...args: Parameters<typeof proc.cancelPurchaseReturn>
): ReturnType<typeof proc.cancelPurchaseReturn> {
  return proc.cancelPurchaseReturn(...args);
}

export async function deletePurchaseReturn(
  ...args: Parameters<typeof proc.deletePurchaseReturn>
): ReturnType<typeof proc.deletePurchaseReturn> {
  return proc.deletePurchaseReturn(...args);
}

// ──────────────────────────────────────────────────────────────────────────
// 進階 helper — 退貨原因分佈（給 DonutChart 用）
// ──────────────────────────────────────────────────────────────────────────

/**
 * 撈當前 brand 全部 returns（排除 cancelled），按 return_reason 分組計數 + 加總金額。
 * 注意：型別定義在 .constants.ts，UI / client 要從那邊 import。
 */
export async function getPurchaseReturnReasonBreakdown(): Promise<
  Array<{ reason: string; count: number; amount: number }>
> {
  await requirePermission(PERMISSIONS.PO_VIEW);
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data, error } = await supabase
    .from("purchase_returns")
    .select("return_reason, amount_total, status")
    .eq("brand_id", scope.brand_id)
    .neq("status", "cancelled");

  if (error) throw new Error(`讀取退貨原因分佈失敗：${error.message}`);

  const agg = new Map<string, { count: number; amount: number }>();
  for (const r of data ?? []) {
    const k = r.return_reason as string;
    const cur = agg.get(k) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += Number(r.amount_total ?? 0);
    agg.set(k, cur);
  }

  return Array.from(agg.entries())
    .map(([reason, v]) => ({ reason, count: v.count, amount: v.amount }))
    .sort((a, b) => b.count - a.count);
}
