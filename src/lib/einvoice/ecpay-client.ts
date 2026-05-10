// ECPay 電子發票 client（B2C + B2B，AES-JSON 整合）
// Guides:
//   ~/.claude/skills/ecpay/guides/04-invoice-b2c.md
//   ~/.claude/skills/ecpay/guides/05-invoice-b2b.md
// Test account: MerchantID 2000132 / ejCk326UnaZWKisg / q9jcZX8Ib9LM8wYk
//
// 涵蓋 API:
//   B2C: Issue / Invalid / Allowance / AllowanceInvalid / GetIssue
//   B2B: Issue / Invalid / Allowance（採存證模式，開立即生效，無需買方確認）
//
// 從原 src/lib/pos/ecpay-invoice.ts 提升而來，POS 仍可從這裡 re-export。
import crypto from "crypto";
import { getCurrentBrand } from "@/lib/brands/current";

const STAGE_URL = "https://einvoice-stage.ecpay.com.tw";
const PROD_URL  = "https://einvoice.ecpay.com.tw";

function baseUrl(): string {
  return process.env.ECPAY_ENV === "prod" ? PROD_URL : STAGE_URL;
}

function credentials(): { merchantId: string; hashKey: string; hashIV: string } {
  return {
    merchantId: process.env.ECPAY_INVOICE_MERCHANT_ID ?? "2000132",
    hashKey:    process.env.ECPAY_INVOICE_HASH_KEY    ?? "ejCk326UnaZWKisg",
    hashIV:     process.env.ECPAY_INVOICE_HASH_IV     ?? "q9jcZX8Ib9LM8wYk",
  };
}

// ─── AES helpers ────────────────────────────────────────────────────
// ECPay AES URL-encode：encodeURIComponent + space→+ + ~→%7E
// （無 lowercase、無 .NET 替換，跟 CMV 的 ecpayUrlEncode 不同）
function aesUrlEncode(str: string): string {
  return encodeURIComponent(str).replace(/%20/g, "+").replace(/~/g, "%7E");
}

function aesEncrypt(data: object, key: string, iv: string): string {
  const json    = JSON.stringify(data);
  const encoded = aesUrlEncode(json);
  const cipher  = crypto.createCipheriv(
    "aes-128-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv,  "utf8"),
  );
  return Buffer.concat([cipher.update(encoded, "utf8"), cipher.final()]).toString("base64");
}

function aesDecrypt(base64: string, key: string, iv: string): unknown {
  const buf      = Buffer.from(base64, "base64");
  const decipher = crypto.createDecipheriv(
    "aes-128-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv,  "utf8"),
  );
  const raw = Buffer.concat([decipher.update(buf), decipher.final()]).toString("utf8");
  return JSON.parse(decodeURIComponent(raw.replace(/\+/g, " ")));
}

