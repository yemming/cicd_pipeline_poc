import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

const ECPAY_CHECKOUT =
  process.env.ECPAY_ENV === "prod"
    ? "https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5"
    : "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tradeNo: string }> },
) {
  const { tradeNo } = await params;

  const db = createServiceClient();
  const { data } = await db
    .from("pos_payment_orders")
    .select("form_params, status, expires_at")
    .eq("merchant_trade_no", tradeNo)
    .single();

  if (!data) {
    return new NextResponse("訂單不存在", { status: 404 });
  }
  if (data.status === "paid") {
    return new NextResponse(
      `<html><body style="font-family:sans-serif;text-align:center;padding:60px">
        <h2 style="color:#16a34a">✓ 付款已完成</h2>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } },
    );
  }
  if (new Date(data.expires_at) < new Date()) {
    return new NextResponse("訂單已過期", { status: 410 });
  }

  // 產生自動送出的 form → ECPay AIO
  const formParams = data.form_params as Record<string, string>;
  const inputs = Object.entries(formParams)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${String(v).replace(/"/g, "&quot;")}">`)
    .join("\n");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Ducati Taipei 付款中...</title>
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center;
           height: 100vh; font-family: sans-serif; background: #f8f8f8; }
    .card { background: #fff; padding: 32px; border-radius: 16px; text-align: center;
            box-shadow: 0 4px 24px rgba(0,0,0,.1); }
    .logo { font-size: 28px; font-weight: 900; color: #CC0000; margin-bottom: 8px; }
    .msg  { color: #555; font-size: 14px; }
    .spin { margin: 20px auto; width: 36px; height: 36px; border: 4px solid #eee;
            border-top-color: #CC0000; border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">DUCATI</div>
    <p class="msg">正在導向付款頁面…</p>
    <div class="spin"></div>
    <form id="f" action="${ECPAY_CHECKOUT}" method="POST">
      ${inputs}
    </form>
  </div>
  <script>document.getElementById('f').submit();</script>
</body>
</html>`;

  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
