/**
 * GET /api/inapp-notifications
 *   — 傳回當前登入 user 的站內通知清單（最多 50 筆）。
 *   — notification-bell 每 30s 輪詢此端點（Realtime 待 Phase 2 補）。
 *
 * POST /api/inapp-notifications/read
 *   — 標記已讀（見 /read/route.ts）
 *
 * 安全：由 middleware / Supabase session 守門（未登入 → 空陣列）。
 */

import { NextResponse } from "next/server";
import { listMyNotifications } from "@/domain/user-notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const notifications = await listMyNotifications();
    return NextResponse.json({ ok: true, data: notifications });
  } catch (e) {
    console.error("[GET /api/inapp-notifications]", e);
    return NextResponse.json({ ok: false, data: [] }, { status: 200 });
  }
}
