import { NextRequest, NextResponse } from "next/server";
import { calcCheckMacValue } from "@/lib/pos/ecpay-aio";
import { createServiceClient } from "@/lib/supabase/service";

// ECPay AIO ReturnURL callback (server-to-server POST)
// 收到後更新 pos_payment_orders.status = 'paid'
// 前端 polling 會感知到 paid 狀態並呼叫 completeSale()

export async function POST(req: NextRequest) {
  const text   = await req.text();
  const parsed = Object.fromEntries(new URLSearchParams(text));

  // 驗證 CheckMacValue（防偽造）
  const { CheckMacValue, ...rest } = parsed;
  const expected = calcCheckMacValue(
    rest,
    process.env.ECPAY_AIO_HASH_KEY ?? "pwFHCqoQZGmho4w6",
    process.env.ECPAY_AIO_HASH_IV  ?? "EkRm7iFT261dpevs",
  );

  if (!CheckMacValue || CheckMacValue !== expected) {
    return new NextResponse("CheckMacValue mismatch", { status: 400 });
  }

  const merchantTradeNo = parsed.MerchantTradeNo;
  const tradeStatus     = parsed.RtnCode;   // '1' = 付款成功

  if (merchantTradeNo && tradeStatus === "1") {
    const db = createServiceClient();
    await db.from("pos_payment_orders").update({
      status:         "paid",
      ecpay_trade_no: parsed.TradeNo,
      paid_at:        new Date().toISOString(),
    }).eq("merchant_trade_no", merchantTradeNo);
  }

  // ECPay 要求回應精確的 ASCII "1|OK"，HTTP 200
  return new NextResponse("1|OK", {
    status:  200,
    headers: { "Content-Type": "text/plain" },
  });
}
