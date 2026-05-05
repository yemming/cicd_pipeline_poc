/**
 * One-shot endpoint: seed nav_nodes from the static modules array.
 *
 * 用法：
 *   curl -X POST 'http://localhost:3000/api/admin/seed-nav-tree?brand=ducati'
 *
 * - 必須以 admin 身份 (FEEDBACK_ADMIN_EMAILS / NOTIFICATION_ADMIN_EMAILS)
 * - 會 wipe 該 brand 既有 nav_nodes 後重新灌入
 *
 * Phase 3 admin UI 上線後可刪除這個 route。
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { seedNavTreeFromStaticModules } from "@/lib/nav/seed";

export async function POST(req: NextRequest) {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "需要 admin 權限" }, { status: 403 });
  }

  const brand = req.nextUrl.searchParams.get("brand");
  if (!brand || !/^[a-z0-9_-]+$/.test(brand)) {
    return NextResponse.json(
      { error: "需要合法的 brand query param (e.g. ?brand=ducati)" },
      { status: 400 },
    );
  }

  try {
    const result = await seedNavTreeFromStaticModules(brand);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
