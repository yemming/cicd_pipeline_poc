// Round D-1 GL 端到端：UI 點「過帳 GL」→ 等 → 點「沖銷 GL」。驗證留 SQL 做（本腳本只驅動 UI + 截圖）。
// 跑：node roundD-gl-verify.mjs <action>   action = post | reverse
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHIPMENT_ID = "621b4ad3-5738-475a-9fef-1ebf90e63936";
const ACTION = process.argv[2] ?? "post";
const SHOT_DIR = "docs/test-evidence/round-D";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
const page = await ctx.newPage();
page.on("dialog", (d) => d.accept().catch(() => {}));
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

async function login() {
  for (let i = 1; i <= 3; i++) {
    try {
      await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.locator('input[type="email"]').fill(EMAIL);
      await page.locator('input[type="password"]').fill(PASSWORD);
      await page.locator('button[type="submit"]').click();
      await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
      return;
    } catch (e) {
      if (i === 3) throw e;
      await page.waitForTimeout(1500);
    }
  }
}

try {
  await login();
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE }]);
  await page.goto(`${BASE}/vehicle-import/shipments/${SHIPMENT_ID}`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1500);

  const btnName = ACTION === "reverse" ? "沖銷 GL" : "過帳 GL";
  const btn = page.getByRole("button", { name: btnName }).first();
  const found = await btn.count();
  console.log(`[${ACTION}] 按鈕「${btnName}」存在：${found > 0}`);
  if (found > 0) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(4000);
    const body = await page.locator("body").innerText();
    const banner = body.match(/✓[^\n]{0,80}/)?.[0] ?? body.match(/(失敗|錯誤)[^\n]{0,80}/)?.[0] ?? "(無 banner)";
    console.log(`  banner: ${banner}`);
    await page.screenshot({ path: `${SHOT_DIR}/gl-${ACTION}.png`, fullPage: true });
  }
  console.log(`  pageerror: ${errs.length === 0 ? "none" : errs.slice(0, 2).join(" | ")}`);
} catch (e) {
  console.log("EXCEPTION:", String(e).slice(0, 200));
} finally {
  await browser.close();
}
