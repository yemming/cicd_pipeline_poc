/**
 * GET /api/my-todos
 *   — 傳回當前登入 user 的今日待辦清單（最多 50 筆）。
 *   — 由 TodoBadge 元件每 60s 輪詢此端點。
 *
 * 安全：由 middleware 守門（未登入 → 空陣列）。
 */

import { NextResponse } from "next/server";
import { getMyTodos } from "@/domain/my-todos";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const todos = await getMyTodos();
    return NextResponse.json({ ok: true, data: todos, count: todos.length });
  } catch (e) {
    console.error("[GET /api/my-todos]", e);
    return NextResponse.json({ ok: false, data: [], count: 0 }, { status: 200 });
  }
}
