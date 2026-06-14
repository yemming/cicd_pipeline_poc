/**
 * GET /api/inapp-notifications
 *   — 傳回當前登入 user 的站內通知清單（最多 50 筆）。
 *   — notification-bell 每 30s 輪詢此端點（+ Realtime 訂閱 RP8 升級版）。
 *   — 回應包含 user_id 供前端 Realtime 訂閱使用（不洩漏敏感資訊，user_id 已登入才有）。
 *
 * POST /api/inapp-notifications/read
 *   — 標記已讀（見 /read/route.ts）
 *
 * 安全：由 middleware / Supabase session 守門（未登入 → 空陣列）。
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listMyNotifications } from "@/domain/user-notifications";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const notifications = await listMyNotifications();
    return NextResponse.json({
      ok: true,
      data: notifications,
      // 提供 user_id 給 client 做 Realtime filter（只有登入狀態才有值）
      user_id: user?.id ?? null,
    });
  } catch (e) {
    console.error("[GET /api/inapp-notifications]", e);
    return NextResponse.json({ ok: false, data: [], user_id: null }, { status: 200 });
  }
}
