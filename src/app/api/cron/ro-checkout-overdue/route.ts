/**
 * 付費 RO 待結帳逾期升級通知排程
 *
 * 功能：掃描 ro_checkouts 中 status != 'completed' 且 created_at 超過
 *       RO_CHECKOUT_OVERDUE_DAYS 天的結帳單，發升級通知給店長（第二順位備援）。
 *       調整門檻：在 request body 帶 overdue_days 覆寫預設值。
 *
 * 認證：Bearer CRON_TOKEN（timingSafeEqual 防 timing attack）
 * body（皆可選）：{ dry_run?: boolean, brand_id?: string, overdue_days?: number }
 * 回傳：{ ok, dry_run, escalated: number, skipped: number, scanned: number }
 *
 * 啟用條件：
 *   1. 環境變數：CRON_TOKEN 設定
 *   2. GitHub Actions：.github/workflows/aftersales-cron.yml 的 ro-checkout-overdue job
 *      每日一次（UTC 01:00，台北時間 09:00 開工時間點）
 *
 * 防重升級：已升級的 checkout id 寫入 metadata.checkout_escalated_at，
 *          同一筆不重複升級（清掉或 completed 後才會再觸發）。
 *
 * Russell 6/17 裁示：「付費 RO 待結帳：加一個『待結帳超過 N 天』的升級通知給店長，
 *   作為 SA 疏忽時的備援，不需要新功能，技術上應該很快。」
 */

