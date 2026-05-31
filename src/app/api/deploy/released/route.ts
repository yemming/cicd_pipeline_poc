// CI/CD pipeline 出口訊號：Zeabur 部署成功後，由 scripts/notify-deploy.mjs 呼叫此 endpoint，
// 把「本輪更新摘要」經 Notification Hub 推到開發群組（LINE / Google Chat）。
//
// 認證：Bearer DEPLOY_NOTIFY_TOKEN（**production 也生效**，不同於 notifications/http.ts 的
//      NOTIFICATION_DEV_BYPASS_TOKEN〔僅 dev〕）。token 未設定時一律 503，避免裸奔。
//
// 為什麼是 endpoint 而非 script 直接送：LINE token + service-role 金鑰都在部署環境（Zeabur env），
// 集中一處；VPS 上的 script 只需 APP_URL + token，不碰機密。

import crypto from "crypto";
import { NextResponse, type NextRequest } from "next/server";

import { notifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function tokenOk(req: NextRequest): boolean {
  const expected = process.env.DEPLOY_NOTIFY_TOKEN;
  if (!expected) return false; // 未設定 → 視為未啟用，呼叫端會收到 503
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (bearer.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(bearer), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  if (!process.env.DEPLOY_NOTIFY_TOKEN) {
    return NextResponse.json(
      { error: { code: "NOT_CONFIGURED", message: "DEPLOY_NOTIFY_TOKEN 未設定，部署通知未啟用" } },
      { status: 503 },
    );
  }
  if (!tokenOk(req)) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "token 不正確" } },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "request body 不是合法 JSON" } },
      { status: 400 },
    );
  }

  const str = (k: string, fallback = "") =>
    typeof body[k] === "string" && (body[k] as string).length > 0 ? (body[k] as string) : fallback;

  const summary = str("summary");
  if (!summary) {
    return NextResponse.json(
      { error: { code: "INVALID_BODY", message: "summary 必填" } },
      { status: 400 },
    );
  }

  const result = await notifications.dispatch({
    code: "deploy.released",
    payload: {
      version: str("version", "—"),
      summary,
      changeCount: str("changeCount", "—"),
      deployedAt: str("deployedAt", ""),
      url: str("url", "https://dealeros.zeabur.app/"),
    },
  });

  return NextResponse.json({ ok: true, result });
}