async function postEcpay<TInner>(
  endpoint: string,
  data: object,
  revision: string,
): Promise<EInvoiceResult<TInner>> {
  const { merchantId, hashKey, hashIV } = credentials();
  const body = {
    MerchantID: merchantId,
    RqHeader:   { Timestamp: Math.floor(Date.now() / 1000), Revision: revision },
    Data:       aesEncrypt(data, hashKey, hashIV),
  };

  try {
    const res = await fetch(`${baseUrl()}${endpoint}`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    if (!res.ok) return { success: false, error: `HTTP ${res.status} ${res.statusText}` };

    const outer = (await res.json()) as { TransCode: number; TransMsg: string; Data: string };

    // Layer 1: 傳輸層
    if (outer.TransCode !== 1) {
      return { success: false, error: `TransCode ${outer.TransCode}: ${outer.TransMsg}` };
    }

    // Layer 2: 業務層（解密後）
    const inner = aesDecrypt(outer.Data, hashKey, hashIV) as TInner & { RtnCode?: number; RtnMsg?: string };

    if (inner.RtnCode !== 1) {
      return { success: false, error: `RtnCode ${inner.RtnCode}: ${inner.RtnMsg ?? "未知錯誤"}` };
    }

    return { success: true, data: inner };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── 公用 type ──────────────────────────────────────────────────────
export type EInvoiceResult<T = unknown> =
  | { success: true; data: T }
  | { success: false; error: string };

export type InvoiceCarrierType = "" | "1" | "2" | "3";
export type InvoiceTaxType     = "1" | "2" | "3" | "9";

export type EInvoiceItem = {
  name: string;
  qty: number;
  unitPrice: number;
  amount: number;                // qty * unitPrice
  taxType?: InvoiceTaxType;      // B2C 用：1=應稅 2=零稅 3=免稅 9=混合
  taxAmount?: number;            // B2B 用：每項稅額 ItemTax
  word?: string;                 // 單位（件、張、組）
};

// ─── B2C 開立 ──────────────────────────────────────────────────────
export type IssueB2CInput = {
  relateNumber: string;          // 唯一英數字訂單編號
  totalAmount: number;           // 含稅總金額
  items: EInvoiceItem[];
  carrierType: InvoiceCarrierType;
  carrierNum?: string;           // CarrierType=3 時填手機條碼 /XXXXXXX
  customerIdentifier?: string;   // 統一編號
  customerName?: string;
  customerAddr?: string;
  customerEmail?: string;
  customerPhone?: string;
  donation?: "0" | "1";          // 是否捐贈
  loveCode?: string;             // 捐贈碼
  remark?: string;
  taxType?: InvoiceTaxType;
  print?: "0" | "1";
};

export async function issueB2CInvoice(
  input: IssueB2CInput,
): Promise<EInvoiceResult<{ invoiceNo: string; invoiceDate: string; randomNumber: string }>> {
  const { merchantId } = credentials();

  const data = {
    MerchantID:         merchantId,
    RelateNumber:       input.relateNumber,
    CustomerID:         "",
    CustomerIdentifier: input.customerIdentifier ?? "",
    CustomerName:       input.customerName ?? "",
    CustomerAddr:       input.customerAddr ?? "",
    CustomerPhone:      input.customerPhone ?? "",
    CustomerEmail:      input.customerEmail ?? "noreply@ducati-taipei.com",
    ClearanceMark:      "",
    Print:              input.print ?? "0",
    Donation:           input.donation ?? "0",
    LoveCode:           input.loveCode ?? "",
    CarrierType:        input.carrierType,
    CarrierNum:         input.carrierNum ?? "",
    TaxType:            input.taxType ?? "1",
    SalesAmount:        input.totalAmount,
    InvoiceRemark:      input.remark ?? getCurrentBrand().ecpayDefaults.invoiceRemark,
    Items: input.items.map((item, i) => ({
      ItemSeq:     i + 1,
      ItemName:    item.name.slice(0, 100),
      ItemCount:   item.qty,
      ItemWord:    item.word ?? "件",
      ItemPrice:   item.unitPrice,
      ItemTaxType: item.taxType ?? "1",
      ItemAmount:  item.amount,
    })),
    InvType: "07",
    vat:     "1",
  };

  const result = await postEcpay<{
    InvoiceNo: string;
    InvoiceDate: string;
    RandomNumber: string;
  }>("/B2CInvoice/Issue", data, "3.0.0");

  if (!result.success) return result;
  return {
    success: true,
    data: {
      invoiceNo:    result.data.InvoiceNo,
      invoiceDate:  result.data.InvoiceDate.replace(/\+/g, " "),
      randomNumber: result.data.RandomNumber,
    },
  };
}

// ─── B2C 作廢 ──────────────────────────────────────────────────────
export type InvalidB2CInput = {
  invoiceNo: string;
  invoiceDate: string;     // YYYY-MM-DD or YYYY/MM/DD
  reason: string;          // max 20 chars
};

export async function invalidB2CInvoice(
  input: InvalidB2CInput,
): Promise<EInvoiceResult<{ invoiceNo: string }>> {
  const { merchantId } = credentials();
  const data = {
    MerchantID:  merchantId,
    InvoiceNo:   input.invoiceNo,
    InvoiceDate: input.invoiceDate.replace(/-/g, "/"),
    Reason:      input.reason.slice(0, 20),
  };

  const result = await postEcpay<{ InvoiceNo: string }>("/B2CInvoice/Invalid", data, "3.0.0");
  if (!result.success) return result;
  return { success: true, data: { invoiceNo: result.data.InvoiceNo } };
}

// ─── B2C 折讓（一般，線下；不需 callback）──────────────────────────
export type AllowanceB2CInput = {
  invoiceNo: string;
  invoiceDate: string;
  allowanceAmount: number;          // 含稅折讓金額
  items: EInvoiceItem[];
  notifyMethod?: "E" | "S" | "A" | "N";
  customerName?: string;
  notifyMail?: string;
  notifyPhone?: string;
  remark?: string;
};

export async function allowanceB2CInvoice(
  input: AllowanceB2CInput,
): Promise<EInvoiceResult<{ allowanceNo: string }>> {
  const { merchantId } = credentials();
  const data = {
    MerchantID:       merchantId,
    InvoiceNo:        input.invoiceNo,
    InvoiceDate:      input.invoiceDate.replace(/-/g, "/"),
    AllowanceNotify:  input.notifyMethod ?? "N",
    CustomerName:     input.customerName ?? "",
    NotifyMail:       input.notifyMail   ?? "",
    NotifyPhone:      input.notifyPhone  ?? "",
    AllowanceAmount:  input.allowanceAmount,
    Items: input.items.map((item, i) => ({
      ItemSeq:     i + 1,
      ItemName:    item.name.slice(0, 100),
      ItemCount:   item.qty,
      ItemWord:    item.word ?? "件",
      ItemPrice:   item.unitPrice,
      ItemTaxType: item.taxType ?? "1",
      ItemAmount:  item.amount,
    })),
  };

  const result = await postEcpay<{ IA_Allow_No: string }>(
    "/B2CInvoice/Allowance",
    data,
    "3.0.0",
  );
  if (!result.success) return result;
  return { success: true, data: { allowanceNo: result.data.IA_Allow_No } };
}

// ─── B2C 折讓作廢 ──────────────────────────────────────────────────
export type InvalidAllowanceB2CInput = {
  invoiceNo: string;
  allowanceNo: string;
  reason: string;
};

export async function invalidAllowanceB2CInvoice(
  input: InvalidAllowanceB2CInput,
): Promise<EInvoiceResult<{ allowanceNo: string }>> {
  const { merchantId } = credentials();
  const data = {
    MerchantID:  merchantId,
    InvoiceNo:   input.invoiceNo,
    AllowanceNo: input.allowanceNo,
    Reason:      input.reason.slice(0, 20),
  };

  const result = await postEcpay<{ IA_Invalid_AllowanceNo: string }>(
    "/B2CInvoice/AllowanceInvalid",
    data,
    "3.0.0",
  );
  if (!result.success) return result;
  return { success: true, data: { allowanceNo: result.data.IA_Invalid_AllowanceNo } };
}

// ─── B2C 查詢 ──────────────────────────────────────────────────────
export type GetB2CInvoiceInput = {
  relateNumber: string;
  invoiceNo?: string;
  invoiceDate?: string;
};

export async function getB2CInvoice(
  input: GetB2CInvoiceInput,
): Promise<EInvoiceResult<Record<string, unknown>>> {
  const { merchantId } = credentials();
  const data = {
    MerchantID:   merchantId,
    RelateNumber: input.relateNumber,
    InvoiceNo:    input.invoiceNo   ?? "",
    InvoiceDate:  input.invoiceDate ? input.invoiceDate.replace(/-/g, "/") : "",
  };

  return postEcpay<Record<string, unknown>>("/B2CInvoice/GetIssue", data, "3.0.0");
}

// ─── B2B 開立（存證模式，開立即生效，無需買方確認）──────────────
export type IssueB2BInput = {
  relateNumber: string;
  totalAmount: number;             // 含稅總金額
  taxAmount: number;               // 稅額（B2B 必填）
  items: EInvoiceItem[];           // ItemTax 必填
  customerIdentifier: string;      // 統一編號（必填）
  customerName: string;            // 公司名（必填）
  customerAddr: string;            // 公司地址（必填）
  customerEmail?: string;
  customerPhone?: string;
  remark?: string;
  taxType?: InvoiceTaxType;
  invType?: "07" | "08";           // 07=一般稅額 08=特種稅額
};

export async function issueB2BInvoice(
  input: IssueB2BInput,
): Promise<EInvoiceResult<{ invoiceNumber: string; invoiceDate: string }>> {
  const { merchantId } = credentials();

  const data = {
    MerchantID:         merchantId,
    RelateNumber:       input.relateNumber,
    CustomerIdentifier: input.customerIdentifier,
    CustomerName:       input.customerName,
    CustomerAddr:       input.customerAddr,
    CustomerEmail:      input.customerEmail ?? "",
    CustomerPhone:      input.customerPhone ?? "",
    TaxType:            input.taxType ?? "1",
    SalesAmount:        input.totalAmount - input.taxAmount,  // B2B 用未稅
    TaxAmount:          input.taxAmount,
    TotalAmount:        input.totalAmount,
    InvoiceRemark:      input.remark ?? getCurrentBrand().ecpayDefaults.invoiceRemark,
    InvType:            input.invType ?? "07",
    Items: input.items.map((item, i) => ({
      ItemSeq:    i + 1,
      ItemName:   item.name.slice(0, 100),
      ItemCount:  item.qty,
      ItemWord:   item.word ?? "件",
      ItemPrice:  item.unitPrice,
      ItemAmount: item.amount,
      // ⚠️ B2B 用 ItemTax (Number, 稅額金額)，不是 ItemTaxType (String, 稅別)
      // 官方 SDK Issue.php 範例有 bug 用了 ItemTaxType，以 24230.md 為準
      ItemTax:    item.taxAmount ?? Math.round(item.amount * 5 / 105),
    })),
  };

  const result = await postEcpay<{
    InvoiceNumber: string;
    InvoiceDate: string;
  }>("/B2BInvoice/Issue", data, "1.0.0");

  if (!result.success) return result;
  return {
    success: true,
    data: {
      invoiceNumber: result.data.InvoiceNumber,
      invoiceDate:   result.data.InvoiceDate.replace(/\+/g, " "),
    },
  };
}

// ─── B2B 作廢 ──────────────────────────────────────────────────────
export type InvalidB2BInput = {
  invoiceNumber: string;            // ⚠️ B2B 用 InvoiceNumber 不是 InvoiceNo
  invoiceDate: string;
  reason: string;
};

export async function invalidB2BInvoice(
  input: InvalidB2BInput,
): Promise<EInvoiceResult<{ invoiceNumber: string }>> {
  const { merchantId } = credentials();
  const data = {
    MerchantID:    merchantId,
    InvoiceNumber: input.invoiceNumber,
    InvoiceDate:   input.invoiceDate.replace(/-/g, "/"),
    Reason:        input.reason.slice(0, 20),
  };

  const result = await postEcpay<{ InvoiceNumber: string }>(
    "/B2BInvoice/Invalid",
    data,
    "1.0.0",
  );
  if (!result.success) return result;
  return { success: true, data: { invoiceNumber: result.data.InvoiceNumber } };
}

// ─── B2B 折讓 ──────────────────────────────────────────────────────
export type AllowanceB2BInput = {
  invoiceNumber: string;
  invoiceDate: string;
  allowanceAmount: number;          // 含稅
  taxAmount: number;
  items: EInvoiceItem[];
  reason?: string;
};

export async function allowanceB2BInvoice(
  input: AllowanceB2BInput,
): Promise<EInvoiceResult<{ allowanceNo: string }>> {
  const { merchantId } = credentials();
  const data = {
    MerchantID:        merchantId,
    InvoiceNumber:     input.invoiceNumber,
    InvoiceDate:       input.invoiceDate.replace(/-/g, "/"),
    AllowanceAmount:   input.allowanceAmount - input.taxAmount,  // 未稅
    AllowanceTaxAmount: input.taxAmount,
    AllowanceTotal:    input.allowanceAmount,
    Reason:            (input.reason ?? "").slice(0, 200),
    Items: input.items.map((item, i) => ({
      ItemSeq:    i + 1,
      ItemName:   item.name.slice(0, 100),
      ItemCount:  item.qty,
      ItemWord:   item.word ?? "件",
      ItemPrice:  item.unitPrice,
      ItemAmount: item.amount,
      ItemTax:    item.taxAmount ?? Math.round(item.amount * 5 / 105),
    })),
  };

  const result = await postEcpay<{ AllowanceNo: string }>(
    "/B2BInvoice/Allowance",
    data,
    "1.0.0",
  );
  if (!result.success) return result;
  return { success: true, data: { allowanceNo: result.data.AllowanceNo } };
}

// ─── B2C 線上折讓（公立學校 / 政府機關用，含 callback）──────────
// 與 allowanceB2CInvoice 不同：
//   - 多一個 ReturnURL 參數
//   - 結果非同步：callback 是 Form POST + CheckMacValue MD5 驗證
//   - Callback URL 必須是 public-accessible（dev 用 ngrok）
export type AllowanceByCollegiateInput = AllowanceB2CInput & {
  returnUrl: string;                     // 必填：綠界 callback 進來的 URL
  reason?: string;
};

export async function allowanceByCollegiateB2CInvoice(
  input: AllowanceByCollegiateInput,
): Promise<EInvoiceResult<{ acceptedForCallback: true }>> {
  const { merchantId } = credentials();
  const data = {
    MerchantID:       merchantId,
    InvoiceNo:        input.invoiceNo,
    InvoiceDate:      input.invoiceDate.replace(/-/g, "/"),
    AllowanceNotify:  input.notifyMethod ?? "N",
    CustomerName:     input.customerName ?? "",
    NotifyMail:       input.notifyMail   ?? "",
    NotifyPhone:      input.notifyPhone  ?? "",
    AllowanceAmount:  input.allowanceAmount,
    Reason:           (input.reason ?? "").slice(0, 200),
    ReturnURL:        input.returnUrl,
    Items: input.items.map((item, i) => ({
      ItemSeq:     i + 1,
      ItemName:    item.name.slice(0, 100),
      ItemCount:   item.qty,
      ItemWord:    item.word ?? "件",
      ItemPrice:   item.unitPrice,
      ItemTaxType: item.taxType ?? "1",
      ItemAmount:  item.amount,
    })),
  };

  const result = await postEcpay<Record<string, unknown>>(
    "/B2CInvoice/AllowanceByCollegiate",
    data,
    "3.0.0",
  );
  if (!result.success) return result;
  // 接受成功，實際折讓結果會 callback 到 returnUrl
  return { success: true, data: { acceptedForCallback: true as const } };
}

// ─── B2C 發票列印（回 HTML 字串可在新分頁 render）─────────────
export async function printB2CInvoice(
  invoiceNo: string,
  invoiceDate: string,
): Promise<EInvoiceResult<{ html: string }>> {
  const { merchantId } = credentials();
  const data = {
    MerchantID:  merchantId,
    InvoiceNo:   invoiceNo,
    InvoiceDate: invoiceDate.replace(/-/g, "/"),
  };
  const result = await postEcpay<{ InvoiceHtml?: string; InvoicePDF?: string }>(
    "/B2CInvoice/InvoicePrint",
    data,
    "3.0.0",
  );
  if (!result.success) return result;
  return {
    success: true,
    data: { html: result.data.InvoiceHtml ?? result.data.InvoicePDF ?? "" },
  };
}

// ─── B2B 發票列印 ──────────────────────────────────────────────
export async function printB2BInvoice(
  invoiceNumber: string,
  invoiceDate: string,
): Promise<EInvoiceResult<{ html: string }>> {
  const { merchantId } = credentials();
  const data = {
    MerchantID:    merchantId,
    InvoiceNumber: invoiceNumber,
    InvoiceDate:   invoiceDate.replace(/-/g, "/"),
  };
  const result = await postEcpay<{ InvoiceHtml?: string; InvoicePDF?: string }>(
    "/B2BInvoice/InvoicePrint",
    data,
    "1.0.0",
  );
  if (!result.success) return result;
  return {
    success: true,
    data: { html: result.data.InvoiceHtml ?? result.data.InvoicePDF ?? "" },
  };
}

// ─── B2C 字軌設定查詢（GetInvoiceWordSetting）────────────────
// 回傳當前已配發的字軌期別與號碼區段，可用來填 einvoice_number_pools
export type WordSettingItem = {
  invoiceTerm: number;       // 1=一月, 2=三月, ..., 6=十一月
  invoiceWord: string;       // 字軌兩碼如 'AB'
  invoiceBeginNo: string;
  invoiceEndNo: string;
  useStatus?: number;        // 0=未使用 1=啟用中 2=已使用完
};

export async function getInvoiceWordSettingB2C(opts?: {
  invoiceYear?: string;       // 民國年，如 '113'；預設當年
  invoiceTerm?: number;       // 0=全部
  useStatus?: number;         // 0=全部 1=已使用 2=未使用
}): Promise<EInvoiceResult<{ items: WordSettingItem[]; year: string }>> {
  const { merchantId } = credentials();
  const year = opts?.invoiceYear ?? String(new Date().getFullYear() - 1911);

  const data = {
    MerchantID:      merchantId,
    InvoiceYear:     year,
    InvoiceTerm:     opts?.invoiceTerm ?? 0,
    UseStatus:       opts?.useStatus   ?? 0,
    InvoiceCategory: 1,
  };
  const result = await postEcpay<{
    InvoiceInfo?: Array<{
      InvoiceTerm:    number;
      InvoiceWord:    string;
      InvoiceBeginNo: string;
      InvoiceEndNo:   string;
      UseStatus?:     number;
    }>;
  }>("/B2CInvoice/GetInvoiceWordSetting", data, "3.0.0");

  if (!result.success) return result;
  const list = result.data.InvoiceInfo ?? [];
  return {
    success: true,
    data: {
      year,
      items: list.map((r) => ({
        invoiceTerm:    r.InvoiceTerm,
        invoiceWord:    r.InvoiceWord,
        invoiceBeginNo: r.InvoiceBeginNo,
        invoiceEndNo:   r.InvoiceEndNo,
        useStatus:      r.UseStatus,
      })),
    },
  };
}
