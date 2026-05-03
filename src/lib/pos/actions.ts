"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { issueInvoice, type InvoiceCarrierType } from "./ecpay-invoice";
import type { PaymentMethod, Product, ProductCategory } from "./types";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
type SaleLine = {
  productId: string;
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
};

type InvoiceType = "personal" | "carrier" | "taxid";

type CompleteSaleInput = {
  lines: SaleLine[];
  totalAmount: number;
  paymentMethod: PaymentMethod;
  cashReceived?: number;
  invoiceType: InvoiceType;
  carrierCode?: string;
  taxId?: string;
};

export type CompleteSaleResult = {
  txId: string;
  invoiceNo?: string;
  invoiceDate?: string;
  randomNumber?: string;
  ecpayStatus: "issued" | "failed" | "pending";
  ecpayError?: string;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function genMerchantTradeNo(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `TX${ymd}${rand}`;
}

function genRelateNumber(): string {
  // ECPay RelateNumber: alphanumeric only, unique
  const ts   = Math.floor(Date.now() / 1000);
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV${ts}${rand}`;
}

// ─────────────────────────────────────────────────────────────
// completeSale — 主要 server action
// ─────────────────────────────────────────────────────────────
export async function completeSale(input: CompleteSaleInput): Promise<CompleteSaleResult> {
  const db = createServiceClient();

  // 取得當前登入使用者（可選，失敗不阻斷流程）
  let staffName = "Staff";
  let staffId: string | null = null;
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (user) {
      staffName = user.email ?? user.id;
      staffId   = user.id;
    }
  } catch { /* ignore */ }

  const merchantTradeNo = genMerchantTradeNo();

  // 1. 建立交易主表
  const { data: tx, error: txErr } = await db
    .from("pos_transactions")
    .insert({
      merchant_trade_no: merchantTradeNo,
      total_amount:      input.totalAmount,
      payment_method:    input.paymentMethod,
      cash_received:     input.cashReceived ?? null,
      change_amount:     input.cashReceived != null
        ? input.cashReceived - input.totalAmount
        : null,
      staff_id:          staffId,
      staff_name:        staffName,
      invoice_type:      input.invoiceType,
      carrier_code:      input.carrierCode ?? null,
      tax_id:            input.taxId ?? null,
      ecpay_status:      "pending",
    })
    .select("id")
    .single();

  if (txErr || !tx) {
    throw new Error(`建立交易失敗：${txErr?.message ?? "unknown"}`);
  }

  // 2. 建立交易明細
  await db.from("pos_transaction_lines").insert(
    input.lines.map((l) => ({
      transaction_id: tx.id,
      product_id:     l.productId,
      product_sku:    l.sku,
      product_name:   l.name,
      qty:            l.qty,
      unit_price:     l.unitPrice,
      subtotal:       l.qty * l.unitPrice,
    })),
  );

  // 3. 扣減庫存（服務類 stock_qty=999 自動跳過）
  for (const l of input.lines) {
    await db.rpc("pos_decrement_stock", {
      p_product_id: l.productId,
      p_qty:        l.qty,
    });
  }

  // 4. 寫日記帳
  await db.from("pos_ledger_entries").insert({
    date:           new Date().toISOString().split("T")[0],
    type:           "income",
    category:       "POS 銷售",
    amount:         input.totalAmount,
    payment_method: input.paymentMethod,
    description:    `POS ${merchantTradeNo}（${input.lines.map((l) => l.name).slice(0, 3).join("、")}${input.lines.length > 3 ? "…" : ""}）`,
    ref_id:         tx.id,
    created_by:     staffId,
  });

  // 5. 呼叫 ECPay 開立 B2C 電子發票
  const carrierType: InvoiceCarrierType =
    input.invoiceType === "carrier" ? "3" : "";

  const invoiceResult = await issueInvoice({
    relateNumber:       genRelateNumber(),
    totalAmount:        input.totalAmount,
    items:              input.lines.map((l) => ({
      name:      l.name,
      qty:       l.qty,
      unitPrice: l.unitPrice,
      amount:    l.qty * l.unitPrice,
    })),
    carrierType,
    carrierNum:         input.invoiceType === "carrier" ? input.carrierCode : undefined,
    customerIdentifier: input.invoiceType === "taxid"   ? input.taxId       : undefined,
  });

  const ecpayStatus = invoiceResult.success ? "issued" : "failed";

  // 6. 把發票結果回寫進交易紀錄
  await db.from("pos_transactions").update({
    ecpay_invoice_no:    invoiceResult.success ? invoiceResult.invoiceNo    : null,
    ecpay_invoice_date:  invoiceResult.success ? invoiceResult.invoiceDate  : null,
    ecpay_random_number: invoiceResult.success ? invoiceResult.randomNumber : null,
    ecpay_status:        ecpayStatus,
  }).eq("id", tx.id);

  revalidatePath("/pos/ledger");

  // 格式化回傳給前端的 txId（顯示用）
  const txId = `TX-${merchantTradeNo.slice(2, 10)}-${merchantTradeNo.slice(10)}`;

  if (invoiceResult.success) {
    return {
      txId,
      invoiceNo:    invoiceResult.invoiceNo,
      invoiceDate:  invoiceResult.invoiceDate,
      randomNumber: invoiceResult.randomNumber,
      ecpayStatus:  "issued",
    };
  }
  return {
    txId,
    ecpayStatus:  "failed",
    ecpayError:   invoiceResult.error,
  };
}

// ─────────────────────────────────────────────────────────────
// getProducts — 供 Server Component 直接呼叫
// ─────────────────────────────────────────────────────────────
export async function getProducts(): Promise<Product[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("pos_products")
    .select("id, sku, name, category, unit_price, stock_qty, low_stock_at, barcode")
    .eq("is_active", true)
    .order("category")
    .order("name");

  if (error) throw new Error(`載入商品失敗：${error.message}`);
  if (!data || data.length === 0) return [];

  return data.map((r) => ({
    id:          r.id as string,
    sku:         r.sku as string,
    name:        r.name as string,
    category:    r.category as ProductCategory,
    unitPrice:   r.unit_price as number,
    stockQty:    r.stock_qty as number,
    lowStockAt:  r.low_stock_at as number,
    barcode:     (r.barcode as string) ?? undefined,
  }));
}
