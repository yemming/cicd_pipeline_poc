/**
 * C-24 方案 B：售後休眠分級每日重算 endpoint
 *
 * 認證：Bearer CRON_TOKEN（仿 deploy/released 的 token 守門模式）。
 *   未設 CRON_TOKEN → 503（功能視為未啟用，避免裸跑）。
 * 呼叫者：Zeabur cron job 或外部排程（GitHub Actions 等），每日打一次 POST。
 * body（皆可選）：{ dry_run?: boolean, brand_id?: string }
 * 回傳：{ ok, dry_run, result: DormancyRecalcResult }
 */

import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { recalcAftersalesDormancy } from "@/domain/crm-aftersales-dormant-recalc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.CRON_TOKEN;
  if (!expected) return false;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (bearer.length !== expected.length) return false; // timingSafeEqual 要求等長
  return crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  if (!process.env.CRON_TOKEN) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "CRON_TOKEN 未設定，排程功能未啟用" } },
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
    // body 可選，解析失敗略過
  }

  try {
    const result = await recalcAftersalesDormancy({ dryRun, brandId });
    return NextResponse.json({ ok: true, dry_run: dryRun, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[C-24 cron] recalcAftersalesDormancy 失敗:", msg);
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: msg } },
      { status: 500 },
    );
  }
}
