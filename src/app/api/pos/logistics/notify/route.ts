import { NextRequest, NextResponse } from "next/server";
import { verifyLogisticsCallback } from "@/lib/pos/ecpay-logistics";
import { createServiceClient } from "@/lib/supabase/service";

// ECPay 國內物流狀態通知 (server-to-server Form POST)
// 必須回應純文字 "1|OK"（MD5 驗簽）
export async function POST(req: NextRequest) {
  const text   = await req.text();
  const params = Object.fromEntries(new URLSearchParams(text));

  if (!verifyLogisticsCallback(params)) {
    return new NextResponse("CheckMacValue mismatch", { status: 400 });
  }

  const { AllPayLogisticsID, MerchantTradeNo, RtnCode, RtnMsg } = params;

  // 已取貨：7-11=2067, 全家/萊爾富/OK=3022
  const pickedUp = RtnCode === "2067" || RtnCode === "3022";
  // 到店：3018
  const atStore  = RtnCode === "3018";

  if (MerchantTradeNo) {
    const db = createServiceClient();
    const newStatus = pickedUp ? "picked_up" : atStore ? "created" : "created";
    await db.from("pos_shipments").update({
      all_pay_logistics_id: AllPayLogisticsID,
      ecpay_status:         newStatus,
      ecpay_error:          RtnCode !== "300" && RtnCode !== "3018" && !pickedUp
        ? `${RtnCode}: ${RtnMsg}`
        : null,
    }).eq("merchant_trade_no", MerchantTradeNo);
  }

  return new NextResponse("1|OK", {
    status:  200,
    headers: { "Content-Type": "text/plain" },
  });
}
