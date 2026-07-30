/**
 * Cron Route — 貸款申請逾時追蹤
 *
 * 功能：掃描所有 sales_orders 中 financing_status='pending_approval'
 *       且 financing_applied_at 超過 TIMEOUT_DAYS（預設 7 天）的訂單：
 *       1. 推播 financing.pending_timeout 通知給負責業務員（個人 LINE / 銷售群組）
 *       2. 寫 metadata.financing_timeout_notified_at 防重發（同一天只發一次）
 *
 * 認證：Bearer CRON_TOKEN（timingSafeEqual 防 timing attack）
 * body（皆可選）：{ dry_run?: boolean, brand_id?: string, timeout_days?: number }
 * 回傳：{ ok, dry_run, notified, skipped, scanned }
 *
 * 建議排程（Zeabur cron）：
 *   每天早上 09:00（台灣時間 = UTC 01:00）：
 *   POST /api/cron/financing-pending-timeout
 *   Headers: Authorization: Bearer <CRON_TOKEN>
 *            Content-Type: application/json
 *   Cron 表達式：0 1 * * *（UTC 01:00 = 台北 09:00）
 *   說明：貸款逾時是以「天」為單位，每日提醒一次即可；
 *         若同一訂單多天逾時，每天都提醒，直到狀態改變。
 */

import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_TIMEOUT_DAYS = 7;

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
      { error: { code: "NOT_CONFIGURED", message: "CRON_TOKEN 未設定，貸款逾時排程未啟用" } },
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
  let timeoutDays = DEFAULT_TIMEOUT_DAYS;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.dry_run === true) dryRun = true;
    if (typeof body.brand_id === "string" && body.brand_id.length > 0) brandId = body.brand_id;
    if (typeof body.timeout_days === "number" && body.timeout_days > 0) {
      timeoutDays = body.timeout_days;
    }
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
    const now = new Date();
    const cutoff = new Date(now.getTime() - timeoutDays * 24 * 60 * 60 * 1000).toISOString();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD

    // ── 1. 撈所有 financing_status='pending_approval' 且超過 timeout_days 的訂單 ──
    let q = sb
      .from("sales_orders")
      .select(
        "id, brand_id, order_no, customer_name, rs_name, vehicle_model_name, financing_applied_at, metadata, created_by",
      )
      .eq("financing_status", "pending_approval")
      .lt("financing_applied_at", cutoff)
      .order("financing_applied_at", { ascending: true })
      .limit(200);

    if (brandId) q = q.eq("brand_id", brandId);

    const { data: orders, error: ordersErr } = await q;
    if (ordersErr) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: ordersErr.message } },
        { status: 500 },
      );
    }

    let notified = 0;
    let skipped = 0;

    for (const order of orders ?? []) {
      const meta = (order.metadata ?? {}) as Record<string, unknown>;

      // ── 防重：今天已通知過就跳過 ──
      const lastNotifiedDate = meta.financing_timeout_notified_at as string | undefined;
      if (lastNotifiedDate?.startsWith(todayStr)) {
        skipped++;
        continue;
      }

      const appliedAt = new Date(order.financing_applied_at as string);
      const daysOverdue = Math.floor((now.getTime() - appliedAt.getTime()) / (24 * 60 * 60 * 1000));

      const actionUrl = `${appUrl}/sales/orders/${order.id as string}`;

      if (!dryRun) {
        // 2. 推播通知
        try {
          await notifications.dispatch({
            code: "financing.pending_timeout",
            dealerId: order.brand_id as string,
            payload: {
              orderId: order.id as string,
              orderNo: order.order_no as string,
              customerName: (order.customer_name as string) || "（未知客戶）",
              rsName: (order.rs_name as string) || "—",
              daysOverdue: String(daysOverdue),
              vehicleModelName: (order.vehicle_model_name as string) || "—",
              actionUrl,
              brandId: order.brand_id as string,
            },
          });
        } catch (notifyErr) {
          console.error(
            `[financing-timeout cron] 通知失敗 ${order.id}:`,
            notifyErr,
          );
          skipped++;
          continue;
        }

        // 3. 寫防重標記
        await sb
          .from("sales_orders")
          .update({
            metadata: {
              ...meta,
              financing_timeout_notified_at: now.toISOString(),
            },
            updated_at: now.toISOString(),
          })
          .eq("id", order.id as string);
      }

      notified++;
      console.log(
        `[financing-timeout cron] ${dryRun ? "[dry_run] " : ""}通知訂單 ${order.order_no} (${daysOverdue} 天, brand=${order.brand_id})`,
      );
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      brand_id: brandId ?? "all",
      timeout_days: timeoutDays,
      scanned: orders?.length ?? 0,
      notified,
      skipped,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[financing-timeout cron] 失敗:", msg);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 },
    );
  }
}
