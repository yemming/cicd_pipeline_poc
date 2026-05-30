"use server";

/**
 * Domain Helper — Vendor Bills（廠商發票 / AP 子帳）
 *
 * GR/IR 模型：進貨(GRN) 已 Dr 存貨 / Cr GR/IR；廠商發票到時清 GR/IR、認進項稅、轉正式 AP。
 *   postVendorBill → VENDOR_BILL：Dr GR/IR + Dr 進項稅 / Cr 應付帳款
 *
 * 金額慣例：單據存「交易幣別」+ func(本位幣 TWD) 快照；GL 永遠過 func。
 * 天條：UI 只 import 此檔，不直接碰 supabase。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { postDocToGl, reverseDocGl } from "@/lib/accounting/posting";
import { TX_TYPES } from "@/domain/transactions";

import { getRate } from "./exchange-rates";

export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const FUNC_CURRENCY = "TWD";

export type VendorBillLineInput = {
  line_type?: "inventory" | "expense";
  item_id?: string | null;
  description?: string | null;
  qty?: number;
  unit_cost?: number;
  /** 未稅金額；不傳則 qty × unit_cost */
  line_amount?: number;
  tax_code_id?: string | null;
  tax_amount?: number;
  gl_account_coa_id?: string | null;
  po_id?: string | null;
  po_line_id?: string | null;
  stock_receipt_line_id?: string | null;
  matched_qty?: number;
  match_status?: "unmatched" | "matched" | "over" | "under";
};

