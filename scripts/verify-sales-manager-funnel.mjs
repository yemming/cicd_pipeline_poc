// Playwright CLI 驗證 /sales/manager/funnel
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const log = (...a) => console.log("[verify]", ...a);

try {
  log("nav to /sales/manager/funnel");
  page.setDefaultTimeout(60000);
  page.setDefaultNavigationTimeout(90000);
  await page.goto(`${BASE}/sales/manager/funnel`, { waitUntil: "domcontentloaded", timeout: 90000 });

  if (page.url().includes("/login")) {
    log("redirected to /login — sign in");
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 60000 }).catch(async () => {
      // 若還在 /login，截圖看為何
      log("still on /login after 60s — capture error");
      await page.screenshot({ path: "/tmp/stitch-funnel/login-error.png", fullPage: true });
    });
    log("after login url:", page.url());
    if (!page.url().includes("/sales/manager/funnel")) {
      await page.goto(`${BASE}/sales/manager/funnel`, { waitUntil: "domcontentloaded", timeout: 90000 });
    }
  }

  log("current url:", page.url());
  await page.waitForSelector('[data-testid="sales-manager-funnel-page"]', { timeout: 60000 });
  log("✓ page rendered");

  // 截圖：預設主管視角
  await page.screenshot({ path: "/tmp/stitch-funnel/01-manager-default.png", fullPage: true });
  log("✓ screenshot 01 saved");

  // 檢查關鍵 element
  const checks = {
    "subbar role manager":   await page.locator('[data-testid="sales-manager-funnel-role-manager"]').count(),
    "subbar role personal":  await page.locator('[data-testid="sales-manager-funnel-role-personal"]').count(),
    "rs select":             await page.locator('[data-testid="sales-manager-funnel-rs-select"]').count(),
    "period month":          await page.locator('[data-testid="sales-manager-funnel-period-month"]').count(),
    "period quarter":        await page.locator('[data-testid="sales-manager-funnel-period-quarter"]').count(),
    "period year":           await page.locator('[data-testid="sales-manager-funnel-period-year"]').count(),
    "layer1 kpis":           await page.locator('[data-testid="sales-manager-funnel-layer1-kpi"]').count(),
    "layer2 (build)":        await page.locator('[data-testid="sales-manager-funnel-layer2-build"]').count(),
    "layer2 (trial)":        await page.locator('[data-testid="sales-manager-funnel-layer2-trial"]').count(),
    "layer2 (quote)":        await page.locator('[data-testid="sales-manager-funnel-layer2-quote"]').count(),
    "layer2 (order)":        await page.locator('[data-testid="sales-manager-funnel-layer2-order"]').count(),
    "layer3 kpis":           await page.locator('[data-testid="sales-manager-funnel-layer3-kpi"]').count(),
    "funnel section":        await page.locator('[data-testid="sales-manager-funnel-funnel"]').count(),
    "rs compare table":      await page.locator('[data-testid="sales-manager-funnel-rs-table"]').count(),
    "tag groups":            await page.locator('[data-testid="sales-manager-funnel-tags"]').count(),
    "phase 2 section":       await page.locator('[data-testid="sales-manager-funnel-phase2"]').count(),
  };
  console.log("\n[checks]");
  let fails = 0;
  for (const [k, v] of Object.entries(checks)) {
    const expected = k.includes("kpis") || k.includes("compare") ? v >= 1 : v >= 1;
    const ok = expected && v > 0;
    console.log(`  ${ok ? "✓" : "✗"} ${k}: ${v}`);
    if (!ok) fails++;
  }

  // 互動：切到個人視角
  await page.click('[data-testid="sales-manager-funnel-role-personal"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/stitch-funnel/02-personal.png", fullPage: true });
  log("✓ screenshot 02 (personal) saved");

  // 切回主管 + 期間切換到本季
  await page.click('[data-testid="sales-manager-funnel-role-manager"]');
  await page.click('[data-testid="sales-manager-funnel-period-quarter"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/stitch-funnel/03-manager-quarter.png", fullPage: true });
  log("✓ screenshot 03 (manager / quarter) saved");

  // 切到單一 RS
  await page.selectOption('[data-testid="sales-manager-funnel-rs-select"]', "wang");
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/stitch-funnel/04-rs-wang.png", fullPage: true });
  log("✓ screenshot 04 (rs=wang) saved");

  if (fails > 0) {
    console.error(`\nFAIL ${fails} checks`);
    process.exit(1);
  }
  console.log("\nALL CHECKS PASSED");
} catch (e) {
  console.error("[error]", e);
  await page.screenshot({ path: "/tmp/stitch-funnel/error.png", fullPage: true }).catch(() => {});
  process.exit(1);
} finally {
  await browser.close();
}
