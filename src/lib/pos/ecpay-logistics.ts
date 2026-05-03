import crypto from "node:crypto";

// ─────────────────────────────────────────────────────────────
// 同 AIO 的 ecpayUrlEncode，但 hash 改用 MD5
// guides/06: 國內物流用 CMV-MD5（不是 SHA256）
// ─────────────────────────────────────────────────────────────
function ecpayUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/%20/g, "+")
    .replace(/~/g, "%7e")
    .replace(/'/g, "%27")
    .toLowerCase()
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");
}

export function calcCheckMacValueMD5(
  params: Record<string, string>,
  key: string,
  iv: string,
): string {
  const sorted = Object.entries(params).sort(([a], [b]) =>
    a.toLowerCase().localeCompare(b.toLowerCase()),
  );
  const raw = `HashKey=${key}&${sorted.map(([k, v]) => `${k}=${v}`).join("&")}&HashIV=${iv}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash("md5").update(encoded).digest("hex").toUpperCase();
}

// ─────────────────────────────────────────────────────────────
// 環境設定
// ─────────────────────────────────────────────────────────────
const LOGISTICS_BASE =
  process.env.ECPAY_ENV === "prod"
    ? "https://logistics.ecpay.com.tw"
    : "https://logistics-stage.ecpay.com.tw";

const MERCHANT_ID = process.env.ECPAY_LOGISTICS_MERCHANT_ID ?? "2000132";
const HASH_KEY    = process.env.ECPAY_LOGISTICS_HASH_KEY    ?? "5294y06JbISpM5x9";
const HASH_IV     = process.env.ECPAY_LOGISTICS_HASH_IV     ?? "v77hoKGq4kWxNNIS";

// 門市寄件預設（Ducati Taipei）
const SENDER_NAME     = process.env.ECPAY_SENDER_NAME     ?? "杜卡迪台北";
const SENDER_PHONE    = process.env.ECPAY_SENDER_PHONE    ?? "0227122211";
const SENDER_ZIP      = process.env.ECPAY_SENDER_ZIP      ?? "10491";
const SENDER_ADDRESS  = process.env.ECPAY_SENDER_ADDRESS  ?? "台北市中山區中山北路二段100號";

// ─────────────────────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────────────────────
function formatLogisticsDate(date: Date): string {
  const y   = date.getFullYear();
  const mo  = String(date.getMonth() + 1).padStart(2, "0");
  const d   = String(date.getDate()).padStart(2, "0");
  const h   = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const s   = String(date.getSeconds()).padStart(2, "0");
  return `${y}/${mo}/${d} ${h}:${min}:${s}`;
}

function nowTW(): Date {
  return new Date(Date.now() + 8 * 60 * 60 * 1000);
}

// pipe-separated or URL-encoded response → dict
function parsePipedResponse(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Try URL-encoded first (key=value&key=value)
  try {
    const u = Object.fromEntries(new URLSearchParams(text));
    if (u.RtnCode) return u;
  } catch { /* ignore */ }
  // pipe-separated: key=value|key=value
  for (const pair of text.split("|")) {
    const eq = pair.indexOf("=");
    if (eq > -1) {
      try {
        result[pair.slice(0, eq).trim()] = decodeURIComponent(pair.slice(eq + 1).trim());
      } catch {
        result[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
      }
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
export type CreateShipmentInput = {
  merchantTradeNo: string;
  goodsAmount:     number;
  goodsName:       string;
  receiverName:    string;
  receiverPhone:   string;
  receiverZipCode: string;
  receiverAddress: string;
  serverReplyUrl:  string;
};

export type ShipmentResult =
  | { success: true;  allPayLogisticsId: string; rtnMsg: string }
  | { success: false; error: string };

// ─────────────────────────────────────────────────────────────
// createShipment — 黑貓宅急便 HOME delivery
// ─────────────────────────────────────────────────────────────
export async function createShipment(input: CreateShipmentInput): Promise<ShipmentResult> {
  const params: Record<string, string> = {
    MerchantID:           MERCHANT_ID,
    MerchantTradeNo:      input.merchantTradeNo,
    MerchantTradeDate:    formatLogisticsDate(nowTW()),
    LogisticsType:        "HOME",
    LogisticsSubType:     "TCAT",
    GoodsAmount:          String(input.goodsAmount),
    GoodsName:            input.goodsName.slice(0, 50),
    SenderName:           SENDER_NAME,
    SenderCellPhone:      SENDER_PHONE,
    SenderZipCode:        SENDER_ZIP,
    SenderAddress:        SENDER_ADDRESS,
    ReceiverName:         input.receiverName,
    ReceiverCellPhone:    input.receiverPhone,
    ReceiverZipCode:      input.receiverZipCode,
    ReceiverAddress:      input.receiverAddress,
    Temperature:          "0001",  // 常溫
    Distance:             "00",    // 不限
    Specification:        "0001",  // 60cm
    ScheduledPickupTime:  "4",     // 不限時
    ScheduledDeliveryTime:"4",     // 不限時
    ServerReplyURL:       input.serverReplyUrl,
  };

  params.CheckMacValue = calcCheckMacValueMD5(params, HASH_KEY, HASH_IV);

  const body = new URLSearchParams(params).toString();
  const res = await fetch(`${LOGISTICS_BASE}/Express/Create`, {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text   = await res.text();
  const parsed = parsePipedResponse(text);

  if (parsed.RtnCode === "1") {
    return {
      success:           true,
      allPayLogisticsId: parsed.AllPayLogisticsID ?? "",
      rtnMsg:            parsed.RtnMsg ?? "成功",
    };
  }

  return {
    success: false,
    error:   `ECPay ${parsed.RtnCode ?? "?"}: ${parsed.RtnMsg ?? text.slice(0, 120)}`,
  };
}

// ─────────────────────────────────────────────────────────────
// verifyLogisticsCallback — 物流狀態通知驗簽
// ─────────────────────────────────────────────────────────────
export function verifyLogisticsCallback(
  params: Record<string, string>,
): boolean {
  const { CheckMacValue, ...rest } = params;
  if (!CheckMacValue) return false;
  const expected = calcCheckMacValueMD5(rest, HASH_KEY, HASH_IV);
  const a = Buffer.from(expected);
  const b = Buffer.from(CheckMacValue.toUpperCase());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
