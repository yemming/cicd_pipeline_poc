/**
 * PDF render helper — 啟 headless chromium 對 print route 截圖、回傳 PDF buffer。
 *
 * 用 @sparticuz/chromium（包好 deps 的 stripped Chromium）+ puppeteer-core。
 * Linux 容器（Zeabur）跑 OK；macOS 開發暫不支援（dev 用 window.print() 預覽就好）。
 *
 * 字體：chromium 不含 CJK，靠 print.css 的 Google Fonts @import 拉 Noto Sans TC。
 */

import chromium from "@sparticuz/chromium";
import puppeteer, { type Browser } from "puppeteer-core";

export type RenderPdfOptions = {
  /** 完整 URL（含 protocol + host），通常是 `${origin}/print/{slug}/{id}` */
  url: string;
  /** 把 user 的 auth cookie 帶過去，這樣 print route 的 server-side auth 才會通過 */
  cookieHeader?: string;
  /** A4 margin（mm），給 @page 用；不傳走 print.css 內的預設 */
  margin?: { top?: string; right?: string; bottom?: string; left?: string };
};

export async function renderPdf(opts: RenderPdfOptions): Promise<Buffer> {
  const browser: Browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
    defaultViewport: { width: 1240, height: 1754 }, // A4 @ 150dpi
  });

  try {
    const page = await browser.newPage();

    // 把 user 的 cookie 帶給 chromium → print route 的 supabase ssr cookie 認得出來
    if (opts.cookieHeader) {
      await page.setExtraHTTPHeaders({ cookie: opts.cookieHeader });
    }

    // networkidle0：等所有請求停 500ms（含 Google Fonts 拉完才開始渲染）
    const resp = await page.goto(opts.url, {
      waitUntil: "networkidle0",
      timeout: 30_000,
    });
    if (!resp || !resp.ok()) {
      throw new Error(
        `Failed to load print route ${opts.url}: HTTP ${resp?.status() ?? "no-response"}`,
      );
    }

    // 走 print media query — print.css 的 @media print 規則才會生效（thead repeat / no-print 隱藏 toolbar）
    await page.emulateMediaType("print");

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true, // 吃 print.css 的 @page { size: A4; margin: ... }
      // displayHeaderFooter 預設 false — chromium 不會印 URL / 頁碼 / 日期等 browser chrome
      displayHeaderFooter: false,
      margin: opts.margin
        ? {
            top: opts.margin.top ?? "15mm",
            right: opts.margin.right ?? "12mm",
            bottom: opts.margin.bottom ?? "18mm",
            left: opts.margin.left ?? "12mm",
          }
        : undefined,
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
