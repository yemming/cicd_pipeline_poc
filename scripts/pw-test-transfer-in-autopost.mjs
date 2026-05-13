#!/usr/bin/env node
/**
 * One-shot：跑一筆 transfer-in 收貨，驗證 receiveTransfer() 同 subsidiary 路徑：
 *   - stock_receipts 建立、gl_posted=true、gl_posted_at 有值
 *   - 跨 subsidiary 場景留 gl_posted=false（本 script 預期同 subsidiary）
 *
 * Usage:
 *   node scripts/pw-test-transfer-in-autopost.mjs <tr_no>
 *   e.g. node scripts/pw-test-transfer-in-autopost.mjs TR-IND-001
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const TR_NO = process.argv[2];

if (!TR_NO) {
  console.error("Usage: node scripts/pw-test-transfer-in-autopost.mjs <tr_no>");
  process.exit(1);
}

const log = (...m) => console.error("[transfer-in]", ...m);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
});

await ctx.addCookies([
  {
    name: "dealeros_scope",
    value: JSON.stringify({ brand_id: "indian", store_id: null }),
    domain: "localhost",
    path: "/",
    httpOnly: false,
    sameSite: "Lax",
  },
]);

const page = await ctx.newPage();
page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("accounting]")) log("(browser console)", text);
});

try {
  log(`goto ${BASE}/parts/receipt/transfer-in`);
  const resp = await page.goto(`${BASE}/parts/receipt/transfer-in`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  if (page.url().includes("/login")) {
    log("ERROR: redirected to /login — storageState 失效");
    process.exit(2);
  }
  if ((resp?.status() ?? 0) >= 400) {
    log(`ERROR: status ${resp?.status()}`);
    process.exit(3);
  }
  log("page loaded:", page.url());

  // 找 row 含 tr_no、點同 row 的「確認收貨」button
  const row = page.locator("tr", { hasText: TR_NO }).first();
  await row.waitFor({ timeout: 15_000 });
  log(`row for ${TR_NO} found`);

  await row.locator('button:has-text("確認收貨")').first().click();
  log("primary button clicked → modal open");

  // modal footer 的「確認收貨」
  const modalBtn = page.locator('[class*="fixed inset-0"] button:has-text("確認收貨")');
  await modalBtn.waitFor({ timeout: 5_000 });
  await modalBtn.click();
  log("modal confirm clicked");

  // 等成功訊息（綠色 ✓ {gr_no}）
  const okLocator = page.locator('text=/✓ GR/');
  try {
    await okLocator.waitFor({ timeout: 30_000 });
    const txt = await okLocator.first().textContent();
    log("SUCCESS:", txt);
  } catch {
    const html = await page.content();
    const errMatch = html.match(/text-\[#CC0000\][^>]*>([^<]+)/);
    log("FAILED: no success indicator. err preview:", errMatch?.[1] ?? "(none)");
    process.exit(4);
  }

  // 等 after() / promise hook 跑完
  await page.waitForTimeout(2_500);
  log("done");
} finally {
  await ctx.close();
  await browser.close();
}
