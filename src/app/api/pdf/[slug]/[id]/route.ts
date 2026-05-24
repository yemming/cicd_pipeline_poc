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
]);

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
  const origin = request.nextUrl.origin;
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
