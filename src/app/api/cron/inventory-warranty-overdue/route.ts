/**
 * 保固索賠逾期掃描排程
 *
 * 功能：掃描 warranty_claims.status IN ('submitted','under_review') 且已逾 SLA（預設 21 天）的索賠單，
 *       在對應的 warranty_claims.metadata 標記逾期天數，並發送站內告警通知（work_order.status_changed 通道）。
 *
 * 2026-06-18 Russell 裁示：
 *   - 底層改掃 warranty_claims（單一事實表）
 *   - 逾期標記改寫 warranty_claims.metadata.overdue（不再寫 warranty_claim_receivables）
 *   - sla_days：warranty_claims 無此欄，一律用常數預設 21
 *
 * 認證：Bearer CRON_TOKEN（timingSafeEqual 防 timing attack）
 *       未設 CRON_TOKEN → 回 503；token 錯誤 → 401
 *
 * body（皆可選）：{ dry_run?: boolean, brand_id?: string }
 * 回傳：{ ok, dry_run, brand_id, flagged, skipped }
 */

import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return false;
  const bearer =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
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
          message: "CRON_TOKEN 未設定，保固索賠逾期排程未啟用",
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
  try {
    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (body.dry_run === true) dryRun = true;
    if (typeof body.brand_id === "string" && body.brand_id.length > 0) {
      brandId = body.brand_id;
    }
  } catch {
    // body 可選，略過
  }

  // ── service role：跨 brand 掃描，繞過 RLS ──
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: { code: "CONFIG_ERROR", message: "缺少 Supabase 設定" } },
      { status: 500 },
    );
  }
  const sb = createClient(supabaseUrl, serviceKey);

  try {
    const nowMs = Date.now();
    const appUrl = (
      process.env.APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://dealeros.zeabur.app"
    ).replace(/\/+$/, "");

    const SLA_DAYS = 21; // warranty_claims 無 sla_days 欄，固定常數

    // ── 1. 撈 warranty_claims：status IN (submitted, under_review) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let claimQuery = (sb as any)
      .from("warranty_claims")
      .select("id, brand_id, cl_no, ro_id, applied_amount, submitted_at, metadata")
      .in("status", ["submitted", "under_review"])
      .not("submitted_at", "is", null);

    if (brandId) {
      claimQuery = claimQuery.eq("brand_id", brandId);
    }

    const { data: claims, error: claimErr } = await claimQuery;
    if (claimErr) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: claimErr.message } },
        { status: 500 },
      );
    }

    let flagged = 0;
    let skipped = 0;

    for (const claim of claims ?? []) {
      const submittedAt = claim.submitted_at as string;
      const deadlineMs = new Date(submittedAt).getTime() + SLA_DAYS * 86400000;
      const isOverdue = nowMs > deadlineMs;

      if (!isOverdue) {
        skipped++;
        continue;
      }

      const overdueDays = Math.floor((nowMs - deadlineMs) / 86400000);
      const claimNo = claim.cl_no as string;
      const meta = (claim.metadata as Record<string, unknown> | null) ?? {};
      const itemLabel = (meta.item_label as string | null) ?? "—";

      console.log(
        `[warranty-overdue] ${dryRun ? "[dry_run] " : ""}逾期索賠 ${claimNo} brand=${claim.brand_id as string} 逾 ${overdueDays} 天`,
      );

      if (!dryRun) {
        // ── 2. 標記 warranty_claims.metadata.overdue（不再寫 warranty_claim_receivables）──
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any)
          .from("warranty_claims")
          .update({
            metadata: {
              ...meta,
              overdue: true,
              overdue_days: overdueDays,
              overdue_flagged_at: new Date().toISOString(),
            },
          })
          .eq("id", claim.id as string)
          .eq("brand_id", claim.brand_id as string);

        // ── 3. 發站內告警通知（借用 work_order.status_changed 通道）──
        try {
          await notifications.dispatch({
            code: "work_order.status_changed",
            dealerId: claim.brand_id as string,
            payload: {
              workOrderId: claim.id as string,
              workOrderNo: claimNo,
              previousStatus: "submitted",
              nextStatus: "overdue",
              subject: `⚠️ 保固索賠逾期｜${claimNo}`,
              description: `項目：${itemLabel}｜已過 SLA ${overdueDays} 天`,
              actionUrl: `${appUrl}/parts/warranty/ro-link?focus=${claim.id as string}`,
              brandId: claim.brand_id as string,
              overdue_days: overdueDays,
            },
          });
        } catch (notifyErr) {
          console.error(
            `[warranty-overdue] 索賠 ${claimNo} 通知失敗（不影響標記）`,
            notifyErr,
          );
        }
      }

      flagged++;
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      brand_id: brandId ?? "all",
      flagged,
      skipped,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[warranty-overdue] 失敗:", msg);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 },
    );
  }
}
