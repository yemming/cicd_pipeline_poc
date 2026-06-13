/**
 * RP5 主管授權 30 分鐘升級排程
 *
 * 【骨架就緒，待啟用】
 * 功能：掃描所有 repair_orders.metadata.approvals[] 中 status=pending
 *       且 requested_at 超過 30 分鐘的申請，發出升級通知給店長（第二順位）。
 *
 * 啟用條件：
 *   1. DB 側：metadata.approvals[] 存在（RP5 上線後已有）
 *   2. 環境變數：CRON_TOKEN 設定（仿 aftersales-dormancy 守門模式）
 *   3. Zeabur cron job：每 10 分鐘打一次 POST /api/cron/aftersales-approval-escalate
 *
 * 目前狀態：⚠️ SKELETON ONLY — 邏輯正確、認證守門健全，
 *   但 escalate 實體邏輯以 TODO 標記，部署後預設 503（CRON_TOKEN 未設則不跑）。
 *   啟用步驟：實作 TODO 段 → 設 CRON_TOKEN → Zeabur 加排程。
 *
 * 認證：Bearer CRON_TOKEN（timingSafeEqual 防 timing attack）
 * body（皆可選）：{ dry_run?: boolean, brand_id?: string, escalate_after_minutes?: number }
 * 回傳：{ ok, dry_run, escalated: number }
 */

import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (bearer.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  // ── 守門：CRON_TOKEN 未設 → 503（功能未啟用） ──
  if (!process.env.CRON_TOKEN) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_CONFIGURED",
          message: "CRON_TOKEN 未設定，RP5 授權升級排程未啟用（骨架就緒，待設定後啟用）",
        },
      },
      { status: 503 },
    );
  }
  if (!tokenOk(req)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "token 不正確" } },
      { status: 401 },
    );
  }

  let dryRun = false;
  let brandId: string | undefined;
  let escalateAfterMinutes = 30; // 預設 30 分鐘
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.dry_run === true) dryRun = true;
    if (typeof body.brand_id === "string" && body.brand_id.length > 0) brandId = body.brand_id;
    if (typeof body.escalate_after_minutes === "number" && body.escalate_after_minutes > 0) {
      escalateAfterMinutes = body.escalate_after_minutes;
    }
  } catch {
    // body 可選，略過
  }

  try {
    // ── TODO：實作升級邏輯 ──
    // 啟用步驟（約 2 小時工作量）：
    //
    // 1. 掃描 repair_orders：
    //    SELECT id, ro_code, metadata, brand_id FROM repair_orders
    //    WHERE metadata->'approvals' IS NOT NULL
    //      AND (brand_id = brandId 或不限)
    //      AND updated_at >= NOW() - INTERVAL '7 days'  -- 只看近期
    //
    // 2. 對每張 RO 的 metadata.approvals[] 逐筆過濾：
    //    - status === "pending"
    //    - new Date().getTime() - new Date(record.requested_at).getTime() > escalateAfterMinutes * 60 * 1000
    //    - metadata.approvals_escalated_at 無此 approval_id（避免重複升級）
    //
    // 3. 找出「店長」收件人（第二順位）：
    //    SELECT u.id, e.email, e.name FROM employees e
    //    JOIN user_assignments ua ON ua.user_id = e.user_id
    //    JOIN roles r ON r.id = ua.role_id
    //    WHERE r.code IN ('store_manager', 'cross_admin')
    //      AND e.brand_id = ro.brand_id
    //      AND e.is_active = true
    //
    // 4. 若 dry_run = false：
    //    - notifications.dispatch({ code: 'aftersales_approval.requested', ... })
    //      payload 加 escalated: true / escalate_target: 'store_manager'
    //    - 在 metadata.approvals_escalated_at[approval_id] 記錄升級時間（防重發）
    //
    // 5. 回傳 escalated count
    //
    // ── END TODO ──

    console.log(
      `[RP5 cron escalate] dry_run=${dryRun}, brand=${brandId ?? "all"}, threshold=${escalateAfterMinutes}m — 骨架執行，邏輯待實作`,
    );

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      escalated: 0,
      note: "骨架就緒，升級邏輯待實作（見 route.ts TODO 段）",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[RP5 cron escalate] 失敗:", msg);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 },
    );
  }
}
