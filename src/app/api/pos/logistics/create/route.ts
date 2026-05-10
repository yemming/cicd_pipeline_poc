import { NextRequest, NextResponse } from "next/server";
import { createShipment } from "@/lib/pos/ecpay-logistics";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveScope } from "@/lib/scope/active-scope";
function genLogisticsTradeNo(): string {
  const d    = new Date();
  const ymd  = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `SH${ymd}${rand}`;  // 10 chars, within 20-char limit
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    transactionId,
    goodsAmount,
    goodsName,
    receiverName,
    receiverPhone,
    receiverZipCode,
    receiverAddress,
  } = body as {
    transactionId?: string;
    goodsAmount:    number;
    goodsName:      string;
    receiverName:   string;
    receiverPhone:  string;
    receiverZipCode:string;
    receiverAddress:string;
  };

  const merchantTradeNo = genLogisticsTradeNo();
  const serverReplyUrl  = `${process.env.APP_URL ?? "https://example.com"}/api/pos/logistics/notify`;

  const result = await createShipment({
    merchantTradeNo,
    goodsAmount,
    goodsName,
    receiverName,
    receiverPhone,
    receiverZipCode,
    receiverAddress,
    serverReplyUrl,
  });

  const db = createServiceClient();
  await db.from("pos_shipments").insert({
    transaction_id:      transactionId ?? null,
    merchant_trade_no:   merchantTradeNo,
    logistics_type:      "HOME",
    logistics_sub_type:  "TCAT",
    all_pay_logistics_id: result.success ? result.allPayLogisticsId : null,
    ecpay_status:        result.success ? "created" : "failed",
    ecpay_error:         result.success ? null : result.error,
    receiver_name:       receiverName,
    receiver_phone:      receiverPhone,
    receiver_address:    receiverAddress,
    receiver_zip:        receiverZipCode,
    goods_name:          goodsName,
    goods_amount:        goodsAmount,
    brand_id:            (await getActiveScope()).brand_id,
  });

  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    success:           true,
    allPayLogisticsId: result.allPayLogisticsId,
    merchantTradeNo,
  });
}
