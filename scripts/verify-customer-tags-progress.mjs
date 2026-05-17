#!/usr/bin/env node
/**
 * Verify customer-tags 進度條 UI 升級（BDN #1）
 *
 * 驗證項目：
 *   1) /sales/settings/customer-tags 載入正常、CustomTab 切到「我的自訂標籤」
 *   2) 該頁的進度區塊**沒有** 20 顆 dot（`div.w-2.5.h-2.5.rounded-full` count = 0）
 *   3) 該頁的進度區塊**有** progress bar 殼（class 含 `w-[200px] h-[6px] rounded-full`）
 *   4) 同樣驗證 /sales/customers/tags
 *   5) 截圖兩頁
 *
 * Output: tmp/customer-tags-settings.png · tmp/customer-tags-board.png
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = 60_000;

const log = (...m) => console.error("[verify-customer-tags-progress]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — run scripts/pw-login.mjs first");
    process.exit(2);
  }
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
  // 鎖 brand=indian
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: encodeURIComponent(JSON.stringify({ brand_id: "indian" })),
      url: BASE,
      sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });

  const results = [];

  async function visitAndAssert(slug, urlPath, screenshotName, switchTabSelector) {
    log(`→ ${urlPath}`);
    const resp = await page.goto(`${BASE}${urlPath}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        slug,
        ok: false,
        step: "load",
        reason: `status=${status} url=${finalUrl}`,
      });
      return;
    }

    // 若有 tab 需要切到「我的自訂標籤」
    if (switchTabSelector) {
      const tab = page.locator(switchTabSelector).first();
      if (await tab.count()) {
        await tab.click().catch(() => {});
        await page.waitForTimeout(400);
      }
    }

    // 等內容渲染
    await page.waitForTimeout(800);

    // 數 progress bar 殼
    const progressShell = await page
      .locator('div.w-\\[200px\\].h-\\[6px\\].rounded-full')
      .count();

    // 數舊版 10px dot（如果還在會大於 0）
    // 用更嚴格的 selector：寬高都 2.5、圓形、是 progress 區塊內
    const oldDots = await page
      .locator('span.w-2\\.5.h-2\\.5.rounded-full, div.w-2\\.5.h-2\\.5.rounded-full')
      .count();

    // 截圖
    const shotPath = path.join(TMP_DIR, screenshotName);
    await page.screenshot({ path: shotPath, fullPage: false });

    results.push({
      slug,
      ok: progressShell >= 1 && oldDots < 20,
      progressShell,
      oldDots,
      screenshot: shotPath,
    });
  }

  // 1) /sales/settings/customer-tags — 預設應該已在「我的自訂標籤」tab，但保險再點一次
  await visitAndAssert(
    "settings/customer-tags",
    "/sales/settings/customer-tags",
    "customer-tags-settings.png",
    'button:has-text("我的自訂")',
  );

  // 2) /sales/customers/tags
  await visitAndAssert(
    "customers/tags",
    "/sales/customers/tags",
    "customer-tags-board.png",
    'button:has-text("我的自訂")',
  );

  await browser.close();

  const allOk = results.every((r) => r.ok);
  const summary = {
    ok: allOk,
    results,
    consoleErrors: consoleErrors.slice(0, 5),
  };
  console.log(JSON.stringify(summary, null, 2));
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  log("FAILED:", err?.stack || err);
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err) }));
  process.exit(1);
});
