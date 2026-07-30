/**
 * Cron Route — 店長反價 24 小時逾時自動取消
 *
 * RS04 規格：「⚠️反價逾時：店長反價後業務員超過24小時未回報
 *              → 系統自動取消訂單，車輛→「可售」，通知業務員」
 *
 * 功能：掃描所有 discount_approval_requests 中 status='counter_offered'
 *       且 counter_offer_deadline_at 已逾時（< now）的申請：
 *       1. 申請 status → expired
 *       2. 連動 sales_orders：pending_discount_approval → cancelled
 *       3. 連動 new_car_inventory：frozen → displayed，解除 linked_sales_order_id
 *       4. 推播 sales_discount.decided 通知業務員
 *
 * 認證：Bearer CRON_TOKEN（timingSafeEqual 防 timing attack）
 * body（皆可選）：{ dry_run?: boolean, brand_id?: string }
 * 回傳：{ ok, dry_run, brand_id, scanned, expired, skipped }
 *
 * 建議排程（Zeabur cron）：
 *   每小時一次：POST /api/cron/sales-discount-counteroffer-timeout
 *   Headers: Authorization: Bearer <CRON_TOKEN>
 *            Content-Type: application/json
 *   Cron 表達式：0 * * * *
 *   說明：反價等待期限是 24 小時（可由 RS_M3 調整），每小時掃描一次已足夠精準。
 *
 * 防重複：只處理 status='counter_offered' 的申請，CAS 更新（.eq("status","counter_offered")）
 *          避免同一筆申請被重複處理（例如業務員剛好在 cron 執行同一秒回報）。
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
      { error: { code: "NOT_CONFIGURED", message: "CRON_TOKEN 未設定，反價逾時排程未啟用" } },
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

    // ── 1. 撈所有 counter_offered + counter_offer_deadline_at 逾時的申請（最多 200 筆）──
    let q = sb
      .from("discount_approval_requests")
      .select(
        "id, brand_id, order_id, quote_id, requested_by, counter_offer_pct, counter_offer_amount, counter_offer_deadline_at, metadata",
      )
      .eq("status", "counter_offered")
      .lt("counter_offer_deadline_at", now)
      .order("counter_offer_deadline_at", { ascending: true })
      .limit(200);

    if (brandId) q = q.eq("brand_id", brandId);

    const { data: overdue, error: overdueErr } = await q;
    if (overdueErr) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: overdueErr.message } },
        { status: 500 },
      );
    }

    let expired = 0;
    let skipped = 0;

    for (const row of overdue ?? []) {
      const overdueMinutes = Math.floor(
        (Date.now() - new Date(row.counter_offer_deadline_at as string).getTime()) / 60000,
      );

      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      const vehicleModelName = (meta.vehicle_model_name as string | undefined) ?? "—";
      const actionUrl = `${appUrl}/admin/approvals/discount`;

      if (!dryRun) {
        // 2. CAS：申請 status → expired
        const { error: expireErr } = await sb
          .from("discount_approval_requests")
          .update({
            status: "expired",
            decided_at: new Date().toISOString(),
            decision_reason: "業務員超過24小時未回報反價結果，系統自動取消",
          })
          .eq("id", row.id as string)
          .eq("status", "counter_offered"); // CAS 防重

        if (expireErr) {
          console.error(
            `[discount-counteroffer-timeout cron] 更新失敗 ${row.id}:`,
            expireErr.message,
          );
          skipped++;
          continue;
        }

        // 3. 連動 sales_orders + new_car_inventory
        if (row.order_id) {
          const { data: order } = await sb
            .from("sales_orders")
            .select("new_vehicle_id")
            .eq("id", row.order_id as string)
            .maybeSingle();

          await sb
            .from("sales_orders")
            .update({ status: "cancelled" })
            .eq("id", row.order_id as string)
            .eq("status", "pending_discount_approval"); // CAS 防重

          const newVehicleId = (order as { new_vehicle_id?: string | null } | null)
            ?.new_vehicle_id;
          if (newVehicleId) {
            await sb
              .from("new_car_inventory")
              .update({ status: "displayed", linked_sales_order_id: null })
              .eq("id", newVehicleId)
              .eq("status", "frozen"); // CAS 防重
          }
        }

        // 4. 推播通知業務員
        try {
          await notifications.dispatch({
            code: "sales_discount.decided",
            dealerId: row.brand_id as string,
            payload: {
              approvalId: row.id as string,
              quoteId: (row.quote_id as string) ?? "—",
              decision: "⏰ 反價逾時未回報，訂單已自動取消",
              reason: `店長反價後 24 小時內未回報客戶回應（已逾時 ${Math.floor(overdueMinutes / 60)} 小時）`,
              discountPct: String(row.counter_offer_pct ?? "—"),
              discountAmount: String(row.counter_offer_amount ?? ""),
              vehicleModelName,
              actionUrl,
            },
          });
        } catch (notifyErr) {
          console.error(
            `[discount-counteroffer-timeout cron] 通知失敗 ${row.id}:`,
            notifyErr,
          );
        }
      }

      expired++;
      console.log(
        `[discount-counteroffer-timeout cron] ${dryRun ? "[dry_run] " : ""}逾時取消申請 ${row.id} (逾時 ${overdueMinutes}min, brand=${row.brand_id}, order=${row.order_id ?? "none"})`,
      );
    }

    skipped = Math.max(0, (overdue?.length ?? 0) - expired);

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      brand_id: brandId ?? "all",
      scanned: overdue?.length ?? 0,
      expired,
      skipped,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[discount-counteroffer-timeout cron] 失敗:", msg);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 },
    );
  }
}
