/**
 * POST /api/inapp-notifications/read
 *   Body: { id?: string }  — 省略 id 或傳 "all" 表示全部標為已讀
 *
 * RP8：notification-bell 點選後呼叫此端點更新 status→acknowledged。
 */

import { NextRequest, NextResponse } from "next/server";
import { markRead, markAllRead } from "@/domain/user-notifications";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { id?: string };
    if (!body.id || body.id === "all") {
      await markAllRead();
    } else {
      await markRead(body.id);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[POST /api/inapp-notifications/read]", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
