/**
 * Read-only API — 退料待確認記錄查詢（給自動化測試 / Tab B 補抓用）。
 * 走 domain helper（listReturnRequests），RLS 依登入者 brand 過濾。
 * 需登入（middleware 守門，非 publicPath）。
 */
import { NextResponse, type NextRequest } from "next/server";
import {
  listReturnRequests,
  type ReturnRequestFilter,
} from "@/domain/parts-return-requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const filter: ReturnRequestFilter = {};
  const sourceRo = sp.get("source_ro_id");
  const status = sp.get("status");
  const sourceType = sp.get("source_type");
  if (sourceRo) filter.source_ro_id = sourceRo;
  if (status === "pending" || status === "confirmed" || status === "overdue")
    filter.status = status;
  if (sourceType)
    filter.source_type = sourceType as ReturnRequestFilter["source_type"];

  try {
    const data = await listReturnRequests(filter);
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { data: [], error: e instanceof Error ? e.message : "query failed" },
      { status: 500 },
    );
  }
}
