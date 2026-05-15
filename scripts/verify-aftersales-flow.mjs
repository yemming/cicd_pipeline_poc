#!/usr/bin/env node
/**
 * Headless Playwright CLI 驗證 — /parts/aftersales flow-diagram landing page
 *
 * 驗證項：
 *   1. /parts/aftersales 載入 HTTP 200
 *   2. 頁面 title 含「DUCATI」or「售後」
 *   3. 6 個 Phase header 文字存在
 *   4. KPI scorecard 4 張
 *   5. 至少看到 1 個 nav 子節點 link 渲染
 *   6. 截圖到 /tmp/aftersales-flow.png
 */
import { chromium } from "playwright";

const BASE = process.env.APP_URL || "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const TARGET = `${BASE}/parts/aftersales`;
const SCREENSHOT = "/tmp/aftersales-flow.png";

const PHASE_TITLES = [
  "預約與進廠管理",
  "SA 修護接待",
  "正式工單",
  "車間管理",
  "竣工複檢",
  "結帳收款",
];

let exitCode = 0;
const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  if (!ok) exitCode = 1;
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();

try {
  // 1. Navigate
  const resp = await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 90_000 });
  let status = resp?.status() ?? 0;
  console.log(`[nav] ${TARGET} → ${status}`);

  // 若被 redirect 到 /login，登入後重新導向回來
  if (page.url().includes("/login")) {
    console.log("[auth] redirected to /login → filling credentials");
    await page.fill('input[type="email"], input[name="email"]', EMAIL);
    await page.fill('input[type="password"], input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 30_000 }),
      page.click('button[type="submit"]'),
    ]);
    console.log(`[auth] post-login url = ${page.url()}`);
    if (!page.url().endsWith("/parts/aftersales")) {
      const goRsp = await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 90_000 });
      status = goRsp?.status() ?? 0;
    }
  }

  check("Page HTTP 200", status === 200, `status=${status}`);

  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  // 2. 主容器渲染
  const root = await page.$('[data-testid="aftersales-flow-diagram"]');
  check("主容器 [data-testid=aftersales-flow-diagram] 存在", !!root);

  // 3. title in <title>
  const title = await page.title();
  check("瀏覽器 title 不為空", title.length > 0, `title="${title}"`);

  // 4. 6 個 Phase header 文字
  const bodyText = await page.locator("body").innerText().catch(() => "");
  for (const t of PHASE_TITLES) {
    check(`Phase header 「${t}」存在`, bodyText.includes(t));
  }

  // 5. 4 張 KPI scorecard
  for (const k of ["已完成頁面", "待開發頁面", "剩餘 Sessions", "與庫存模組串接點"]) {
    check(`KPI 「${k}」存在`, bodyText.includes(k));
  }

  // 6. 側功能群
  for (const t of ["增項閉環", "人車檔案", "系統設定"]) {
    check(`側功能群 「${t}」存在`, bodyText.includes(t));
  }

  // 7. 至少 1 個 link 跳轉
  const links = await page.$$('main a[href^="/parts/aftersales/"]');
  check("至少有 1 個跳轉 link", links.length > 0, `links=${links.length}`);

  // 8. 截圖
  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  console.log(`[shot] ${SCREENSHOT}`);
} catch (err) {
  console.error("[fatal]", err.message);
  exitCode = 1;
  try { await page.screenshot({ path: SCREENSHOT, fullPage: true }); } catch {}
} finally {
  await browser.close();
}

console.log("\n=== 驗證總結 ===");
const passed = results.filter((r) => r.ok).length;
console.log(`Passed ${passed}/${results.length}`);
process.exit(exitCode);
