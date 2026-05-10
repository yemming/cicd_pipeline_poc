"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requirePermission, hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  issueB2CInvoice,
  issueB2BInvoice,
  invalidB2CInvoice,
  invalidB2BInvoice,
  allowanceB2CInvoice,
  allowanceByCollegiateB2CInvoice,
  allowanceB2BInvoice,
  printB2CInvoice,
  printB2BInvoice,
  getInvoiceWordSettingB2C,
  type EInvoiceItem,
  type InvoiceCarrierType,
} from "./ecpay-client";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/einvoice";

// ─── 共用類型 ──────────────────────────────────────────────────────
export type ManualIssueInput = {
  // B2C 共通
  invoiceType: "b2c_personal" | "b2c_carrier" | "b2c_taxid" | "b2b" | "donation";
  totalAmount: number;
  items: EInvoiceItem[];
  // B2C 載具
  carrierCode?: string;     // /XXXXXXX
  // 統編 / B2B
  taxId?: string;
  // B2B 必填
  buyerName?: string;
  buyerAddress?: string;
  // 買方聯絡（選填，用於 email/SMS 發票通知）
  buyerEmail?: string;
  buyerPhone?: string;
  // 捐贈
  donationCode?: string;
  // 內部
  sourceModule?: "pos" | "service" | "parts_sales" | "manual";
  sourceId?: string | null;
  sourceRef?: string | null;
  remark?: string;
};

