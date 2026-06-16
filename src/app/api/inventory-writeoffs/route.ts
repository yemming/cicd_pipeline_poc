/**
 * Read-only API — 庫存報廢/損耗核銷查詢（給退料閉環差額核銷驗證）。
 * GET /api/inventory-writeoffs?latest=true&status=approved → { data: [...] }
 * 走 domain helper（listInventoryWriteoffs，已 order by created_at desc），RLS 依 brand 過濾。
 */
import { NextResponse, type NextRequest } from "next/server";
import { listInventoryWriteoffs } from "@/domain/writeoffs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status") ?? undefined;
  const latest = sp.get("latest") === "true";
  try {
    const { rows, totalCount } = await listInventoryWriteoffs(
      status ? { status } : {},
    );
    const data = latest ? rows.slice(0, 1) : rows;
    return NextResponse.json({ data, totalCount });
  } catch (e) {
    return NextResponse.json(
      { data: [], error: e instanceof Error ? e.message : "query failed" },
      { status: 500 },
    );
  }
}
