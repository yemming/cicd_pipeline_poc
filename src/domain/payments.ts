"use server";

/**
 * Domain Helper — Payments（付款單 / AP 沖帳）
 *
 * 沖 vendor_bills 的 AP，含多幣別已實現匯損益：
 *   - 無匯差 → BILL_PAYMENT（Dr AP / Cr 銀行）
 *   - AP 帳面 func > 實付 func → BILL_PAYMENT_FX_GAIN（Cr 兌換利益）
 *   - AP 帳面 func < 實付 func → BILL_PAYMENT_FX_LOSS（Dr 兌換損失）
 *
 * 已實現匯損益 = Σ applied_amount × (bill_rate − pay_rate)（signed，+ = 利益）。
 * 天條：UI 只 import 此檔。
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

export type CreatePaymentInput = {
  vendor_id: string;
  payment_date?: string;
  currency?: string;
  exchange_rate?: number;
  amount: number;
  bank_coa_id?: string | null;
  payment_method?: "bank_transfer" | "cash" | "check";
  notes?: string | null;
};

export async function createPayment(
  input: CreatePaymentInput,
): Promise<Result<{ id: string; payment_no: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有建立付款單的權限" };
  }
  if (!input.vendor_id) return { ok: false, error: "缺供應商" };
  if (!(input.amount > 0)) return { ok: false, error: "付款金額需大於 0" };

  const supabase = await createClient();
  const scope = await getActiveScope();
  const { userId } = await getCurrentUserAndAdmin();

  const payDate = input.payment_date ?? new Date().toISOString().slice(0, 10);
  const currency = input.currency ?? FUNC_CURRENCY;
  const rate = input.exchange_rate ?? (await getRate(currency, FUNC_CURRENCY, payDate));
  const amount = round2(input.amount);

  const { data: pay, error } = await supabase
    .from("payments")
    .insert({
      brand_id: scope.brand_id,
      subsidiary_id: scope.subsidiary_id,
      payment_no: genDocNo("PAY"),
      vendor_id: input.vendor_id,
      payment_date: payDate,
      currency,
      exchange_rate: rate,
      amount,
      func_amount: round2(amount * rate),
      bank_coa_id: input.bank_coa_id ?? null,
      payment_method: input.payment_method ?? "bank_transfer",
      status: "draft",
      notes: input.notes ?? null,
      created_by: userId ?? null,
    })
    .select("id, payment_no")
    .single();
  if (error) return { ok: false, error: `建立付款單失敗：${error.message}` };

  revalidatePath("/admin/accounting/payments");
  return { ok: true, data: { id: pay.id, payment_no: pay.payment_no } };
}

export type ApplicationInput = { bill_id: string; applied_amount: number };

/**
 * 沖帳 + 過帳。先算匯損益、過 GL（risky，失敗就不動單據），成功後才寫 applications / 更新 bill / 標 posted。
 */
