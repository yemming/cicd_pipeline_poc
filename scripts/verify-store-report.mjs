// Headless Playwright CLI verification for /crm/store-report
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3004";
const TARGET = "/crm/store-report";
const SHOT = "/tmp/store-report-verify.png";
const STATE_FILE = new URL("./.pw-state.json", import.meta.url).pathname;

const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";

const hasState = fs.existsSync(STATE_FILE);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(hasState ? { storageState: STATE_FILE } : {}),
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120_000);
  page.setDefaultTimeout(30_000);

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  console.log(`[verify] navigating ${BASE}${TARGET} (storageState=${hasState})`);
  const res = await page.goto(`${BASE}${TARGET}`, { waitUntil: "domcontentloaded" });

  if (page.url().includes("/login")) {
    console.log("[verify] redirected to /login — logging in");
    await page.fill('input[type="email"], input[name="email"], input[id*="email" i]', EMAIL);
    await page.fill('input[type="password"], input[name="password"], input[id*="password" i]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 60_000 });
    console.log("[verify] login OK, current url =", page.url());
    if (!page.url().endsWith(TARGET)) {
      await page.goto(`${BASE}${TARGET}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    }
  }

  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page.waitForSelector('[data-testid="store-report-page"]', { timeout: 15_000 });

  // Final response status check (從 res 取，res 可能因為 redirect 變 null)
  const status = res ? res.status() : "unknown";

  // KPI 數量斷言（設計：跨部門 5 + RS 4 + SA 6 = 15）
  const kpiCount = await page.locator('[data-testid="store-report-kpi"]').count();
  // NPS 對比卡 3 個
  const npsBoxCount = await page.locator('[data-testid="store-report-nps-box"]').count();
  // 表格至少 2 個（RS staff + SA staff）
  const staffTables = await page.locator('[data-testid="store-report-staff-table"]').count();
  // SVG 趨勢圖
  const trendSvg = await page.locator('[data-testid="store-report-trend-svg"] svg').count();
  // alerts 區塊
  const alertsRegion = await page.locator('[data-testid="store-report-alerts"]').count();

  console.log(`[verify] page status = ${status}`);
  console.log(`[verify] kpiCount = ${kpiCount}`);
  console.log(`[verify] npsBoxCount = ${npsBoxCount}`);
  console.log(`[verify] staffTables = ${staffTables}`);
  console.log(`[verify] trendSvg = ${trendSvg}`);
  console.log(`[verify] alertsRegion = ${alertsRegion}`);
  console.log(`[verify] consoleErrors =`, consoleErrors.length, "items");

  await page.screenshot({ path: SHOT, fullPage: true });
  console.log(`[verify] screenshot saved: ${SHOT}`);

  const failures = [];
  if (status !== "unknown" && status !== 200) failures.push(`expected status 200, got ${status}`);
  if (kpiCount < 12) failures.push(`expected >= 12 KPI cards, got ${kpiCount}`);
  if (npsBoxCount !== 3) failures.push(`expected 3 NPS boxes, got ${npsBoxCount}`);
  if (staffTables < 2) failures.push(`expected >= 2 staff tables, got ${staffTables}`);
  if (trendSvg < 1) failures.push(`expected 1 trend SVG, got ${trendSvg}`);
  if (alertsRegion < 1) failures.push(`expected alerts region, got ${alertsRegion}`);
  // Console error 可容忍 — 但仍記錄
  if (consoleErrors.length > 0) {
    console.warn("[verify] console errors:", consoleErrors.slice(0, 5));
  }

  await browser.close();

  if (failures.length) {
    console.error("[FAIL] /crm/store-report:", failures);
    process.exit(1);
  }
  console.log("[OK] /crm/store-report rendered");
}

main().catch((err) => {
  console.error("[FAIL] /crm/store-report error:", err);
  process.exit(1);
});