function genRelateNumber(): string {
  const ts   = Math.floor(Date.now() / 1000);
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV${ts}${rand}`;
}

function carrierTypeFromInvoiceType(t: ManualIssueInput["invoiceType"]): InvoiceCarrierType {
  return t === "b2c_carrier" ? "3" : "";
}

function calcTax(total: number): number {
  return Math.round(total * 5 / 105);
}

// ─── issueInvoiceAction：手動補單（B2C + B2B）──────────────────────
export async function issueInvoiceAction(
  input: ManualIssueInput,
): Promise<ActionResult<{ id: string; invoiceNo?: string; invoiceDate?: string }>> {
  await requirePermission(PERMISSIONS.EINVOICE_EDIT);

  if (input.totalAmount <= 0) return { ok: false, error: "金額需大於 0" };
  if (!input.items.length)    return { ok: false, error: "至少需要一個品項" };

  // 各類型驗證
  if (input.invoiceType === "b2c_taxid" && !input.taxId) {
    return { ok: false, error: "統一編號發票必須填寫統編" };
  }
  if (input.invoiceType === "b2b") {
    if (!input.taxId)        return { ok: false, error: "B2B 發票必須填寫統編" };
    if (!input.buyerName)    return { ok: false, error: "B2B 發票必須填寫公司名稱" };
    if (!input.buyerAddress) return { ok: false, error: "B2B 發票必須填寫公司地址" };
  }
  if (input.invoiceType === "b2c_carrier" && !input.carrierCode) {
    return { ok: false, error: "手機載具發票必須填寫載具號碼（/XXXXXXX）" };
  }
  if (input.invoiceType === "donation" && !input.donationCode) {
    return { ok: false, error: "捐贈發票必須填寫捐贈碼" };
  }

  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  const scope = await getActiveScope();

  // 1. 呼 ECPay
  let ecpayInvoiceNo:    string | null = null;
  let ecpayInvoiceDate:  string | null = null;
  let ecpayRandomNumber: string | null = null;
  let ecpayStatus: "issued" | "failed" = "failed";
  let ecpayError: string | null = null;

  if (input.invoiceType === "b2b") {
    const result = await issueB2BInvoice({
      relateNumber:       genRelateNumber(),
      totalAmount:        input.totalAmount,
      taxAmount:          calcTax(input.totalAmount),
      items:              input.items,
      customerIdentifier: input.taxId!,
      customerName:       input.buyerName!,
      customerAddr:       input.buyerAddress!,
      customerEmail:      input.buyerEmail,
      customerPhone:      input.buyerPhone,
      remark:             input.remark,
    });
    if (result.success) {
      ecpayInvoiceNo   = result.data.invoiceNumber;
      ecpayInvoiceDate = result.data.invoiceDate.slice(0, 10);
      ecpayStatus      = "issued";
    } else {
      ecpayError = result.error;
    }
  } else {
    const result = await issueB2CInvoice({
      relateNumber:       genRelateNumber(),
      totalAmount:        input.totalAmount,
      items:              input.items,
      carrierType:        carrierTypeFromInvoiceType(input.invoiceType),
      carrierNum:         input.invoiceType === "b2c_carrier" ? input.carrierCode : undefined,
      customerIdentifier: input.invoiceType === "b2c_taxid"   ? input.taxId       : undefined,
      customerName:       input.buyerName,
      customerAddr:       input.buyerAddress,
      customerEmail:      input.buyerEmail,
      customerPhone:      input.buyerPhone,
      donation:           input.invoiceType === "donation" ? "1" : "0",
      loveCode:           input.donationCode,
      remark:             input.remark,
    });
    if (result.success) {
      ecpayInvoiceNo    = result.data.invoiceNo;
      ecpayInvoiceDate  = result.data.invoiceDate.slice(0, 10);
      ecpayRandomNumber = result.data.randomNumber;
      ecpayStatus       = "issued";
    } else {
      ecpayError = result.error;
    }
  }

  // 2. 寫 einvoices（無論成功與否都記錄一筆，失敗者狀態為 failed 供重試）
  const db = createServiceClient();
  const { data: einv, error: insertErr } = await db.from("einvoices").insert({
    brand_id:            scope.brand_id,
    source_module:       input.sourceModule ?? "manual",
    source_id:           input.sourceId ?? null,
    source_ref:          input.sourceRef ?? null,
    ecpay_invoice_no:    ecpayInvoiceNo,
    ecpay_invoice_date:  ecpayInvoiceDate,
    ecpay_random_number: ecpayRandomNumber,
    ecpay_status:        ecpayStatus,
    ecpay_error_msg:     ecpayError,
    invoice_type:        input.invoiceType,
    carrier_type:        input.invoiceType === "b2c_carrier" ? "3" : "",
    carrier_code:        input.invoiceType === "b2c_carrier" ? input.carrierCode ?? null : null,
    tax_id:              (input.invoiceType === "b2c_taxid" || input.invoiceType === "b2b")
      ? input.taxId ?? null
      : null,
    buyer_name:          input.buyerName ?? null,
    buyer_address:       input.buyerAddress ?? null,
    buyer_email:         input.buyerEmail ?? null,
    buyer_phone:         input.buyerPhone ?? null,
    donation_code:       input.donationCode ?? null,
    total_amount:        input.totalAmount,
    tax_amount:          calcTax(input.totalAmount),
    items:               input.items,
    remark:              input.remark ?? null,
    issued_at:           ecpayStatus === "issued" ? new Date().toISOString() : null,
    issued_by:           user?.id ?? null,
  }).select("id").single();

  if (insertErr || !einv) {
    return { ok: false, error: `寫入發票主檔失敗：${insertErr?.message ?? "unknown"}` };
  }

  revalidatePath(PAGE_PATH);

  if (ecpayStatus === "failed") {
    return { ok: false, error: `綠界開立失敗：${ecpayError ?? "unknown"}（已記錄於發票主檔，可後續重試）` };
  }

  return {
    ok: true,
    data: {
      id:          einv.id,
      invoiceNo:   ecpayInvoiceNo ?? undefined,
      invoiceDate: ecpayInvoiceDate ?? undefined,
    },
  };
}

// ─── voidInvoiceAction：作廢 ──────────────────────────────────────
export async function voidInvoiceAction(
  einvoiceId: string,
  reason: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.EINVOICE_VOID);
  if (!einvoiceId)        return { ok: false, error: "缺少發票 id" };
  if (!reason?.trim())    return { ok: false, error: "作廢原因必填" };
  if (reason.length > 20) return { ok: false, error: "作廢原因不可超過 20 字" };

  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();

  const db = createServiceClient();
  const { data: einv, error: loadErr } = await db
    .from("einvoices")
    .select("id, brand_id, ecpay_invoice_no, ecpay_invoice_date, ecpay_status, invoice_type")
    .eq("id", einvoiceId)
    .single();

  if (loadErr || !einv) return { ok: false, error: "找不到該發票" };
  if (!einv.ecpay_invoice_no || !einv.ecpay_invoice_date) {
    return { ok: false, error: "此發票尚未開立成功，無法作廢" };
  }
  if (einv.ecpay_status === "voided") {
    return { ok: false, error: "此發票已作廢" };
  }

  // 呼 ECPay 對應 API
  const isB2B = einv.invoice_type === "b2b";
  const result = isB2B
    ? await invalidB2BInvoice({
        invoiceNumber: einv.ecpay_invoice_no,
        invoiceDate:   einv.ecpay_invoice_date,
        reason:        reason.trim(),
      })
    : await invalidB2CInvoice({
        invoiceNo:   einv.ecpay_invoice_no,
        invoiceDate: einv.ecpay_invoice_date,
        reason:      reason.trim(),
      });

  if (!result.success) {
    return { ok: false, error: `綠界作廢失敗：${result.error}` };
  }

  // 更新主檔 + 寫作廢紀錄
  await db.from("einvoices").update({
    ecpay_status: "voided",
  }).eq("id", einvoiceId);

  await db.from("einvoice_voids").insert({
    brand_id:    einv.brand_id,
    einvoice_id: einvoiceId,
    reason:      reason.trim(),
    voided_at:   new Date().toISOString(),
    voided_by:   user?.id ?? null,
  });

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${einvoiceId}`);
  return { ok: true, data: { id: einvoiceId } };
}