export async function applyAndPost(
  paymentId: string,
  applications: ApplicationInput[],
): Promise<Result<{ entry_no: string; realized_fx_func: number }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有付款沖帳的權限" };
  }
  if (!applications?.length) return { ok: false, error: "至少需要一筆沖帳明細" };

  const supabase = await createClient();
  const { userId } = await getCurrentUserAndAdmin();

  const { data: pay, error: payErr } = await supabase
    .from("payments")
    .select("id, vendor_id, subsidiary_id, payment_date, exchange_rate, status, gl_posted")
    .eq("id", paymentId)
    .maybeSingle();
  if (payErr) return { ok: false, error: payErr.message };
  if (!pay) return { ok: false, error: "找不到付款單" };
  if (pay.status !== "draft" || pay.gl_posted) {
    return { ok: false, error: `狀態 ${pay.status} 不可沖帳（或已過帳）` };
  }
  const payRate = Number(pay.exchange_rate ?? 1);

  // 撈所有要沖的 bill
  const billIds = applications.map((a) => a.bill_id);
  const { data: bills, error: billErr } = await supabase
    .from("vendor_bills")
    .select("id, vendor_id, exchange_rate, open_amount, open_func_amount, status")
    .in("id", billIds);
  if (billErr) return { ok: false, error: billErr.message };
  const billMap = new Map((bills ?? []).map((b) => [b.id, b]));

  let funcAp = 0; // AP 帳面 func 釋放
  let funcBank = 0; // 實付 func
  const appRows: Array<{
    bill_id: string;
    applied_amount: number;
    applied_func_amount: number;
    bill_exchange_rate: number;
    realized_fx_func: number;
  }> = [];
  const billUpdates: Array<{ id: string; open_amount: number; open_func_amount: number; status: string }> = [];

  for (const app of applications) {
    const bill = billMap.get(app.bill_id);
    if (!bill) return { ok: false, error: `找不到發票 ${app.bill_id}` };
    if (bill.vendor_id !== pay.vendor_id) {
      return { ok: false, error: "付款單與發票的供應商不一致" };
    }
    if (bill.status === "void") return { ok: false, error: "不可沖銷已作廢的發票" };
    const applied = round2(app.applied_amount);
    if (!(applied > 0)) return { ok: false, error: "沖帳金額需大於 0" };
    if (applied > Number(bill.open_amount) + 0.01) {
      return { ok: false, error: `沖帳金額超過發票未沖餘額（${bill.open_amount}）` };
    }
    const billRate = Number(bill.exchange_rate ?? 1);
    const apRelieved = round2(applied * billRate);
    const cashOut = round2(applied * payRate);
    funcAp += apRelieved;
    funcBank += cashOut;

    const newOpen = round2(Number(bill.open_amount) - applied);
    const newOpenFunc = round2(Number(bill.open_func_amount) - apRelieved);
    appRows.push({
      bill_id: bill.id,
      applied_amount: applied,
      applied_func_amount: cashOut,
      bill_exchange_rate: billRate,
      realized_fx_func: round2(applied * (billRate - payRate)),
    });
    billUpdates.push({
      id: bill.id,
      open_amount: newOpen,
      open_func_amount: newOpenFunc,
      status: newOpen <= 0.01 ? "paid" : "partially_paid",
    });
  }

  funcAp = round2(funcAp);
  funcBank = round2(funcBank);
  const totalFx = round2(funcAp - funcBank); // + = 利益（帳面 > 實付）
  const funcFx = Math.abs(totalFx);

  // AP / 銀行 / 匯損益 科目要求 STORE 維度；解析該法人下的一個 store
  let storeId: string | null = null;
  if (pay.subsidiary_id) {
    const svc = createServiceClient();
    const { data: org } = await svc
      .from("organizations")
      .select("id")
      .eq("subsidiary_id", pay.subsidiary_id)
      .eq("is_active", true)
      .order("level", { ascending: false })
      .limit(1)
      .maybeSingle();
    storeId = org?.id ?? null;
  }

  // 選 transaction_type + ctx
  let typeCode: string;
  let ctx: Record<string, unknown>;
  const baseCtx = {
    supplier_id: pay.vendor_id,
    subsidiary_id: pay.subsidiary_id,
    store_id: storeId,
    bank_id: "BANK-MAIN",
  };
  if (funcFx < 0.01) {
    typeCode = TX_TYPES.BILL_PAYMENT;
    ctx = { ...baseCtx, func_amount: funcBank };
  } else if (totalFx > 0) {
    typeCode = TX_TYPES.BILL_PAYMENT_FX_GAIN;
    ctx = { ...baseCtx, func_ap: funcAp, func_bank: funcBank, func_fx: funcFx };
  } else {
    typeCode = TX_TYPES.BILL_PAYMENT_FX_LOSS;
    ctx = { ...baseCtx, func_ap: funcAp, func_bank: funcBank, func_fx: funcFx };
  }

  const r = await postDocToGl({
    table: "payments",
    docId: paymentId,
    typeCode,
    ctx,
    entryDate: pay.payment_date,
    userId: userId ?? undefined,
  });
  if (!r.ok) return { ok: false, error: r.error };

  // GL 成功 → 寫 applications + 更新 bills + payment
  const scope = await getActiveScope();
  const { error: appErr } = await supabase.from("payment_applications").insert(
    appRows.map((a) => ({ ...a, brand_id: scope.brand_id, payment_id: paymentId, created_by: userId ?? null })),
  );
  if (appErr) {
    return {
      ok: false,
      error: `GL 已過帳(${r.entryNo})但寫沖帳明細失敗：${appErr.message}（請人工補）`,
    };
  }
  for (const u of billUpdates) {
    await supabase
      .from("vendor_bills")
      .update({ open_amount: u.open_amount, open_func_amount: u.open_func_amount, status: u.status })
      .eq("id", u.id);
  }
  await supabase
    .from("payments")
    .update({ status: "posted", realized_fx_func: totalFx })
    .eq("id", paymentId);

  revalidatePath("/admin/accounting/payments");
  revalidatePath("/admin/accounting/vendor-bills");
  return { ok: true, data: { entry_no: r.entryNo, realized_fx_func: totalFx } };
}
