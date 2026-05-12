#!/usr/bin/env node
/**
 * One-shot：跑一筆 GRN，驗證 receiveStock() 自動 instantiateTransaction(PARTS_PURCHASE)
 *
 * Usage:
 *   node scripts/pw-test-grn-autopost.mjs <po_id>
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const PO_ID = process.argv[2];

if (!PO_ID) {
  console.error("Usage: node scripts/pw-test-grn-autopost.mjs <po_id>");
  process.exit(1);
}

const log = (...m) => console.error("[grn-autopost]", ...m);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
});

// 強制切 brand 到 indian（測 Indian seed 的 PO 用）
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
  log(`goto ${BASE}/parts/receipt/po-grn/new?po=${PO_ID}`);
  const resp = await page.goto(`${BASE}/parts/receipt/po-grn/new?po=${PO_ID}`, {
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

  await page.waitForSelector('button:has-text("確認收貨並產生 GR")', { timeout: 30_000 });
  log("submit button visible");

  await page.click('button:has-text("確認收貨並產生 GR")');
  log("clicked submit");

  // 等 banner 出現「✓ 已建立 GR...」或 error
  const okLocator = page.locator('text=/✓ 已建立 GR/');
  const errLocator = page.locator('[class*="FDECEA"], text=/失敗|錯誤/');
  try {
    await okLocator.waitFor({ timeout: 30_000 });
    const txt = await okLocator.textContent();
    log("SUCCESS:", txt);
  } catch {
    const errText = await errLocator.first().textContent().catch(() => "(no err detected)");
    log("FAILED: banner ok 未出現。err preview:", errText);
    process.exit(4);
  }

  // 等 after() hook 跑完（log 應該出現在 server console，不在 browser console）
  await page.waitForTimeout(2_500);
  log("done — 等待 after() hook 完成");
} finally {
  await ctx.close();
  await browser.close();
}
