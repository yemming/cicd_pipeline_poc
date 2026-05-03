import { NextRequest, NextResponse } from "next/server";
import { queryTradeInfo } from "@/lib/pos/ecpay-aio";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tradeNo: string }> },
) {
  const { tradeNo } = await params;

  // 先查 DB（有 callback 時比 ECPay poll 更快更新）
  const db = createServiceClient();
  const { data: order } = await db
    .from("pos_payment_orders")
    .select("status, ecpay_trade_no")
    .eq("merchant_trade_no", tradeNo)
    .single();

  if (order?.status === "paid") {
    return NextResponse.json({ paid: true, status: "paid", ecpayTradeNo: order.ecpay_trade_no });
  }

  // DB 還沒 paid → 直接問 ECPay
  try {
    const result = await queryTradeInfo(tradeNo);

    if (result.paid) {
      // 同步更新 DB
      await db.from("pos_payment_orders").update({
        status:        "paid",
        ecpay_trade_no: result.ecpayTradeNo,
        paid_at:       new Date().toISOString(),
      }).eq("merchant_trade_no", tradeNo);
    }

    return NextResponse.json({
      paid:         result.paid,
      status:       result.status,
      ecpayTradeNo: result.ecpayTradeNo,
      paymentDate:  result.paymentDate,
    });
  } catch {
    return NextResponse.json({ paid: false, status: "unknown" });
  }
}
