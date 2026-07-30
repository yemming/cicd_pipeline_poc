/**
 * RP5 主管授權 30 分鐘升級排程
 *
 * 功能：掃描所有 repair_orders.metadata.approvals[] 中 status=pending
 *       且 requested_at 超過 escalate_after_minutes（預設 30 分鐘）的申請，
 *       發出升級通知給店長（第二順位）。
 *
 * 認證：Bearer CRON_TOKEN（timingSafeEqual 防 timing attack）
 * body（皆可選）：{ dry_run?: boolean, brand_id?: string, escalate_after_minutes?: number }
 * 回傳：{ ok, dry_run, escalated: number, skipped: number }
 *
 * 啟用條件：
 *   1. 環境變數：CRON_TOKEN 設定
 *   2. Zeabur cron job：每 10 分鐘打一次 POST /api/cron/aftersales-approval-escalate
 *      Headers: Authorization: Bearer <CRON_TOKEN>
 *              Content-Type: application/json
 *
 * 防重升級：已升級的 approval_id 寫入 metadata.approvals_escalated[approval_id]，
 *          同一筆 pending 不重複升級（直到重置或 decided 後再次 pending 才觸發）。
 */

import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { notifications } from "@/lib/notifications";
import { SCENARIO_LABEL } from "@/domain/aftersales-approvals.constants";
import type { ApprovalRecord } from "@/domain/aftersales-approvals.constants";

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
          message: "CRON_TOKEN 未設定，RP5 授權升級排程未啟用",
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
  let escalateAfterMinutes = 30;
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
    const thresholdMs = escalateAfterMinutes * 60 * 1000;
    const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://dealeros.zeabur.app").replace(/\/+$/, "");

    // ── 1. 掃描有 pending approvals 的 RO（近 7 天；有 approvals 的比較少，避免全表掃） ──
    const sevenDaysAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
    let roQuery = sb
      .from("repair_orders")
      .select("id, ro_code, brand_id, customer_id, metadata")
      .not("metadata->approvals", "is", null)
      .gte("updated_at", sevenDaysAgo);
    if (brandId) {
      roQuery = roQuery.eq("brand_id", brandId);
    }
    const { data: roRows, error: roErr } = await roQuery;
    if (roErr) {
      return NextResponse.json(
        { error: { code: "DB_ERROR", message: roErr.message } },
        { status: 500 },
      );
    }

    let escalated = 0;
    let skipped = 0;

    for (const ro of roRows ?? []) {
      const meta = (ro.metadata ?? {}) as Record<string, unknown>;
      const approvals = Array.isArray(meta.approvals)
        ? (meta.approvals as ApprovalRecord[])
        : [];
      const escalatedMap = (meta.approvals_escalated ?? {}) as Record<string, string>;

      // ── 找出超時 pending（且未被升級過）──
      const toEscalate = approvals.filter((a) => {
        if (a.status !== "pending") return false;
        const age = nowMs - new Date(a.requested_at).getTime();
        if (age < thresholdMs) return false;
        if (escalatedMap[a.id]) return false; // 已升級，跳過
        return true;
      });

      if (toEscalate.length === 0) continue;

      // ── 2. 找店長（store_manager / cross_admin 或 is_dept_manager） ──
      const { data: storeManagers } = await sb
        .from("employees")
        .select("user_id, name, email")
        .eq("brand_id", ro.brand_id as string)
        .eq("is_cross_admin", true)
        .eq("is_active", true)
        .not("user_id", "is", null)
        .limit(3);

      // fallback：若無 cross_admin，找 is_dept_manager
      let recipientEmployees = (storeManagers ?? []) as Array<{
        user_id: string | null;
        name: string | null;
        email: string | null;
      }>;
      if (recipientEmployees.length === 0) {
        const { data: deptManagers } = await sb
          .from("employees")
          .select("user_id, name, email")
          .eq("brand_id", ro.brand_id as string)
          .eq("is_dept_manager", true)
          .eq("is_active", true)
          .not("user_id", "is", null)
          .limit(3);
        recipientEmployees = (deptManagers ?? []) as typeof recipientEmployees;
      }

      // 客戶名
      let customerName: string | null = null;
      if (ro.customer_id) {
        const { data: cust } = await sb
          .from("customers")
          .select("name")
          .eq("id", ro.customer_id as string)
          .maybeSingle();
        customerName = (cust as { name?: string | null } | null)?.name ?? null;
      }

      // ── 3. 升級通知 + 更新 metadata.approvals_escalated ──
      for (const approval of toEscalate) {
        const ageMin = Math.floor((nowMs - new Date(approval.requested_at).getTime()) / 60000);
        const scenarioLabel = SCENARIO_LABEL[approval.scenario] ?? approval.scenario;
        const actionUrl = `${appUrl}/parts/aftersales/approvals/${ro.id as string}?approval=${approval.id}`;

        if (!dryRun) {
          // 推播通知
          try {
            await notifications.dispatch({
              code: "aftersales_approval.requested",
              dealerId: ro.brand_id as string,
              payload: {
                approvalId: approval.id,
                scenario: approval.scenario,
                scenarioLabel,
                roCode: ro.ro_code as string ?? "",
                customerName: customerName ?? "（未知客戶）",
                saName: approval.requester_name ?? "SA",
                notes: approval.notes ?? "",
                context: JSON.stringify(approval.context ?? {}),
                actionUrl,
                brandId: ro.brand_id as string,
                // 升級旗標（讓模板可以特別強調）
                escalated: true,
                escalated_minutes: ageMin,
                escalate_target: "store_manager",
              },
            });
          } catch (notifyErr) {
            console.error(
              `[RP5 cron escalate] RO ${ro.ro_code} approval ${approval.id} 通知失敗（不影響標記）`,
              notifyErr,
            );
          }

          // 標記已升級（防重發）
          escalatedMap[approval.id] = new Date().toISOString();
          await sb
            .from("repair_orders")
            .update({
              metadata: {
                ...meta,
                approvals,
                approvals_escalated: escalatedMap,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", ro.id as string);
        }

        escalated++;
        console.log(
          `[RP5 cron escalate] ${dryRun ? "[dry_run] " : ""}升級 RO ${ro.ro_code} approval ${approval.id} (${scenarioLabel}, ${ageMin}min 未決, 通知 ${recipientEmployees.length} 位店長)`,
        );
      }

      // 未超時的視為 skipped
      skipped += approvals.filter((a) => a.status === "pending").length - toEscalate.length;
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      brand_id: brandId ?? "all",
      escalate_after_minutes: escalateAfterMinutes,
      escalated,
      skipped,
      scanned_ros: (roRows ?? []).length,
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
