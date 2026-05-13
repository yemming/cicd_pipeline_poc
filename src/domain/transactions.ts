/**
 * 業務動作 → 會計分錄 統一入口（domain facade）
 *
 * **天條**：UI / business module 任何要產生會計事件的地方，**只透過此檔**呼叫
 * `instantiateTransaction(typeCode, ctx)` — 不要 import engine、不要直接寫 journal_entries。
 *
 * 設計原則：
 * - 每個業務動作（賣零件 / 進貨 / 收款 / 付款⋯）= 一個 transaction_types row + 一個 gl_template
 * - UI 改主檔 coa 不動 code（NetSuite Item-based Accounting 風格）
 * - 業務模組接點只一行：`after(async () => instantiateTransaction('PARTS_PURCHASE', ctx))`
 *
 * 完整 spec 見 docs/proposals/accounting-relations-architecture.md
 */

import "server-only";

import {
  instantiateTransaction as engineInstantiate,
  type InstantiateCtx,
  type InstantiateOptions,
  type InstantiateResult,
} from "@/lib/accounting/instantiate-engine";

// 已 seed 的 transaction_types code（type-safe 入口）。新加 type 時這裡同步補。
export const TX_TYPES = {
  PARTS_PURCHASE: "PARTS_PURCHASE",
  PARTS_RETAIL_SALE: "PARTS_RETAIL_SALE",
  PAYMENT_RECEIPT_BANK: "PAYMENT_RECEIPT_BANK",
  VENDOR_PAYMENT_BANK: "VENDOR_PAYMENT_BANK",
  PARTS_RETURN_TO_SUPPLIER: "PARTS_RETURN_TO_SUPPLIER",
  STOCK_ADJUSTMENT_GAIN: "STOCK_ADJUSTMENT_GAIN",
  STOCK_ADJUSTMENT_LOSS: "STOCK_ADJUSTMENT_LOSS",
} as const;

export type TxTypeCode = (typeof TX_TYPES)[keyof typeof TX_TYPES];

/**
 * 產生業務動作對應的會計分錄（draft 或 posted）
 *
 * @param typeCode  業務動作代碼，建議用 `TX_TYPES.XXX`
 * @param ctx       業務上下文：必填欄位看 transaction_types.required_inputs（也可從 DB UI 看）
 * @param options
 *   - autoPost?: 預設 false（draft）。設 true 直接 posted、過 DB trigger 借貸/period 驗證
 *   - entryDate?: ISO date，預設今天
 *   - description?: 不傳則用 type.name_zh_tw
 *   - userId?: 帶入 created_by / posted_by
 *   - cashFlowSectionOverride?: 同 type 但本筆走不同 CF section 時用（罕見）
 *
 * @example
 *   // 採購進零件（業務 action 結尾）
 *   import { after } from "next/server";
 *   after(async () => {
 *     await instantiateTransaction(TX_TYPES.PARTS_PURCHASE, {
 *       supplier_id, item_id, net_amount: 20000, tax_amount: 1000,
 *       warehouse_id, store_id,
 *     }, { autoPost: true, userId });
 *   });
 */
export async function instantiateTransaction(
  typeCode: TxTypeCode | string,
  ctx: InstantiateCtx,
  options?: InstantiateOptions,
): Promise<InstantiateResult> {
  return engineInstantiate(typeCode, ctx, options);
}

export type { InstantiateCtx, InstantiateOptions, InstantiateResult };
