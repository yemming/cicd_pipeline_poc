/**
 * 非 async 的常數/型別，拆出來給 agency-fulfillment.ts（"use server" 檔）import。
 * Next.js 16 "use server" 檔只允許 export async function，const/type 都要拆出去。
 */

export const AGENCY_INTERNAL_SUPPLIER_CODE = "AGENCY-INTERNAL";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type DealerStockMatch = {
  orgId: string;
  orgName: string;
  warehouseId: string;
  warehouseName: string;
  qtyAvailable: number;
};

export type FulfillmentOutcome = {
  itemId: string;
  outcome: "own_stock_sufficient" | "buyback_created" | "backordered";
  buybackPoId?: string;
  buybackPoNo?: string;
  sourceDealerOrgId?: string;
};
