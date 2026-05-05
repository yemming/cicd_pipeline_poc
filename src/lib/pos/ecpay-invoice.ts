// ECPay B2C 電子發票 AES-JSON 整合
// Guide: ~/.claude/skills/ecpay/guides/04-invoice-b2c.md
// Test account: MerchantID 2000132 / ejCk326UnaZWKisg / q9jcZX8Ib9LM8wYk
import crypto from "crypto";
import { getCurrentBrand } from "@/lib/brands/current";

const STAGE_URL = "https://einvoice-stage.ecpay.com.tw";
const PROD_URL = "https://einvoice.ecpay.com.tw";

function baseUrl() {
  return process.env.ECPAY_ENV === "prod" ? PROD_URL : STAGE_URL;
}

// ECPay AES URL-encode: encodeURIComponent + space→+ + ~→%7E (no lowercase, no .NET replacements)
function aesUrlEncode(str: string): string {
  return encodeURIComponent(str).replace(/%20/g, "+").replace(/~/g, "%7E");
}

function aesEncrypt(data: object, key: string, iv: string): string {
  const json = JSON.stringify(data);
  const encoded = aesUrlEncode(json);
  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8"),
  );
  return Buffer.concat([cipher.update(encoded, "utf8"), cipher.final()]).toString("base64");
}

function aesDecrypt(base64: string, key: string, iv: string): unknown {
  const buf = Buffer.from(base64, "base64");
  const decipher = crypto.createDecipheriv(
    "aes-128-cbc",
    Buffer.from(key, "utf8"),
    Buffer.from(iv, "utf8"),
  );
  const raw = Buffer.concat([decipher.update(buf), decipher.final()]).toString("utf8");
  return JSON.parse(decodeURIComponent(raw.replace(/\+/g, " ")));
}

export type InvoiceCarrierType = "" | "1" | "2" | "3";

export type IssueInvoiceInput = {
  relateNumber: string;       // 唯一英數字訂單編號，不含特殊符號
  totalAmount: number;        // 含稅總金額（整數）
  items: {
    name: string;
    qty: number;
    unitPrice: number;
    amount: number;           // qty * unitPrice
  }[];
  carrierType: InvoiceCarrierType;
  carrierNum?: string;        // CarrierType=3 時填手機條碼 /XXXXXXX
  customerIdentifier?: string; // 統一編號（taxid 模式）
  customerEmail?: string;
  customerPhone?: string;
  remark?: string;
};

export type IssueInvoiceResult =
  | { success: true; invoiceNo: string; invoiceDate: string; randomNumber: string }
  | { success: false; error: string };

export async function issueInvoice(input: IssueInvoiceInput): Promise<IssueInvoiceResult> {
  const merchantId = process.env.ECPAY_INVOICE_MERCHANT_ID ?? "2000132";
  const hashKey    = process.env.ECPAY_INVOICE_HASH_KEY    ?? "ejCk326UnaZWKisg";
  const hashIV     = process.env.ECPAY_INVOICE_HASH_IV     ?? "q9jcZX8Ib9LM8wYk";

  const data = {
    MerchantID:          merchantId,
    RelateNumber:        input.relateNumber,
    CustomerID:          "",
    CustomerIdentifier:  input.customerIdentifier ?? "",
    CustomerName:        "",
    CustomerAddr:        "",
    CustomerPhone:       input.customerPhone ?? "",
    CustomerEmail:       input.customerEmail ?? "noreply@ducati-taipei.com",
    ClearanceMark:       "",
    Print:               "0",
    Donation:            "0",
    LoveCode:            "",
    CarrierType:         input.carrierType,
    CarrierNum:          input.carrierNum ?? "",
    TaxType:             "1",
    SalesAmount:         input.totalAmount,
    InvoiceRemark:       input.remark ?? getCurrentBrand().ecpayDefaults.invoiceRemark,
    Items: input.items.map((item, i) => ({
      ItemSeq:      i + 1,
      ItemName:     item.name.slice(0, 100),
      ItemCount:    item.qty,
      ItemWord:     "件",
      ItemPrice:    item.unitPrice,
      ItemTaxType:  "1",
      ItemAmount:   item.amount,
    })),
    InvType: "07",
    vat:     "1",
  };

  const body = {
    MerchantID: merchantId,
    RqHeader: {
      Timestamp: Math.floor(Date.now() / 1000),
      Revision:  "3.0.0",   // B2C 發票固定 3.0.0，不可省略
    },
    Data: aesEncrypt(data, hashKey, hashIV),
  };

  try {
    const res = await fetch(`${baseUrl()}/B2CInvoice/Issue`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status} ${res.statusText}` };
    }

    const outer = (await res.json()) as {
      TransCode: number;
      TransMsg:  string;
      Data:      string;
    };

    // Layer 1: 傳輸層
    if (outer.TransCode !== 1) {
      return { success: false, error: `TransCode ${outer.TransCode}: ${outer.TransMsg}` };
    }

    // Layer 2: 業務層（解密後）
    const inner = aesDecrypt(outer.Data, hashKey, hashIV) as {
      RtnCode:      number;
      RtnMsg:       string;
      InvoiceNo:    string;
      InvoiceDate:  string;
      RandomNumber: string;
    };

    if (inner.RtnCode !== 1) {
      return { success: false, error: `RtnCode ${inner.RtnCode}: ${inner.RtnMsg}` };
    }

    return {
      success:      true,
      invoiceNo:    inner.InvoiceNo,
      invoiceDate:  inner.InvoiceDate.replace(/\+/g, " "),
      randomNumber: inner.RandomNumber,
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
