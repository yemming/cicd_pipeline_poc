// Playwright CLI 驗證 /sales/funnel（v5 升級版）
//
// 1. 假設外部已起好 dev server（port 3005）
// 2. 載入 pw-state.json（既有 dev session）
// 3. 載 /sales/funnel、networkidle、斷言 status 200、無 console error
// 4. 驗證關鍵 UI：視角 toggle / RS 下拉 / 期間 toggle / Layer 1-3 KPI / 漏斗 / RS 比較表 / 客群畫像
// 5. 截圖到 /tmp/sales-funnel-verify.png

import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://localhost:3005";
const STATE_PATH = resolve(__dirname, ".pw-state.json");
const SCREENSHOT = "/tmp/sales-funnel-verify.png";

const consoleErrors = [];
const pageErrors = [];

const log = (...a) => console.log("[verify]", ...a);

const browser = await chromium.launch({ headless: true });
const ctxOpts = { viewport: { width: 1440, height: 900 } };
if (existsSync(STATE_PATH)) {
  ctxOpts.storageState = STATE_PATH;
  log("using pw-state from", STATE_PATH);
}
const ctx = await browser.newContext(ctxOpts);
const page = await ctx.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => pageErrors.push(err.message));

let ok = true;
try {
  log("nav to", `${BASE}/sales/funnel`);
  page.setDefaultTimeout(60000);
  const resp = await page.goto(`${BASE}/sales/funnel`, { waitUntil: "networkidle", timeout: 90000 });
  const status = resp?.status();
  log("status:", status, "url:", page.url());

  if (status && status >= 400) {
    console.error(`[FAIL] HTTP ${status}`);
    ok = false;
  }

  if (page.url().includes("/login")) {
    console.error("[FAIL] redirected to /login — pw-state expired");
    ok = false;
  }

  // 等 board 渲染（沿用 sales-manager-funnel 的 testid）
  await page.waitForSelector('[data-testid="sales-manager-funnel-page"]', { timeout: 30000 });
  log("✓ board rendered");

  const checks = {
    "role toggle (manager)":  await page.locator('[data-testid="sales-manager-funnel-role-manager"]').count(),
    "role toggle (personal)": await page.locator('[data-testid="sales-manager-funnel-role-personal"]').count(),
    "rs select":              await page.locator('[data-testid="sales-manager-funnel-rs-select"]').count(),
    "period month":           await page.locator('[data-testid="sales-manager-funnel-period-month"]').count(),
    "period quarter":         await page.locator('[data-testid="sales-manager-funnel-period-quarter"]').count(),
    "period year":            await page.locator('[data-testid="sales-manager-funnel-period-year"]').count(),
    "layer1 kpis (>=1)":      await page.locator('[data-testid="sales-manager-funnel-layer1-kpi"]').count(),
    "layer2 build":           await page.locator('[data-testid="sales-manager-funnel-layer2-build"]').count(),
    "layer2 trial":           await page.locator('[data-testid="sales-manager-funnel-layer2-trial"]').count(),
    "layer2 quote":           await page.locator('[data-testid="sales-manager-funnel-layer2-quote"]').count(),
    "layer2 order":           await page.locator('[data-testid="sales-manager-funnel-layer2-order"]').count(),
    "layer3 kpis (>=1)":      await page.locator('[data-testid="sales-manager-funnel-layer3-kpi"]').count(),
    "funnel section":         await page.locator('[data-testid="sales-manager-funnel-funnel"]').count(),
    "rs compare table":       await page.locator('[data-testid="sales-manager-funnel-rs-table"]').count(),
    "tag groups":             await page.locator('[data-testid="sales-manager-funnel-tags"]').count(),
    "phase 2 section":        await page.locator('[data-testid="sales-manager-funnel-phase2"]').count(),
  };

  console.log("\n[checks]");
  for (const [k, v] of Object.entries(checks)) {
    const passed = v > 0;
    console.log(`  ${passed ? "✓" : "✗"} ${k}: ${v}`);
    if (!passed) ok = false;
  }

  // breadcrumb 應該顯示「銷售管理」(不是「主管工作台」)
  const bodyText = await page.locator("body").innerText();
  if (!bodyText.includes("銷售管理")) {
    console.error("[FAIL] breadcrumb 沒看到「銷售管理」");
    ok = false;
  } else {
    console.log("  ✓ breadcrumb shows 銷售管理");
  }

  // 互動：切到本季
  await page.click('[data-testid="sales-manager-funnel-period-quarter"]');
  await page.waitForTimeout(300);
  console.log("  ✓ period switch (quarter) clicked");

  // 截圖
  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  log("screenshot →", SCREENSHOT);

  if (consoleErrors.length > 0) {
    console.error("[FAIL] console errors:", consoleErrors);
    ok = false;
  }
  if (pageErrors.length > 0) {
    console.error("[FAIL] page errors:", pageErrors);
    ok = false;
  }
} catch (e) {
  console.error("[ERROR]", e.message);
  ok = false;
  await page.screenshot({ path: SCREENSHOT, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
}

console.log(ok ? "[OK] /sales/funnel v5 verified" : "[FAIL] /sales/funnel verification failed");
process.exit(ok ? 0 : 1);
