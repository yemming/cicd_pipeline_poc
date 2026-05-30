"use server";

/**
 * Domain Helper — AR Invoices（應收發票 / AR 子帳，零件賒帳）
 *
 *   postArInvoice → AR_INVOICE：Dr 應收帳款-零件(1180104) / Cr 銷貨收入 / Cr 銷項稅
 *   只認收入不認 COGS（COGS 由領料 COGS_ON_ISSUE 過）。
 *
 * 金額慣例：單據存交易幣別 + func(TWD) 快照；GL 永遠過 func。天條：UI 只 import 此檔。
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
const round2 = (n: number) => Math.round(n * 100) / 100;

function genDocNo(prefix: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const datePart = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `${prefix}-${datePart}-${rand}`;
}

/** 解析該法人下一個 store（service client、避免 RLS 邊界）。 */
async function resolveSubsidiaryStore(subsidiaryId: string | null): Promise<string | null> {
  if (!subsidiaryId) return null;
  const { data } = await createServiceClient()
    .from("organizations")
    .select("id")
    .eq("subsidiary_id", subsidiaryId)
    .eq("is_active", true)
    .order("level", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** 解析該 brand 的「零配件部」(code=PRT) — 收入科目 4100201 需 DEPT 維度。 */
async function resolvePartsDept(brandId: string): Promise<string | null> {
  const { data } = await createServiceClient()
    .from("departments")
    .select("id")
    .eq("brand_id", brandId)
    .eq("code", "PRT")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** 解析該 brand 一個啟用倉（rep_warehouse 缺時 fallback；AR/收入科目需 WAREHOUSE）。 */
async function resolveDefaultWarehouse(brandId: string): Promise<string | null> {
  const { data } = await createServiceClient()
    .from("warehouses")
    .select("id")
    .eq("brand_id", brandId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export type ArInvoiceLineInput = {
  item_id: string;
  description?: string | null;
  qty?: number;
  unit_price?: number;
  line_amount?: number;
  tax_code_id?: string | null;
  tax_amount?: number;
  warehouse_id?: string | null;
  source_module?: string | null;
  source_doc_line_id?: string | null;
};

export type CreateArInvoiceInput = {
  customer_id: string;
  invoice_date?: string;
  currency?: string;
  exchange_rate?: number;
  source_module?: string | null;
  source_doc_id?: string | null;
  einvoice_id?: string | null;
  notes?: string | null;
  lines: ArInvoiceLineInput[];
};

export async function createArInvoice(
  input: CreateArInvoiceInput,
): Promise<Result<{ id: string; invoice_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有建立應收發票的權限" };
  }
  if (!input.customer_id) return { ok: false, error: "缺客戶" };
  if (!input.lines?.length) return { ok: false, error: "至少需要一筆明細" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  const { data: customer, error: cErr } = await supabase
    .from("customers")
    .select("id, payment_terms_days, subsidiary_id")
    .eq("id", input.customer_id)
    .maybeSingle();
  if (cErr) return { ok: false, error: cErr.message };
  if (!customer) return { ok: false, error: "找不到客戶" };

  const invDate = input.invoice_date ?? new Date().toISOString().slice(0, 10);
  const currency = input.currency ?? FUNC_CURRENCY;
  const rate = input.exchange_rate ?? (await getRate(currency, FUNC_CURRENCY, invDate));

  let dueDate: string | null = null;
  if (typeof customer.payment_terms_days === "number") {
    const due = new Date(invDate);
    due.setDate(due.getDate() + customer.payment_terms_days);
    dueDate = due.toISOString().slice(0, 10);
  }

  const lines = input.lines.map((l, idx) => {
    const lineAmount =
      typeof l.line_amount === "number"
        ? round2(l.line_amount)
        : round2((l.qty ?? 0) * (l.unit_price ?? 0));
    return {
      line_no: idx + 1,
      item_id: l.item_id,
      description: l.description ?? null,
      qty: l.qty ?? 0,
      unit_price: l.unit_price ?? 0,
      line_amount: lineAmount,
      tax_code_id: l.tax_code_id ?? null,
      tax_amount: round2(l.tax_amount ?? 0),
      warehouse_id: l.warehouse_id ?? null,
      source_module: l.source_module ?? null,
      source_doc_line_id: l.source_doc_line_id ?? null,
    };
  });

  const amountPretax = round2(lines.reduce((s, l) => s + l.line_amount, 0));
  const amountTax = round2(lines.reduce((s, l) => s + l.tax_amount, 0));
  const amountTotal = round2(amountPretax + amountTax);
  const first = lines[0];

  const invoiceNo = genDocNo("ARV");
  const { data: inv, error: invErr } = await supabase
    .from("ar_invoices")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: customer.subsidiary_id ?? scope.subsidiary_id,
      invoice_no: invoiceNo,
      customer_id: input.customer_id,
      invoice_date: invDate,
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
      source_module: input.source_module ?? null,
      source_doc_id: input.source_doc_id ?? null,
      einvoice_id: input.einvoice_id ?? null,
      rep_item_id: first.item_id,
      rep_warehouse_id: first.warehouse_id,
      created_by: userId ?? null,
    })
    .select("id, invoice_no")
    .single();
  if (invErr) return { ok: false, error: `建立應收發票失敗：${invErr.message}` };

  const { error: linesErr } = await supabase
    .from("ar_invoice_lines")
    .insert(lines.map((l) => ({ ...l, brand_id: scope.brand_id, invoice_id: inv.id })));
  if (linesErr) {
    await supabase.from("ar_invoices").delete().eq("id", inv.id);
    return { ok: false, error: `建立發票明細失敗：${linesErr.message}` };
  }

  revalidatePath("/admin/accounting/ar-invoices");
  return { ok: true, data: { id: inv.id, invoice_no: inv.invoice_no } };
}

/** 過帳 AR_INVOICE（Dr AR 1180104 / Cr 收入 / Cr 銷項稅）。 */
export async function postArInvoice(id: string): Promise<Result<{ entry_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有過帳應收發票的權限" };
  }
  const supabase = await createClient();
  const { userId } = await getCurrentUserAndAdmin();

  const { data: inv, error } = await supabase
    .from("ar_invoices")
    .select(
      "id, customer_id, subsidiary_id, brand_id, invoice_date, status, gl_posted, func_amount_pretax, func_amount_tax, rep_item_id, rep_warehouse_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!inv) return { ok: false, error: "找不到應收發票" };
  if (inv.status !== "draft" || inv.gl_posted) {
    return { ok: false, error: `狀態 ${inv.status} 不可過帳（或已過帳）` };
  }

  const storeId = await resolveSubsidiaryStore(inv.subsidiary_id);
  const deptId = await resolvePartsDept(inv.brand_id);
  const warehouseId = inv.rep_warehouse_id ?? (await resolveDefaultWarehouse(inv.brand_id));

  const r = await postDocToGl({
    table: "ar_invoices",
    docId: id,
    typeCode: TX_TYPES.AR_INVOICE,
    ctx: {
      customer_id: inv.customer_id,
      item_id: inv.rep_item_id,
      subsidiary_id: inv.subsidiary_id,
      store_id: storeId,
      dept_id: deptId,
      brand_id: inv.brand_id,
      warehouse_id: warehouseId,
      func_net: Number(inv.func_amount_pretax ?? 0),
      func_tax: Number(inv.func_amount_tax ?? 0),
    },
    entryDate: inv.invoice_date,
    userId: userId ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  await supabase.from("ar_invoices").update({ status: "posted" }).eq("id", id);

  revalidatePath("/admin/accounting/ar-invoices");
  revalidatePath(`/admin/accounting/ar-invoices/${id}`);
  return { ok: true, data: { entry_no: r.entryNo } };
}

/** 作廢：無收款沖帳才可作廢；沖銷 GL。 */
export async function voidArInvoice(id: string): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有作廢應收發票的權限" };
  }
  const supabase = await createClient();
  const { userId } = await getCurrentUserAndAdmin();

  const { data: inv, error } = await supabase
    .from("ar_invoices")
    .select("id, status, gl_posted")
    .eq("id", id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!inv) return { ok: false, error: "找不到應收發票" };
  if (inv.status === "void") return { ok: false, error: "此發票已作廢" };

  const { count } = await supabase
    .from("receipt_applications")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", id);
  if ((count ?? 0) > 0) {
    return { ok: false, error: "此發票已有收款沖帳，請先沖銷收款再作廢" };
  }

  if (inv.gl_posted) {
    const rev = await reverseDocGl({ table: "ar_invoices", docId: id, userId: userId ?? undefined });
    if (!rev.ok) return { ok: false, error: rev.error };
  }
  await supabase.from("ar_invoices").update({ status: "void" }).eq("id", id);

  revalidatePath("/admin/accounting/ar-invoices");
  return { ok: true, data: { id } };
}
