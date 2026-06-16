/**
 * Read-only API — 單一品項可用庫存量（給退料閉環自動化測試驗證庫存回補）。
 * GET /api/stock-balance?item_id=<uuid> → { item_id, available_qty }
 * 走 domain helper，RLS 依登入者 brand 過濾。需登入。
 */
import { NextResponse, type NextRequest } from "next/server";
import { getAvailableQtyForItem } from "@/domain/parts-return-requests";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const itemId = req.nextUrl.searchParams.get("item_id");
  if (!itemId) {
    return NextResponse.json({ error: "缺少 item_id" }, { status: 400 });
  }
  try {
    const available_qty = await getAvailableQtyForItem(itemId);
    return NextResponse.json({ item_id: itemId, available_qty });
  } catch (e) {
    return NextResponse.json(
      { item_id: itemId, available_qty: 0, error: e instanceof Error ? e.message : "query failed" },
      { status: 500 },
    );
  }
}
