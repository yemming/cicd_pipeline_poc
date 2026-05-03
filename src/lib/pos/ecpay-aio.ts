// ECPay AIO 全方位金流 — CMV-SHA256 協議
// Guide: ~/.claude/skills/ecpay/guides/01-payment-aio.md
// Test: MerchantID 3002607 / pwFHCqoQZGmho4w6 / EkRm7iFT261dpevs
// ⚠️ AIO 用 ecpayUrlEncode（encode→lowercase→還原特殊字元）
//    發票用 aesUrlEncode（不同！不可混用）
import crypto from "crypto";

// ─────────────────────────────────────────────────────────────
// 加密工具
// ─────────────────────────────────────────────────────────────

function ecpayUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .toLowerCase()
    // 還原 ECPay 不編碼的字元（與 .NET HttpUtility.UrlEncode 相容）
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");
}

export function calcCheckMacValue(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): string {
  const sorted = Object.keys(params)
    .filter((k) => k !== "CheckMacValue")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");

  const raw     = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

// ─────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────

function formatTW(date: Date): string {
  // ECPay 要求 UTC+8 格式 yyyy/MM/dd HH:mm:ss
  const tw = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const y  = tw.getUTCFullYear();
  const mo = String(tw.getUTCMonth() + 1).padStart(2, "0");
  const d  = String(tw.getUTCDate()).padStart(2, "0");
  const h  = String(tw.getUTCHours()).padStart(2, "0");
  const m  = String(tw.getUTCMinutes()).padStart(2, "0");
  const s  = String(tw.getUTCSeconds()).padStart(2, "0");
  return `${y}/${mo}/${d} ${h}:${m}:${s}`;
}

function getConfig() {
  return {
    merchantId: process.env.ECPAY_AIO_MERCHANT_ID ?? "3002607",
    hashKey:    process.env.ECPAY_AIO_HASH_KEY    ?? "pwFHCqoQZGmho4w6",
    hashIV:     process.env.ECPAY_AIO_HASH_IV     ?? "EkRm7iFT261dpevs",
    baseUrl:    process.env.ECPAY_ENV === "prod"
      ? "https://payment.ecpay.com.tw"
      : "https://payment-stage.ecpay.com.tw",
    appUrl: process.env.APP_URL ?? "http://localhost:3000",
  };
}

// ─────────────────────────────────────────────────────────────
// 建立 AIO 訂單參數
// ─────────────────────────────────────────────────────────────

export type AioOrderInput = {
  merchantTradeNo: string;   // 唯一英數字，max 20 chars
  totalAmount:     number;
  itemName:        string;   // 商品名稱（多項用 # 分隔，合計 max 200 bytes）
  tradeDesc:       string;   // 交易說明（max 200 chars，不含特殊符號）
  choosePayment:   "LINEPAY" | "TWQR" | "ALL";
  returnUrl:       string;   // Server-to-server callback
  orderResultUrl?: string;   // Browser-side result
  clientBackUrl?:  string;   // 客戶取消後導回
};

export function buildAioParams(input: AioOrderInput): Record<string, string> {
  const { merchantId, hashKey, hashIV } = getConfig();

  const params: Record<string, string> = {
    MerchantID:        merchantId,
    MerchantTradeNo:   input.merchantTradeNo,
    MerchantTradeDate: formatTW(new Date()),
    PaymentType:       "aio",
    TotalAmount:       String(input.totalAmount),
    TradeDesc:         input.tradeDesc.slice(0, 200),
    ItemName:          input.itemName.slice(0, 400),  // ECPay 上限 400 bytes
    ReturnURL:         input.returnUrl,
    ChoosePayment:     input.choosePayment,
    EncryptType:       "1",  // SHA256
  };

  if (input.orderResultUrl) params.OrderResultURL = input.orderResultUrl;
  if (input.clientBackUrl)  params.ClientBackURL   = input.clientBackUrl;

  params.CheckMacValue = calcCheckMacValue(params, hashKey, hashIV);
  return params;
}

// ─────────────────────────────────────────────────────────────
// 查詢訂單狀態（QueryTradeInfo）
// ─────────────────────────────────────────────────────────────

export type TradeStatus = "unpaid" | "paid" | "invalid" | "unknown";

export type QueryTradeResult = {
  status:       TradeStatus;
  paid:         boolean;
  ecpayTradeNo: string;
  paymentDate?: string;
  paymentType?: string;
};

export async function queryTradeInfo(merchantTradeNo: string): Promise<QueryTradeResult> {
  const { merchantId, hashKey, hashIV, baseUrl } = getConfig();
  const ts = String(Math.floor(Date.now() / 1000));

  const params: Record<string, string> = {
    MerchantID:      merchantId,
    MerchantTradeNo: merchantTradeNo,
    TimeStamp:       ts,
    PlatformID:      "",
  };
  params.CheckMacValue = calcCheckMacValue(params, hashKey, hashIV);

  const res = await fetch(`${baseUrl}/Cashier/QueryTradeInfo/V5`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:    new URLSearchParams(params).toString(),
  });

  const text   = await res.text();
  const parsed = Object.fromEntries(new URLSearchParams(text));

  const raw    = parsed.TradeStatus ?? "0";
  const status: TradeStatus =
    raw === "1" ? "paid" :
    raw === "0" ? "unpaid" :
    raw === "2" ? "invalid" : "unknown";

  return {
    status,
    paid:         status === "paid",
    ecpayTradeNo: parsed.TradeNo ?? "",
    paymentDate:  parsed.PaymentDate,
    paymentType:  parsed.PaymentType,
  };
}

// ─────────────────────────────────────────────────────────────
// 產生 checkout URL（QR code 內容）
// ─────────────────────────────────────────────────────────────

export function buildCheckoutUrl(merchantTradeNo: string): string {
  const { appUrl } = getConfig();
  return `${appUrl}/api/pos/payment/checkout/${merchantTradeNo}`;
}
