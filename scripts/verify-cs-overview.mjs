// Headless Playwright CLI verification for /customer-service/overview
import { chromium } from "playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const TARGET = "/customer-service/overview";
const SHOT_DIR = "/tmp";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(120_000);
  page.setDefaultTimeout(30_000);

  console.log(`[verify] navigating ${BASE}${TARGET}`);
  await page.goto(`${BASE}${TARGET}`, { waitUntil: "domcontentloaded" });

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

  await page.waitForSelector('[data-testid="cs-overview-page"]', { timeout: 15_000 });

  // Capture key UI signals
  const hero = await page.locator('[data-testid="cs-overview-page"] h1').first().innerText();
  const kpiCount = await page.locator('[data-testid="cs-overview-kpi"]').count();
  const tabBtns = await page.locator('[data-testid^="cs-overview-tab-"]').count();
  const cardCount = await page.locator('[data-testid^="cs-overview-card-"]').count();

  console.log("[verify] hero =", hero);
  console.log("[verify] kpiCount =", kpiCount);
  console.log("[verify] tabBtns =", tabBtns);
  console.log("[verify] cardCount =", cardCount);

  // Screenshot: modules tab
  await page.screenshot({ path: `${SHOT_DIR}/cs-overview-modules.png`, fullPage: true });
  console.log("[verify] screenshot saved: cs-overview-modules.png");

  // Switch to connections tab
  await page.click('[data-testid="cs-overview-tab-connections"]');
  await page.waitForTimeout(400);
  const connRows = await page.locator("table tbody tr").count();
  console.log("[verify] connectionRows =", connRows);
  await page.screenshot({ path: `${SHOT_DIR}/cs-overview-connections.png`, fullPage: true });

  // Switch to files tab
  await page.click('[data-testid="cs-overview-tab-files"]');
  await page.waitForTimeout(400);
  const fileRows = await page.locator("table tbody tr").count();
  console.log("[verify] fileRows =", fileRows);
  await page.screenshot({ path: `${SHOT_DIR}/cs-overview-files.png`, fullPage: true });

  // Click a module card → expect toast
  await page.click('[data-testid="cs-overview-tab-modules"]');
  await page.waitForTimeout(300);
  await page.click('[data-testid="cs-overview-card-CRM01A"]');
  await page.waitForSelector('[data-testid="cs-overview-toast"]', { timeout: 3000 });
  const toast = await page.locator('[data-testid="cs-overview-toast"]').innerText();
  console.log("[verify] toast =", toast);

  // Assertions
  const failures = [];
  if (!hero || !hero.includes("CRM")) failures.push(`hero missing CRM: "${hero}"`);
  if (kpiCount !== 4) failures.push(`expected 4 KPIs, got ${kpiCount}`);
  if (tabBtns !== 3) failures.push(`expected 3 tabs, got ${tabBtns}`);
  if (cardCount < 14) failures.push(`expected >= 14 module cards, got ${cardCount}`);
  if (connRows < 13) failures.push(`expected >= 13 connection rows, got ${connRows}`);
  // file rows include 3 group-header rows + 15 file rows = 18
  if (fileRows < 15) failures.push(`expected >= 15 file rows, got ${fileRows}`);
  if (!toast.includes("CRM01A")) failures.push(`toast missing CRM01A: "${toast}"`);

  await browser.close();

  if (failures.length) {
    console.error("[verify] FAIL:", failures);
    process.exit(1);
  }
  console.log("[verify] all assertions passed.");
}

main().catch((err) => {
  console.error("[verify] error:", err);
  process.exit(1);
});
