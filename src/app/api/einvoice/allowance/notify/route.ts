// 綠界 B2C AllowanceByCollegiate（線上折讓）callback receiver
//
// 規格：
//   - HTTP POST application/x-www-form-urlencoded
//   - CheckMacValue **使用 MD5**（B2C 發票中唯一一支用 MD5 的 Callback）
//   - 回應必須是純文字 "1|OK"，HTTP 200，Content-Type: text/plain
//   - 重試最多 4 次，必須冪等
//
// 參考：~/.claude/skills/ecpay/guides/04-invoice-b2c.md §折讓回應處理

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

// AIO/CMV 風格 URL encode（.NET 規格）— 與 AES URL encode 不同
function ecpayUrlEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/%20/g, "+")
    .replace(/'/g, "%27")
    .replace(/!/g, "%21")
    .replace(/~/g, "%7e")
    .toLowerCase()
    .replace(/%2d/g, "-")
    .replace(/%5f/g, "_")
    .replace(/%2e/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2a/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")");
}

function calcCheckMacMD5(
  params: Record<string, string>,
  hashKey: string,
  hashIV: string,
): string {
  const filtered = Object.entries(params).filter(([k]) => k !== "CheckMacValue");
  filtered.sort(([a], [b]) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const joined = filtered.map(([k, v]) => `${k}=${v}`).join("&");
  const raw = `HashKey=${hashKey}&${joined}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(raw);
  return crypto.createHash("md5").update(encoded).digest("hex").toUpperCase();
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: NextRequest) {
  const hashKey = process.env.ECPAY_INVOICE_HASH_KEY ?? "ejCk326UnaZWKisg";
  const hashIV  = process.env.ECPAY_INVOICE_HASH_IV  ?? "q9jcZX8Ib9LM8wYk";

  let params: Record<string, string>;
  try {
    const fd = await req.formData();
    params = {};
    for (const [k, v] of fd.entries()) {
      params[k] = typeof v === "string" ? v : "";
    }
  } catch (err) {
    console.error("[einvoice/allowance/notify] parse formData failed:", err);
    return new NextResponse("0|InvalidPayload", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const received = params["CheckMacValue"];
  if (!received) {
    console.warn("[einvoice/allowance/notify] missing CheckMacValue");
    return new NextResponse("0|MissingCheckMacValue", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const computed = calcCheckMacMD5(params, hashKey, hashIV);
  if (!timingSafeEqual(computed, received.toUpperCase())) {
    console.warn("[einvoice/allowance/notify] CheckMacValue mismatch", {
      expected: computed,
      received: received,
    });
    return new NextResponse("0|CheckMacValueFail", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  // 驗章通過 → 更新折讓單狀態
  // 綠界欄位（依官方文件）：
  //   IA_Allow_No (折讓單號) / IA_Invoice_No (原發票號) / IA_Date / RtnCode / RtnMsg
  //   IIS_Remain_Allowance_Amt (折讓後剩餘可折讓金額)
  const allowanceNo = params["IA_Allow_No"] ?? "";
  const invoiceNo   = params["IA_Invoice_No"] ?? "";
  const rtnCode     = params["RtnCode"] ?? "";
  const rtnMsg      = params["RtnMsg"] ?? "";
  const issuedAt    = params["IA_Date"] ?? new Date().toISOString();

  if (!allowanceNo || !invoiceNo) {
    console.warn("[einvoice/allowance/notify] missing IA_Allow_No or IA_Invoice_No", params);
    return new NextResponse("1|OK", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const db = createServiceClient();
  const isSuccess = rtnCode === "1";

  // 找到對應折讓單（線上折讓送出時 ecpay_allowance_no = null + is_online=true）
  // 用 einvoice 的 ecpay_invoice_no + status='pending' + is_online=true 找最近一筆
  const { data: einv } = await db
    .from("einvoices")
    .select("id")
    .eq("ecpay_invoice_no", invoiceNo)
    .maybeSingle();

  if (!einv) {
    console.warn("[einvoice/allowance/notify] einvoice not found for invoiceNo:", invoiceNo);
    return new NextResponse("1|OK", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  // 找最近一筆 pending 的線上折讓
  const { data: pendingAllow } = await db
    .from("einvoice_allowances")
    .select("id")
    .eq("einvoice_id", einv.id)
    .eq("is_online", true)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pendingAllow) {
    console.warn("[einvoice/allowance/notify] no pending online allowance for invoice:", invoiceNo);
    return new NextResponse("1|OK", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  // 冪等：若已有同樣 ecpay_allowance_no 不重複更新
  await db.from("einvoice_allowances").update({
    ecpay_allowance_no: allowanceNo,
    status:             isSuccess ? "issued" : "failed",
    ecpay_error_msg:    isSuccess ? null     : `RtnCode ${rtnCode}: ${rtnMsg}`,
    issued_at:          isSuccess ? issuedAt : null,
  }).eq("id", pendingAllow.id);

  // 折讓成功 → 更新主檔狀態
  if (isSuccess) {
    await db.from("einvoices").update({ ecpay_status: "allowanced" }).eq("id", einv.id);
  }

  return new NextResponse("1|OK", { status: 200, headers: { "Content-Type": "text/plain" } });
}
