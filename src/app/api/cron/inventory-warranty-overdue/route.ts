/**
 * 保固索賠逾期掃描排程
 *
 * 功能：掃描 parts_warranty_claims.status='submitted' 且已逾 SLA（sla_days，預設 21 天）的索賠單，
 *       在對應的 warranty_claim_receivables 標記逾期天數，並發送站內告警通知（work_order.status_changed 通道）。
 *
 * 認證：Bearer CRON_TOKEN（timingSafeEqual 防 timing attack）
 *       未設 CRON_TOKEN → 回 503；token 錯誤 → 401
 *
 * body（皆可選）：{ dry_run?: boolean, brand_id?: string }
 * 回傳：{ ok, dry_run, brand_id, flagged, skipped }
 *
 * 啟用條件：
 *   1. 環境變數：CRON_TOKEN 設定
 *   2. Zeabur cron job：每日一次 POST /api/cron/inventory-warranty-overdue
 *      Headers: Authorization: Bearer <CRON_TOKEN>
 *              Content-Type: application/json
 *
 * 不衝突說明：
 *   - 現有「應用層逾期 filter」（`sendUrgentReminder`）是手動觸發，本 cron 是自動背景掃描，互不干擾。
 *   - 本 cron 不修改 parts_warranty_claims.status；只寫 warranty_claim_receivables.metadata 逾期標記。
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

    // ── 1. 撈所有 submitted 索賠單 ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let claimQuery = (sb as any)
      .from("parts_warranty_claims")
      .select("id, brand_id, claim_no, item_label, ro_id, apply_amount, submitted_at, sla_days")
      .eq("status", "submitted")
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
      const slaDays = typeof claim.sla_days === "number" ? claim.sla_days : 21;
      const deadlineMs =
        new Date(submittedAt).getTime() + slaDays * 86400000;
      const isOverdue = nowMs > deadlineMs;

      if (!isOverdue) {
        skipped++;
        continue;
      }

      const overdueDays = Math.floor((nowMs - deadlineMs) / 86400000);

      console.log(
        `[warranty-overdue] ${dryRun ? "[dry_run] " : ""}逾期索賠 ${claim.claim_no as string} brand=${claim.brand_id as string} 逾 ${overdueDays} 天`,
      );

      if (!dryRun) {
        // ── 2. 標記 warranty_claim_receivables.metadata.overdue ──
        // 先取現有 metadata，避免蓋掉其他 key
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: receivable } = await (sb as any)
          .from("warranty_claim_receivables")
          .select("metadata")
          .eq("claim_id", claim.id as string)
          .eq("brand_id", claim.brand_id as string)
          .maybeSingle();

        const existingMeta =
          (receivable?.metadata as Record<string, unknown> | null) ?? {};

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (sb as any)
          .from("warranty_claim_receivables")
          .update({
            metadata: {
              ...existingMeta,
              overdue: true,
              overdue_days: overdueDays,
              overdue_flagged_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("claim_id", claim.id as string)
          .eq("brand_id", claim.brand_id as string);

        // ── 3. 發站內告警通知（借用 work_order.status_changed 通道）──
        try {
          await notifications.dispatch({
            code: "work_order.status_changed",
            payload: {
              workOrderId: claim.id as string,
              workOrderNo: claim.claim_no as string,
              previousStatus: "submitted",
              nextStatus: "overdue",
              subject: `⚠️ 保固索賠逾期｜${claim.claim_no as string}`,
              description: `項目：${claim.item_label as string}｜已過 SLA ${overdueDays} 天`,
              actionUrl: `${appUrl}/parts/warranty/ro-link?focus=${claim.id as string}`,
              brandId: claim.brand_id as string,
              overdue_days: overdueDays,
            },
          });
        } catch (notifyErr) {
          console.error(
            `[warranty-overdue] 索賠 ${claim.claim_no as string} 通知失敗（不影響標記）`,
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
