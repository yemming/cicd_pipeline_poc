/**
 * Cron Route — 折扣審核逾時升級
 *
 * 功能：掃描所有 discount_approval_requests 中 status='pending'
 *       且 deadline_at 已逾時（< now）的申請：
 *       1. 查該 brand 的 discount_approval_backups（代理審核人設定）
 *       2. 若有代理審核人 → escalateDiscountApproval + 推 sales_discount.escalated 通知
 *       3. 若無代理審核人 → 僅通知主管群（sales_discount.escalated），不改 escalated_to
 *
 * 認證：Bearer CRON_TOKEN（timingSafeEqual 防 timing attack）
 * body（皆可選）：{ dry_run?: boolean, brand_id?: string }
 * 回傳：{ ok, dry_run, escalated, skipped, scanned }
 *
 * 建議排程（Zeabur cron）：
 *   每 5 分鐘：POST /api/cron/sales-discount-escalate
 *   Headers: Authorization: Bearer <CRON_TOKEN>
 *            Content-Type: application/json
 *   Cron 表達式：* /5 * * * *（去掉 * 前面的空格）
 *   說明：在店等候 10 分鐘內要通知，排程 5 分鐘確保有 ~5 分鐘餘裕；
 *         一般 30 分鐘期限也可以用每 10 分鐘一次，視 Zeabur plan 決定。
 *
 * 防重升級：已標記 escalated（status='escalated'）的不再處理；
 *            同一筆 pending 只升級一次（escalate 後 status 變 escalated）。
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
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (bearer.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  // ── 守門：CRON_TOKEN 未設 → 503 ──
  if (!process.env.CRON_TOKEN) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "CRON_TOKEN 未設定，折扣升級排程未啟用" } },
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
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.dry_run === true) dryRun = true;
    if (typeof body.brand_id === "string" && body.brand_id.length > 0) brandId = body.brand_id;
  } catch {
    // body 可選
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json(
      { error: { code: "CONFIG_ERROR", message: "缺少 Supabase 設定" } },
      { status: 500 },
    );
  }
  const sb = createClient(supabaseUrl, serviceKey);

  const appUrl = (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://dealeros.zeabur.app"
  ).replace(/\/+$/, "");

  try {
    const now = new Date().toISOString();

    // ── 1. 撈所有 pending + deadline_at 逾時的申請（最多 200 筆，避免單次太大）──
    let q = sb
      .from("discount_approval_requests")
      .select(
        "id, brand_id, quote_id, requested_by, requested_at, discount_pct, discount_amount, deadline_at, metadata",
      )
      .eq("status", "pending")
      .lt("deadline_at", now)
      .order("deadline_at", { ascending: true })
      .limit(200);

    if (brandId) q = q.eq("brand_id", brandId);

    const { data: overdue, error: overdueErr } = await q;
    if (overdueErr) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: overdueErr.message } },
        { status: 500 },
      );
    }

    let escalated = 0;
    let skipped = 0;

    for (const row of overdue ?? []) {
      const overdueMinutes = Math.floor(
        (Date.now() - new Date(row.deadline_at as string).getTime()) / 60000,
      );

      // ── 2. 查代理審核人（discount_approval_backups）──
      const { data: backups } = await sb
        .from("discount_approval_backups")
        .select("backup_approver_id, manager_id")
        .eq("brand_id", row.brand_id as string)
        .eq("is_active", true)
        .limit(5);

      // 取第一個有效代理審核人（未來可依 manager_id 匹配）
      const backupEntry = (backups ?? [])[0] as
        | { backup_approver_id: string; manager_id: string }
        | undefined;
      const backupUserId = backupEntry?.backup_approver_id ?? null;

      // ── 3. 取代理審核人名稱 ──
      let backupName: string | null = null;
      if (backupUserId) {
        const { data: emp } = await sb
          .from("employees")
          .select("name")
          .eq("user_id", backupUserId)
          .eq("brand_id", row.brand_id as string)
          .maybeSingle();
        backupName = (emp as { name?: string | null } | null)?.name ?? null;
      }

      // ── 4. 取 vehicle_model_name（在 metadata 裡）──
      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const vehicleModelName =
        (meta.vehicle_model_name as string | undefined) ?? "—";

      const actionUrl = `${appUrl}/admin/approvals/discount`;

      if (!dryRun) {
        // 4a. 若有代理審核人 → update status=escalated + escalated_to
        if (backupUserId) {
          const { error: escalErr } = await sb
            .from("discount_approval_requests")
            .update({
              status: "escalated",
              escalated_to: backupUserId,
              escalated_at: new Date().toISOString(),
            })
            .eq("id", row.id as string)
            .eq("status", "pending"); // CAS 防重
          if (escalErr) {
            console.error(
              `[discount-escalate cron] 升級失敗 ${row.id}:`,
              escalErr.message,
            );
            skipped++;
            continue;
          }
        }
        // 4b. 無代理審核人 → 不改 status，只通知

        // 5. 推播 sales_discount.escalated
        try {
          await notifications.dispatch({
            code: "sales_discount.escalated",
            payload: {
              approvalId: row.id as string,
              quoteId: (row.quote_id as string) ?? "—",
              discountPct: String(row.discount_pct ?? "—"),
              discountAmount: String(row.discount_amount ?? ""),
              vehicleModelName,
              overdueMinutes: String(overdueMinutes),
              escalatedToName: backupName ?? "（無代理審核人）",
              actionUrl,
            },
          });
        } catch (notifyErr) {
          console.error(
            `[discount-escalate cron] 通知失敗 ${row.id}:`,
            notifyErr,
          );
        }
      }

      escalated++;
      console.log(
        `[discount-escalate cron] ${dryRun ? "[dry_run] " : ""}升級申請 ${row.id} (逾時 ${overdueMinutes}min, brand=${row.brand_id}, backupUser=${backupUserId ?? "none"})`,
      );
    }

    skipped = Math.max(0, (overdue?.length ?? 0) - escalated);

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      brand_id: brandId ?? "all",
      scanned: overdue?.length ?? 0,
      escalated,
      skipped,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[discount-escalate cron] 失敗:", msg);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 },
    );
  }
}