export type CreateVendorBillInput = {
  vendor_id: string;
  vendor_invoice_no?: string | null;
  bill_date?: string;
  currency?: string;
  /** 不傳則查 exchange_rates（currency→TWD @ bill_date） */
  exchange_rate?: number;
  source_doc_type?: string | null;
  source_doc_id?: string | null;
  notes?: string | null;
  lines: VendorBillLineInput[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 解析該法人下的一個 store（給需要 STORE 維度但無 warehouse 鏈的 AP 單據用）。
 *  唯讀內部維度解析，走 service client 避免 RLS 邊界（與 engine 一致）。 */
async function resolveSubsidiaryStore(
  subsidiaryId: string | null,
): Promise<string | null> {
  if (!subsidiaryId) return null;
  const svc = createServiceClient();
  const { data } = await svc
    .from("organizations")
    .select("id")
    .eq("subsidiary_id", subsidiaryId)
    .eq("is_active", true)
    .order("level", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

function genDocNo(prefix: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const datePart = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = String(Math.floor(Math.random() * 900) + 100); // 3 碼，建立時序內唯一性靠 UNIQUE 擋
  return `${prefix}-${datePart}-${rand}`;
}

export async function createVendorBill(
  input: CreateVendorBillInput,
): Promise<Result<{ id: string; bill_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有建立廠商發票的權限" };
  }
  if (!input.vendor_id) return { ok: false, error: "缺供應商" };
  if (!input.lines?.length) return { ok: false, error: "至少需要一筆明細" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  const { data: supplier, error: supErr } = await supabase
    .from("suppliers")
    .select("id, default_currency, payment_terms_days, subsidiary_id")
    .eq("id", input.vendor_id)
    .maybeSingle();
  if (supErr) return { ok: false, error: supErr.message };
  if (!supplier) return { ok: false, error: "找不到供應商" };

  const billDate = input.bill_date ?? new Date().toISOString().slice(0, 10);
  const currency = input.currency ?? supplier.default_currency ?? FUNC_CURRENCY;
  const rate =
    input.exchange_rate ?? (await getRate(currency, FUNC_CURRENCY, billDate));

  let dueDate: string | null = null;
  if (typeof supplier.payment_terms_days === "number") {
    const due = new Date(billDate);
    due.setDate(due.getDate() + supplier.payment_terms_days);
    dueDate = due.toISOString().slice(0, 10);
  }

  const lines = input.lines.map((l, idx) => {
    const lineAmount =
      typeof l.line_amount === "number"
        ? round2(l.line_amount)
        : round2((l.qty ?? 0) * (l.unit_cost ?? 0));
    return {
      line_no: idx + 1,
      line_type: l.line_type ?? "inventory",
      item_id: l.item_id ?? null,
      description: l.description ?? null,
      qty: l.qty ?? 0,
      unit_cost: l.unit_cost ?? 0,
      line_amount: lineAmount,
      tax_code_id: l.tax_code_id ?? null,
      tax_amount: round2(l.tax_amount ?? 0),
      gl_account_coa_id: l.gl_account_coa_id ?? null,
      po_id: l.po_id ?? null,
      po_line_id: l.po_line_id ?? null,
      stock_receipt_line_id: l.stock_receipt_line_id ?? null,
      matched_qty: l.matched_qty ?? 0,
      match_status: l.match_status ?? "unmatched",
    };
  });

  const amountPretax = round2(lines.reduce((s, l) => s + l.line_amount, 0));
  const amountTax = round2(lines.reduce((s, l) => s + l.tax_amount, 0));
  const amountTotal = round2(amountPretax + amountTax);

  const billNo = genDocNo("VB");
  const { data: bill, error: billErr } = await supabase
    .from("vendor_bills")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: supplier.subsidiary_id ?? scope.subsidiary_id,
      bill_no: billNo,
      vendor_invoice_no: input.vendor_invoice_no ?? null,
      vendor_id: input.vendor_id,
      bill_date: billDate,
      due_date: dueDate,
      currency,
      exchange_rate: rate,
      amount_pretax: amountPretax,
      amount_tax: amountTax,
      amount_total: amountTotal,
      func_amount_pretax: round2(amountPretax * rate),
      func_amount_tax: round2(amountTax * rate),
      func_amount_total: round2(amountTotal * rate),
      open_amount: amountTotal,
      open_func_amount: round2(amountTotal * rate),
      status: "draft",
      source_doc_type: input.source_doc_type ?? null,
      source_doc_id: input.source_doc_id ?? null,
      notes: input.notes ?? null,
      created_by: userId ?? null,
    })
    .select("id, bill_no")
    .single();
  if (billErr) return { ok: false, error: `建立廠商發票失敗：${billErr.message}` };

  const { error: linesErr } = await supabase
    .from("vendor_bill_lines")
    .insert(lines.map((l) => ({ ...l, brand_id: scope.brand_id, bill_id: bill.id })));
  if (linesErr) {
    await supabase.from("vendor_bills").delete().eq("id", bill.id);
    return { ok: false, error: `建立發票明細失敗：${linesErr.message}` };
  }

  revalidatePath("/admin/accounting/vendor-bills");
  return { ok: true, data: { id: bill.id, bill_no: bill.bill_no } };
}

/** 過帳：VENDOR_BILL（Dr GR/IR + Dr 進項稅 / Cr AP）。func 金額由單據快照取。 */
export async function postVendorBill(id: string): Promise<Result<{ entry_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有過帳廠商發票的權限" };
  }
  const supabase = await createClient();
  const { userId } = await getCurrentUserAndAdmin();

  const { data: bill, error } = await supabase
    .from("vendor_bills")
    .select(
      "id, vendor_id, subsidiary_id, bill_date, status, gl_posted, func_amount_pretax, func_amount_tax",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!bill) return { ok: false, error: "找不到廠商發票" };
  if (bill.status !== "draft" || bill.gl_posted) {
    return { ok: false, error: `狀態 ${bill.status} 不可過帳（或已過帳）` };
  }

  // AP / 進項稅 科目要求 STORE 維度；解析該法人下的一個 store（無 warehouse 鏈可補時用）
  const storeId = await resolveSubsidiaryStore(bill.subsidiary_id);

  const r = await postDocToGl({
    table: "vendor_bills",
    docId: id,
    typeCode: TX_TYPES.VENDOR_BILL,
    ctx: {
      supplier_id: bill.vendor_id,
      subsidiary_id: bill.subsidiary_id,
      store_id: storeId,
      func_goods: Number(bill.func_amount_pretax ?? 0),
      func_tax: Number(bill.func_amount_tax ?? 0),
    },
    entryDate: bill.bill_date,
    userId: userId ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  await supabase.from("vendor_bills").update({ status: "posted" }).eq("id", id);

  revalidatePath("/admin/accounting/vendor-bills");
  revalidatePath(`/admin/accounting/vendor-bills/${id}`);
  return { ok: true, data: { entry_no: r.entryNo } };
}

/** 作廢：尚未付款（無 applications）才能作廢；沖銷 GL 分錄。 */
export async function voidVendorBill(id: string): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有作廢廠商發票的權限" };
  }
  const supabase = await createClient();
  const { userId } = await getCurrentUserAndAdmin();

  const { data: bill, error } = await supabase
    .from("vendor_bills")
    .select("id, status, gl_posted")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!bill) return { ok: false, error: "找不到廠商發票" };
  if (bill.status === "void") return { ok: false, error: "此發票已作廢" };

  const { count } = await supabase
    .from("payment_applications")
    .select("id", { count: "exact", head: true })
    .eq("bill_id", id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "此發票已有付款沖帳，請先沖銷付款再作廢" };
  }

  if (bill.gl_posted) {
    const rev = await reverseDocGl({ table: "vendor_bills", docId: id, userId: userId ?? undefined });
    if (!rev.ok) return { ok: false, error: rev.error };
  }
  await supabase.from("vendor_bills").update({ status: "void" }).eq("id", id);

  revalidatePath("/admin/accounting/vendor-bills");
  return { ok: true, data: { id } };
}

