import type { NextRequest } from "next/server";

import { renderPdf } from "@/lib/pdf/render";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

// puppeteer + chromium 不能跑在 edge runtime（需要 node binary execution）
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF 通常 1-3 秒、複雜單可能更久；給 60s 上限
export const maxDuration = 60;

/**
 * 通用 PDF API — 對 `/print/{slug}/{id}` 截圖回傳 PDF。
 *
 * Slug 走 whitelist，避免 user 構造任意 URL 灌進來。
 */
const ALLOWED_SLUGS = new Set([
  "purchase-order",
  "sales-order",
  "quotation",
  "repair-order",
  "stock-issue",
  "stock-transfer",
  "stock-receipt",
  "usedcar-evaluation",
  "import-po",
  "landed-cost-statement",
  "vehicle-cost-card",
  "group-quarterly-report",
]);

/**
 * 解析「外部可達」的 app origin，給 server-side chromium goto 自己的 print route 用。
 * 優先序：APP_URL（明確設定）→ x-forwarded-*（reverse proxy 帶的真實外部 host/proto）
 * → nextUrl.origin（本機 dev，無 proxy）。
 */
function resolveAppOrigin(request: NextRequest): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const fwdHost = request.headers.get("x-forwarded-host");
  const host = fwdHost ?? request.headers.get("host");
  if (host && !host.startsWith("localhost")) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${host}`;
  }

  return request.nextUrl.origin;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;

  if (!ALLOWED_SLUGS.has(slug)) {
    return new Response(`Unknown print slug: ${slug}`, { status: 400 });
  }

  // 基本 auth 攔截 — 細權限交給 /print/{slug}/{id}/page.tsx 自己判斷
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  // ⚠️ 不能用 request.nextUrl.origin —— Zeabur 反代後內部 Next 收到的是
  // https://localhost:8080（proxy 把外部 host/proto 換掉），chromium 去 goto 會撞
  // ERR_SSL_PROTOCOL_ERROR（內部 8080 不講 TLS）。
  // 正解：優先吃明確的 APP_URL（全站既有慣例），其次用 proxy 真正帶過來的
  // x-forwarded-* 重建外部 origin，最後才 fallback 到 nextUrl.origin（本機 dev 用）。
  const origin = resolveAppOrigin(request);
  const url = `${origin}/print/${slug}/${id}`;

  try {
    const pdf = await renderPdf({ url, cookieHeader });
    // 包成 Blob 避開 TS 對 BodyInit 不收 Buffer/Uint8Array 的型別坑
    const blob = new Blob([new Uint8Array(pdf)], { type: "application/pdf" });
    return new Response(blob, {
      headers: {
        "Content-Type": "application/pdf",
        // inline → 瀏覽器內建 PDF reader 開（user 可從 reader 列印 / 存檔）
        "Content-Disposition": `inline; filename="${slug}-${id.slice(0, 8)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[api/pdf] render failed:", e);
    return new Response(`PDF render failed: ${(e as Error).message}`, {
      status: 500,
    });
  }
}
