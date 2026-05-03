import { NextRequest, NextResponse } from "next/server";
import { buildAioParams, buildCheckoutUrl } from "@/lib/pos/ecpay-aio";
import { createServiceClient } from "@/lib/supabase/service";

function genTradeNo(): string {
  const d    = new Date();
  const ymd  = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `LP${ymd}${rand}`;  // LP + 8 + 4 = 14 chars, within AIO 20 char limit
}

type CreateBody = {
  totalAmount: number;
  itemName:    string;
  tradeDesc:   string;
};

export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateBody;

  if (!body.totalAmount || body.totalAmount <= 0) {
    return NextResponse.json({ error: "金額無效" }, { status: 400 });
  }

  const merchantTradeNo = genTradeNo();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  const formParams = buildAioParams({
    merchantTradeNo,
    totalAmount:   body.totalAmount,
    itemName:      body.itemName,
    tradeDesc:     body.tradeDesc || "Ducati Taipei POS",
    choosePayment: "LINEPAY",
    returnUrl:     `${appUrl}/api/pos/payment/return`,
  });

  // 將訂單暫存到 Supabase（checkout route 需要讀取 form_params）
  const db = createServiceClient();
  await db.from("pos_payment_orders").insert({
    merchant_trade_no: merchantTradeNo,
    form_params:       formParams,
    amount:            body.totalAmount,
    item_name:         body.itemName,
    status:            "pending",
  });

  return NextResponse.json({
    merchantTradeNo,
    checkoutUrl: buildCheckoutUrl(merchantTradeNo),
  });
}