// ─── allowanceInvoiceAction：折讓 ─────────────────────────────────
export type AllowanceActionInput = {
  einvoiceId: string;
  allowanceAmount: number;       // 含稅
  items: EInvoiceItem[];
  notifyMethod?: "email" | "sms" | "manual";
  notifyTarget?: string;
  reason?: string;
  isOnline?: boolean;            // true=線上折讓（需買方 callback 確認）
};

export async function allowanceInvoiceAction(
  input: AllowanceActionInput,
): Promise<ActionResult<{ id: string; allowanceNo?: string }>> {
  await requirePermission(PERMISSIONS.EINVOICE_ALLOWANCE);
  if (!input.einvoiceId)             return { ok: false, error: "缺少發票 id" };
  if (input.allowanceAmount <= 0)    return { ok: false, error: "折讓金額需大於 0" };
  if (!input.items.length)           return { ok: false, error: "至少需要一個折讓品項" };

  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();

  const db = createServiceClient();
  const { data: einv, error: loadErr } = await db
    .from("einvoices")
    .select("id, brand_id, ecpay_invoice_no, ecpay_invoice_date, ecpay_status, invoice_type, total_amount, buyer_email")
    .eq("id", input.einvoiceId)
    .single();

  if (loadErr || !einv) return { ok: false, error: "找不到該發票" };
  if (!einv.ecpay_invoice_no || !einv.ecpay_invoice_date) {
    return { ok: false, error: "此發票尚未開立成功，無法折讓" };
  }
  if (einv.ecpay_status === "voided") {
    return { ok: false, error: "已作廢的發票無法折讓" };
  }
  if (input.allowanceAmount > einv.total_amount) {
    return { ok: false, error: `折讓金額不可超過原發票金額（${einv.total_amount}）` };
  }

  // 呼 ECPay
  const isB2B = einv.invoice_type === "b2b";
  const isOnline = !!input.isOnline && !isB2B;  // 線上折讓只支援 B2C
  const taxAmount = calcTax(input.allowanceAmount);

  const baseUrl =
    process.env.PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000";
  const callbackUrl = `${baseUrl.replace(/\/+$/, "")}/api/einvoice/allowance/notify`;

  const result = isB2B
    ? await allowanceB2BInvoice({
        invoiceNumber:   einv.ecpay_invoice_no,
        invoiceDate:     einv.ecpay_invoice_date,
        allowanceAmount: input.allowanceAmount,
        taxAmount,
        items:           input.items,
        reason:          input.reason,
      })
    : isOnline
    ? await allowanceByCollegiateB2CInvoice({
        invoiceNo:       einv.ecpay_invoice_no,
        invoiceDate:     einv.ecpay_invoice_date,
        allowanceAmount: input.allowanceAmount,
        items:           input.items,
        notifyMethod:    input.notifyMethod === "email" ? "E"
                       : input.notifyMethod === "sms"   ? "S"
                       : "N",
        notifyMail:      input.notifyMethod === "email" ? (input.notifyTarget ?? einv.buyer_email ?? "") : "",
        notifyPhone:     input.notifyMethod === "sms"   ? input.notifyTarget : "",
        reason:          input.reason,
        returnUrl:       callbackUrl,
      })
    : await allowanceB2CInvoice({
        invoiceNo:       einv.ecpay_invoice_no,
        invoiceDate:     einv.ecpay_invoice_date,
        allowanceAmount: input.allowanceAmount,
        items:           input.items,
        notifyMethod:    input.notifyMethod === "email" ? "E"
                       : input.notifyMethod === "sms"   ? "S"
                       : "N",
        notifyMail:      input.notifyMethod === "email" ? (input.notifyTarget ?? einv.buyer_email ?? "") : "",
        notifyPhone:     input.notifyMethod === "sms"   ? input.notifyTarget : "",
      });

  // 線上折讓：API 回 success 只代表「綠界已受理」，實際結果要等 callback 才知道
  const status: "issued" | "pending" | "failed" =
    !result.success ? "failed"
    : isOnline      ? "pending"    // 等買方在綠界平台確認折讓
    :                  "issued";

  // 寫折讓單（即使失敗也記錄供重試）
  // 線上折讓 result.data 只有 acceptedForCallback，沒 allowanceNo（要等 callback）
  const allowanceNo =
    result.success && "allowanceNo" in result.data
      ? result.data.allowanceNo
      : null;

  const { data: allow, error: insErr } = await db.from("einvoice_allowances").insert({
    brand_id:           einv.brand_id,
    einvoice_id:        input.einvoiceId,
    ecpay_allowance_no: allowanceNo,
    total_amount:       input.allowanceAmount,
    tax_amount:         taxAmount,
    items:              input.items,
    reason:             input.reason ?? null,
    status,
    ecpay_error_msg:    result.success ? null : result.error,
    notify_method:      input.notifyMethod ?? null,
    notify_target:      input.notifyTarget ?? null,
    is_online:          isOnline,
    issued_at:          status === "issued" ? new Date().toISOString() : null,
    issued_by:          user?.id ?? null,
  }).select("id").single();

  if (insErr || !allow) {
    return { ok: false, error: `寫入折讓單失敗：${insErr?.message ?? "unknown"}` };
  }

  // 折讓成功 → 更新主檔狀態
  if (status === "issued") {
    await db.from("einvoices").update({ ecpay_status: "allowanced" }).eq("id", input.einvoiceId);
  }

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${input.einvoiceId}`);

  if (!result.success) {
    return { ok: false, error: `綠界折讓失敗：${result.error}` };
  }
  return {
    ok: true,
    data: {
      id:          allow.id,
      allowanceNo: allowanceNo ?? undefined,
    },
  };
}

// ─── printInvoiceAction：重印發票 HTML ───────────────────────────
export async function printInvoiceAction(
  einvoiceId: string,
): Promise<ActionResult<{ html: string }>> {
  await requirePermission(PERMISSIONS.EINVOICE_VIEW);
  if (!einvoiceId) return { ok: false, error: "缺少發票 id" };

  const db = createServiceClient();
  const { data: einv, error } = await db
    .from("einvoices")
    .select("ecpay_invoice_no, ecpay_invoice_date, ecpay_status, invoice_type")
    .eq("id", einvoiceId)
    .single();

  if (error || !einv) return { ok: false, error: "找不到該發票" };
  if (!einv.ecpay_invoice_no || !einv.ecpay_invoice_date) {
    return { ok: false, error: "此發票尚未開立成功，無法重印" };
  }

  const result = einv.invoice_type === "b2b"
    ? await printB2BInvoice(einv.ecpay_invoice_no, einv.ecpay_invoice_date)
    : await printB2CInvoice(einv.ecpay_invoice_no, einv.ecpay_invoice_date);

  if (!result.success) return { ok: false, error: `綠界重印失敗：${result.error}` };
  return { ok: true, data: { html: result.data.html } };
}

// ─── syncNumberPoolsAction：向綠界同步字軌配號 ──────────────────
export async function syncNumberPoolsAction(opts?: {
  invoiceYear?: string;
}): Promise<ActionResult<{ synced: number; year: string }>> {
  await requirePermission(PERMISSIONS.EINVOICE_SETTINGS);

  const result = await getInvoiceWordSettingB2C({
    invoiceYear: opts?.invoiceYear,
  });
  if (!result.success) return { ok: false, error: `綠界字軌查詢失敗：${result.error}` };

  const db = createServiceClient();
  const scope = await getActiveScope();
  const year = result.data.year;
  const now = new Date().toISOString();

  let synced = 0;
  for (const item of result.data.items) {
    const period = `${year}${String(item.invoiceTerm).padStart(2, "0")}`;
    const start = parseInt(item.invoiceBeginNo, 10);
    const end   = parseInt(item.invoiceEndNo, 10);
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    // upsert by (brand_id, period, prefix)
    const { error: existErr, data: existing } = await db
      .from("einvoice_number_pools")
      .select("id")
      .eq("brand_id", scope.brand_id)
      .eq("period", period)
      .eq("prefix", item.invoiceWord)
      .maybeSingle();

    if (existErr) continue;

    if (existing) {
      await db.from("einvoice_number_pools").update({
        start_no:  start,
        end_no:    end,
        is_active: item.useStatus !== 2,
        synced_at: now,
      }).eq("id", existing.id);
    } else {
      await db.from("einvoice_number_pools").insert({
        brand_id:  scope.brand_id,
        period,
        prefix:    item.invoiceWord,
        start_no:  start,
        end_no:    end,
        is_active: item.useStatus !== 2,
        synced_at: now,
      });
    }
    synced++;
  }

  revalidatePath("/einvoice/number-pools");
  return { ok: true, data: { synced, year } };
}

// ─── canEditInvoices：給 page 用的 helper ─────────────────────────
export async function canEditInvoices(): Promise<boolean> {
  return hasPermission(PERMISSIONS.EINVOICE_EDIT);
}