/**
 * 便利：從一張進貨單(GRN) 帶出廠商發票草稿（3-way match 連結自動填）。
 * 假設帳單金額 = 進貨金額（PPV 下一輪），稅率 5%。
 */
export async function createBillFromReceipt(
  stockReceiptId: string,
): Promise<Result<{ id: string; bill_no: string }>> {
  const supabase = await createClient();

  const { data: gr, error: grErr } = await supabase
    .from("stock_receipts")
    .select("id, vendor_id, source_doc_id, source_doc_type")
    .eq("id", stockReceiptId)
    .maybeSingle();
  if (grErr) return { ok: false, error: grErr.message };
  if (!gr) return { ok: false, error: "找不到進貨單" };
  if (!gr.vendor_id) return { ok: false, error: "此進貨單無供應商" };

  // PO 幣別 / 匯率（GRN 沒存幣別，沿用來源 PO）
  let currency = FUNC_CURRENCY;
  let rate = 1;
  let poId: string | null = null;
  if (gr.source_doc_type === "purchase_order" && gr.source_doc_id) {
    poId = gr.source_doc_id;
    const { data: po } = await supabase
      .from("purchase_orders")
      .select("currency, exchange_rate")
      .eq("id", gr.source_doc_id)
      .maybeSingle();
    if (po?.currency) currency = po.currency;
    if (po?.exchange_rate) rate = Number(po.exchange_rate);
  }

  const { data: grLines, error: lineErr } = await supabase
    .from("stock_receipt_lines")
    .select("id, item_id, qty_received, unit_cost, line_amount, source_line_id, source_line_type")
    .eq("gr_id", stockReceiptId)
    .order("line_no");
  if (lineErr) return { ok: false, error: lineErr.message };
  if (!grLines?.length) return { ok: false, error: "此進貨單無明細" };

  const lines: VendorBillLineInput[] = grLines.map((l) => {
    const lineAmount = round2(Number(l.line_amount ?? 0));
    return {
      line_type: "inventory",
      item_id: l.item_id,
      qty: Number(l.qty_received ?? 0),
      unit_cost: Number(l.unit_cost ?? 0),
      line_amount: lineAmount,
      tax_amount: round2(lineAmount * 0.05),
      po_id: poId,
      po_line_id: l.source_line_type === "po_line" ? l.source_line_id : null,
      stock_receipt_line_id: l.id,
      matched_qty: Number(l.qty_received ?? 0),
      match_status: "matched",
    };
  });

  return createVendorBill({
    vendor_id: gr.vendor_id,
    currency,
    exchange_rate: rate,
    source_doc_type: "stock_receipt",
    source_doc_id: stockReceiptId,
    lines,
  });
}
