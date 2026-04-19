import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { requireNotificationAdmin } from "./admin";

// API route 共用守衛：同時支援 admin cookie session 與 dev-only Bearer bypass

export function isDevBypass(req: NextRequest): boolean {
  const bypassToken = process.env.NOTIFICATION_DEV_BYPASS_TOKEN;
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return (
    process.env.NODE_ENV !== "production" &&
    !!bypassToken &&
    !!bearer &&
    bearer === bypassToken
  );
}

/**
 * 通過 → 不 throw；未登入 → 回 401 NextResponse；非 admin → 回 403。
 * 呼叫端模式：
 *   const guard = await ensureAdmin(req);
 *   if (guard instanceof NextResponse) return guard;
 */
export async function ensureAdmin(req: NextRequest): Promise<null | NextResponse> {
  if (isDevBypass(req)) return null;
  try {
    await requireNotificationAdmin();
    return null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg.includes("未登入") ? 401 : 403;
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: msg } }, { status });
  }
}

export function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * request body 解析 + zod 驗證。invalid 時直接回 400 NextResponse。
 * 呼叫端模式：
 *   const body = await parseBody(req, schema);
 *   if (body instanceof NextResponse) return body;
 */
export async function parseBody<T>(
  req: NextRequest,
  schema: ZodType<T>,
): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError("INVALID_JSON", "request body 不是合法 JSON", 400);
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return jsonError("INVALID_BODY", msg, 400);
  }
  return result.data;
}
