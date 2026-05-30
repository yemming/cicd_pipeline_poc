"use server";

/**
 * Domain Helper — Customer Receipts（收款單 / AR 沖帳）
 *
 * 沖 ar_invoices 的 AR，含多幣別已實現匯損益：
 *   - 無匯差 → CUSTOMER_RECEIPT（Dr 銀行 / Cr AR）
 *   - 收 func > AR 帳面 func → CUSTOMER_RECEIPT_FX_GAIN（Cr 兌換利益）
 *   - 收 func < AR 帳面 func → CUSTOMER_RECEIPT_FX_LOSS（Dr 兌換損失）
 *
 * 已實現匯損益 = Σ applied × (receipt_rate − invoice_rate)（signed，+ = 利益）。
 * AR 沖帳 line（科目 1180104）需 PART_SKU/WAREHOUSE → 用發票 rep_item/rep_warehouse。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { postDocToGl } from "@/lib/accounting/posting";
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

export type CreateReceiptInput = {
  customer_id: string;
  receipt_date?: string;
  currency?: string;
  exchange_rate?: number;
  amount: number;
  bank_coa_id?: string | null;
  receipt_method?: "bank_transfer" | "cash" | "check";
  notes?: string | null;
};

export async function createReceipt(
  input: CreateReceiptInput,
): Promise<Result<{ id: string; receipt_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有建立收款單的權限" };
  }
  if (!input.customer_id) return { ok: false, error: "缺客戶" };
  if (!(input.amount > 0)) return { ok: false, error: "收款金額需大於 0" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  const recDate = input.receipt_date ?? new Date().toISOString().slice(0, 10);
  const currency = input.currency ?? FUNC_CURRENCY;
  const rate = input.exchange_rate ?? (await getRate(currency, FUNC_CURRENCY, recDate));
  const amount = round2(input.amount);

  const { data: rec, error } = await supabase
    .from("customer_receipts")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      receipt_no: genDocNo("RCP"),
      customer_id: input.customer_id,
      receipt_date: recDate,
      currency,
      exchange_rate: rate,
      amount,
      func_amount: round2(amount * rate),
      bank_coa_id: input.bank_coa_id ?? null,
      receipt_method: input.receipt_method ?? "bank_transfer",
      status: "draft",
      notes: input.notes ?? null,
      created_by: userId ?? null,
    })
    .select("id, receipt_no")
    .single();
  if (error) return { ok: false, error: `建立收款單失敗：${error.message}` };

  revalidatePath("/admin/accounting/receipts");
  return { ok: true, data: { id: rec.id, receipt_no: rec.receipt_no } };
}

export type ApplicationInput = { invoice_id: string; applied_amount: number };

export async function applyAndPost(
  receiptId: string,
  applications: ApplicationInput[],
): Promise<Result<{ entry_no: string; realized_fx_func: number }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有收款沖帳的權限" };
  }
  if (!applications?.length) return { ok: false, error: "至少需要一筆沖帳明細" };

  const supabase = await createClient();
  const { userId } = await getCurrentUserAndAdmin();

  const { data: rec, error: recErr } = await supabase
    .from("customer_receipts")
    .select("id, customer_id, subsidiary_id, receipt_date, exchange_rate, status, gl_posted")
    .eq("id", receiptId)
    .maybeSingle();
  if (recErr) return { ok: false, error: recErr.message };
  if (!rec) return { ok: false, error: "找不到收款單" };
  if (rec.status !== "draft" || rec.gl_posted) {
    return { ok: false, error: `狀態 ${rec.status} 不可沖帳（或已過帳）` };
  }
  const recRate = Number(rec.exchange_rate ?? 1);

  const invIds = applications.map((a) => a.invoice_id);
  const { data: invoices, error: invErr } = await supabase
    .from("ar_invoices")
    .select("id, customer_id, exchange_rate, open_amount, open_func_amount, status, rep_item_id, rep_warehouse_id")
    .in("id", invIds);
  if (invErr) return { ok: false, error: invErr.message };
  const invMap = new Map((invoices ?? []).map((i) => [i.id, i]));

  let funcAr = 0;
  let funcBank = 0;
  let repItemId: string | null = null;
  let repWarehouseId: string | null = null;
  const appRows: Array<{
    invoice_id: string;
    applied_amount: number;
    applied_func_amount: number;
    invoice_exchange_rate: number;
    realized_fx_func: number;
  }> = [];
  const invUpdates: Array<{ id: string; open_amount: number; open_func_amount: number; status: string }> = [];

  for (const app of applications) {
    const inv = invMap.get(app.invoice_id);
    if (!inv) return { ok: false, error: `找不到發票 ${app.invoice_id}` };
    if (inv.customer_id !== rec.customer_id) {
      return { ok: false, error: "收款單與發票的客戶不一致" };
    }
    if (inv.status === "void") return { ok: false, error: "不可沖銷已作廢的發票" };
    const applied = round2(app.applied_amount);
    if (!(applied > 0)) return { ok: false, error: "沖帳金額需大於 0" };
    if (applied > Number(inv.open_amount) + 0.01) {
      return { ok: false, error: `沖帳金額超過發票未沖餘額（${inv.open_amount}）` };
    }
    const invRate = Number(inv.exchange_rate ?? 1);
    const arRelieved = round2(applied * invRate);
    const cashIn = round2(applied * recRate);
    funcAr += arRelieved;
    funcBank += cashIn;
    if (!repItemId) repItemId = inv.rep_item_id;
    if (!repWarehouseId) repWarehouseId = inv.rep_warehouse_id;

    const newOpen = round2(Number(inv.open_amount) - applied);
    appRows.push({
      invoice_id: inv.id,
      applied_amount: applied,
      applied_func_amount: cashIn,
      invoice_exchange_rate: invRate,
      realized_fx_func: round2(applied * (recRate - invRate)),
    });
    invUpdates.push({
      id: inv.id,
      open_amount: newOpen,
      open_func_amount: round2(Number(inv.open_func_amount) - arRelieved),
      status: newOpen <= 0.01 ? "paid" : "partially_paid",
    });
  }

  funcAr = round2(funcAr);
  funcBank = round2(funcBank);
  const totalFx = round2(funcBank - funcAr); // + = 利益（收 func > AR 帳面）
  const funcFx = Math.abs(totalFx);

  let storeId: string | null = null;
  if (rec.subsidiary_id) {
    const { data: org } = await createServiceClient()
      .from("organizations")
      .select("id")
      .eq("subsidiary_id", rec.subsidiary_id)
      .eq("is_active", true)
      .order("level", { ascending: false })
      .limit(1)
      .maybeSingle();
    storeId = org?.id ?? null;
  }

  let typeCode: string;
  let ctx: Record<string, unknown>;
  const baseCtx = {
    customer_id: rec.customer_id,
    subsidiary_id: rec.subsidiary_id,
    store_id: storeId,
    item_id: repItemId,
    warehouse_id: repWarehouseId,
    bank_id: "BANK-MAIN",
  };
  if (funcFx < 0.01) {
    typeCode = TX_TYPES.CUSTOMER_RECEIPT;
    ctx = { ...baseCtx, func_amount: funcBank };
  } else if (totalFx > 0) {
    typeCode = TX_TYPES.CUSTOMER_RECEIPT_FX_GAIN;
    ctx = { ...baseCtx, func_bank: funcBank, func_ar: funcAr, func_fx: funcFx };
  } else {
    typeCode = TX_TYPES.CUSTOMER_RECEIPT_FX_LOSS;
    ctx = { ...baseCtx, func_bank: funcBank, func_ar: funcAr, func_fx: funcFx };
  }

  const r = await postDocToGl({
    table: "customer_receipts",
    docId: receiptId,
    typeCode,
    ctx,
    entryDate: rec.receipt_date,
    userId: userId ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  const scope = await getActiveScope();
  const { error: appErr } = await supabase.from("receipt_applications").insert(
    appRows.map((a) => ({ ...a, brand_id: scope.brand_id, receipt_id: receiptId, created_by: userId ?? null })),
  );
  if (appErr) {
    return { ok: false, error: `GL 已過帳(${r.entryNo})但寫沖帳明細失敗：${appErr.message}（請人工補）` };
  }
  for (const u of invUpdates) {
    await supabase
      .from("ar_invoices")
      .update({ open_amount: u.open_amount, open_func_amount: u.open_func_amount, status: u.status })
      .eq("id", u.id);
  }
  await supabase
    .from("customer_receipts")
    .update({ status: "posted", realized_fx_func: totalFx })
    .eq("id", receiptId);

  revalidatePath("/admin/accounting/receipts");
  revalidatePath("/admin/accounting/ar-invoices");
  return { ok: true, data: { entry_no: r.entryNo, realized_fx_func: totalFx } };
}
