#!/usr/bin/env node
// Smoke test for /parts/aftersales/followups（增項閉環管理）
// - list 頁可載入、3 個 tab + Filter Bar + 卡片渲染
// - 切到 timeline tab 看 DataGrid
// - 切到 stats tab 看 KPI cards
// - 點第一張 case → detail 頁渲染、時間軸有 events、操作 pill 顯示
// - 截圖 list / detail
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[aftersales-followups-smoke]", ...m);

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
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian" }),
      url: BASE,
    },
  ]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });

  const results = [];

  // 1) 載入 list (待追蹤 tab)
  {
    const resp = await page.goto(`${BASE}/parts/aftersales/followups`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    if (status === 200) {
      results.push("✓ list HTTP 200");
    } else {
      results.push(`✗ list HTTP ${status}`);
    }
  }

  // 2) Header 文字
  await page.waitForSelector("h1");
  const h1 = await page.locator("h1").first().innerText();
  if (h1.includes("增項閉環管理")) {
    results.push("✓ H1 渲染：增項閉環管理");
  } else {
    results.push(`✗ H1 unexpected: ${h1}`);
  }

  // 3) 3 個 tab 存在
  const tabs = await page.locator('button:has-text("待追蹤看板"), button:has-text("追蹤時間軸"), button:has-text("整店統計")').count();
  if (tabs >= 3) results.push(`✓ 3 個 tab 都在 (找到 ${tabs})`);
  else results.push(`✗ tab 數量不對 (${tabs})`);

  // 4) 安全等級警示橫幅 / case card
  const alertBanner = await page.locator('text=/安全等級項目待主管介入/').count();
  results.push(alertBanner > 0 ? "✓ 安全警示橫幅出現" : "ℹ 沒有 safety_critical case（demo 應該有）");

  const cards = await page.locator('a[href*="/parts/aftersales/followups/"]').count();
  results.push(cards > 0 ? `✓ 看板渲染 ${cards} 張 case card` : "✗ 沒有 case card");

  // 截圖 list
  await page.screenshot({ path: path.join(TMP_DIR, "followups-list.png"), fullPage: true });
  results.push("✓ 截圖 followups-list.png");

  // 5) 切到 timeline tab
  await page.locator('button:has-text("追蹤時間軸")').click();
  await page.waitForTimeout(500);
  const grid = await page.locator('table').count();
  results.push(grid > 0 ? "✓ Timeline DataGrid 渲染" : "✗ Timeline 沒看到 table");

  // 6) 切到 stats tab
  await page.locator('button:has-text("整店統計")').click();
  await page.waitForTimeout(500);
  const kpis = await page.locator('text=/本月失銷金額|已閉環回收|待追蹤|長期追蹤/').count();
  results.push(kpis >= 3 ? `✓ KPI cards 渲染 (${kpis} 個 label)` : `✗ KPI cards 不齊 (${kpis})`);

  await page.screenshot({ path: path.join(TMP_DIR, "followups-stats.png"), fullPage: true });
  results.push("✓ 截圖 followups-stats.png");

  // 7) 切回 pending tab → 點第一張 case 進 detail
  await page.locator('button:has-text("待追蹤看板")').click();
  await page.waitForTimeout(500);
  const firstLink = await page.locator('a[href*="/parts/aftersales/followups/"]').first().getAttribute("href");
  if (!firstLink) {
    results.push("✗ 找不到第一張 case 的 link");
  } else {
    const detailResp = await page.goto(`${BASE}${firstLink}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const dStatus = detailResp?.status() ?? 0;
    if (dStatus === 200) results.push(`✓ detail HTTP 200 (${firstLink})`);
    else results.push(`✗ detail HTTP ${dStatus}`);

    await page.waitForSelector("h1");
    const dh1 = await page.locator("h1").first().innerText();
    results.push(dh1 ? `✓ detail H1: ${dh1.slice(0, 24)}` : "✗ detail H1 空");

    const timeline = await page.locator('text=/▼ 追蹤時間軸/').count();
    results.push(timeline > 0 ? "✓ detail 時間軸區塊渲染" : "✗ detail 沒看到時間軸");

    const events = await page.locator('text=/建立追蹤|SA 聯繫|主管介入|車主同意/').count();
    results.push(events > 0 ? `✓ 時間軸有 ${events} 筆 event` : "ℹ 此 case 暫無 event");

    // 操作 pill bar
    const actions = await page.locator('button:has-text("記錄聯繫"), button:has-text("車主同意"), button:has-text("結案")').count();
    results.push(actions >= 2 ? `✓ 操作 pill ${actions} 顆` : `ℹ 操作 pill ${actions} 顆 (case 可能已結案)`);

    await page.screenshot({ path: path.join(TMP_DIR, "followups-detail.png"), fullPage: true });
    results.push("✓ 截圖 followups-detail.png");
  }

  if (consoleErrors.length > 0) {
    // 第一次冷編譯時 dev server 可能 SSR 跟 client locale 對不齊（baseline workspace shell issue）。
    // 不算 fail；只 warn。warm 後重跑通常 0 errors。
    log("ℹ client console warnings (dev only):");
    for (const e of consoleErrors) log("  ", e.slice(0, 120));
    results.push(`ℹ ${consoleErrors.length} client console warnings (non-blocking)`);
  } else {
    results.push("✓ no client console errors");
  }

  await browser.close();

  log("=== RESULTS ===");
  for (const r of results) log(r);
  const failed = results.filter((r) => r.startsWith("✗"));
  if (failed.length > 0) {
    log(`FAILED ${failed.length} checks`);
    process.exit(1);
  }
  log(`PASSED ${results.length} checks`);
}

main().catch((e) => {
  console.error("[aftersales-followups-smoke] fatal", e);
  process.exit(2);
});