import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** 待結帳超過此天數才升級通知。Russell 裁示的 N 值，可透過 body.overdue_days 覆寫。 */
const RO_CHECKOUT_OVERDUE_DAYS = 7;

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
          message: "CRON_TOKEN 未設定，RO 待結帳逾期升級排程未啟用",
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
  let overdueDays = RO_CHECKOUT_OVERDUE_DAYS;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.dry_run === true) dryRun = true;
    if (typeof body.brand_id === "string" && body.brand_id.length > 0) brandId = body.brand_id;
    if (typeof body.overdue_days === "number" && body.overdue_days > 0) {
      overdueDays = body.overdue_days;
    }
  } catch {
    // body 可選，略過
  }

  // ── 使用 service role（跨 brand 掃描，需繞過 RLS） ──
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
    const thresholdMs = overdueDays * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(nowMs - thresholdMs).toISOString();
    const appUrl = (
      process.env.APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://dealeros.zeabur.app"
    ).replace(/\/+$/, "");

    // ── 1. 掃描未完結且超過門檻天數的結帳單（含 repair_orders.ro_code join） ──
    let coQuery = sb
      .from("ro_checkouts")
      .select(
        "id, checkout_no, brand_id, repair_order_id, status, fee_summary, fees_confirmed_at, metadata, created_at",
      )
      .neq("status", "completed")
      .lt("created_at", cutoffIso);
    if (brandId) {
      coQuery = coQuery.eq("brand_id", brandId);
    }
    const { data: checkoutRows, error: coErr } = await coQuery;
    if (coErr) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: coErr.message } },
        { status: 500 },
      );
    }

    let escalated = 0;
    let skipped = 0;

    for (const co of checkoutRows ?? []) {
      const meta = (co.metadata ?? {}) as Record<string, unknown>;

      // ── 防重升級：已標記 checkout_escalated_at 就跳過 ──
      if (meta.checkout_escalated_at) {
        skipped++;
        console.log(
          `[RO checkout overdue] 跳過 ${co.checkout_no as string}（已升級於 ${String(meta.checkout_escalated_at)}）`,
        );
        continue;
      }

      const overdueDaysActual = Math.floor(
        (nowMs - new Date(co.created_at as string).getTime()) / (24 * 60 * 60 * 1000),
      );

      // ── 2. 撈 ro_code 與客戶資訊 ──
      let roCode = "";
      let customerId: string | null = null;
      if (co.repair_order_id) {
        const { data: ro } = await sb
          .from("repair_orders")
          .select("ro_code, customer_id")
          .eq("id", co.repair_order_id as string)
          .maybeSingle();
        roCode = (ro as { ro_code?: string; customer_id?: string | null } | null)?.ro_code ?? "";
        customerId =
          (ro as { ro_code?: string; customer_id?: string | null } | null)?.customer_id ?? null;
      }

      let customerName: string | null = null;
      if (customerId) {
        const { data: cust } = await sb
          .from("customers")
          .select("name")
          .eq("id", customerId)
          .maybeSingle();
        customerName = (cust as { name?: string | null } | null)?.name ?? null;
      }

      // ── 3. 找店長（cross_admin 優先，fallback dept_manager） ──
      const { data: storeManagers } = await sb
        .from("employees")
        .select("user_id, name, email")
        .eq("brand_id", co.brand_id as string)
        .eq("is_cross_admin", true)
        .eq("is_active", true)
        .not("user_id", "is", null)
        .limit(3);

      let recipientEmployees = (storeManagers ?? []) as Array<{
        user_id: string | null;
        name: string | null;
        email: string | null;
      }>;
      if (recipientEmployees.length === 0) {
        const { data: deptManagers } = await sb
          .from("employees")
          .select("user_id, name, email")
          .eq("brand_id", co.brand_id as string)
          .eq("is_dept_manager", true)
          .eq("is_active", true)
          .not("user_id", "is", null)
          .limit(3);
        recipientEmployees = (deptManagers ?? []) as typeof recipientEmployees;
      }

      const feeSummary = (co.fee_summary ?? {}) as Record<string, unknown>;
      // fee_summary.payable 初始化預設值就是 0，不代表已確認；只有 SA 按下確認費用、
      // fees_confirmed_at 有值時，payable 才是真正結算過的金額，否則一律視為未確認。
      const payable =
        co.fees_confirmed_at && typeof feeSummary.payable === "number"
          ? feeSummary.payable
          : null;

      // 結帳頁 URL：直接指向該結帳單的結帳 wizard（/parts/aftersales/checkout/[id]，
      // id = ro_checkouts.id，由 getRoCheckoutById 解析）。
      // 註：舊版誤指 /parts/aftersales/workorders/{ro_id}?tab=checkout 是 placeholder 路由。
      const actionUrl = `${appUrl}/parts/aftersales/checkout/${co.id as string}`;

      if (!dryRun) {
        // ── 4. 推播通知 ──
        try {
          await notifications.dispatch({
            code: "ro_checkout.unpaid_overdue",
            payload: {
              checkoutNo: co.checkout_no as string,
              roCode,
              customerName: customerName ?? "（未知車主）",
              overdueDays: overdueDaysActual,
              payable: payable !== null ? String(payable) : "",
              actionUrl,
              brandId: co.brand_id as string,
            },
          });
        } catch (notifyErr) {
          console.error(
            `[RO checkout overdue] ${co.checkout_no as string} 通知失敗（不影響標記）`,
            notifyErr,
          );
        }

        // ── 5. 標記已升級（合併舊 metadata，保留其他欄位） ──
        await sb
          .from("ro_checkouts")
          .update({
            metadata: {
              ...meta,
              checkout_escalated_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", co.id as string);
      }

      escalated++;
      console.log(
        `[RO checkout overdue] ${dryRun ? "[dry_run] " : ""}升級 ${co.checkout_no as string}` +
          ` (RO ${roCode}, ${overdueDaysActual} 天未結, payable=${payable ?? "未確認"}` +
          `, 通知 ${recipientEmployees.length} 位店長)`,
      );
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      brand_id: brandId ?? "all",
      overdue_days: overdueDays,
      escalated,
      skipped,
      scanned: (checkoutRows ?? []).length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[RO checkout overdue] 失敗:", msg);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 },
    );
  }
}
