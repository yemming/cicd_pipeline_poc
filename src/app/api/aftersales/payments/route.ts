/**
 * GET /api/aftersales/payments
 *   — 修補四：售後收款記錄對外輸出端點（前台→中台數據通路）。
 *   — 供外部財務系統（正航 / ECPay / 門市收銀）對接，回傳標準格式 JSON。
 *
 * Query params：
 *   store_id   門店 id（organizations.id）
 *   date_from  起始（ISO，比對 paid_at）
 *   date_to    結束（ISO，比對 paid_at）
 *   prefix_p1  業務類型（MN/RP/WC/AC/PD/OT），不帶 = 全部
 *
 * 安全：由 middleware 守門（未登入 → 307 /login）；資料層 RLS 再按 brand 隔離。
 * 註：`payments` 表名已被會計 AP 模組佔用，售後收款資料表為 aftersales_payments。
 */

import { NextResponse } from "next/server";
import { listAftersalesPayments } from "@/domain/aftersales-payments";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { rows, total } = await listAftersalesPayments({
      store_id: searchParams.get("store_id"),
      date_from: searchParams.get("date_from"),
      date_to: searchParams.get("date_to"),
      prefix_p1: searchParams.get("prefix_p1"),
    });
    return NextResponse.json({
      success: true,
      count: rows.length,
      total,
      data: rows,
    });
  } catch (e) {
    console.error("[GET /api/aftersales/payments]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "查詢失敗", data: [] },
      { status: 500 },
    );
  }
}
