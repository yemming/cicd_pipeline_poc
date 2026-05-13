#!/usr/bin/env node
/**
 * One-shot：對一張既有 GRN 按「結款」，驗證 payReceipt() 自動 instantiateTransaction(VENDOR_PAYMENT_BANK)
 *
 * Usage:
 *   node scripts/pw-test-vendor-payment-autopost.mjs <receipt_id>
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const RECEIPT_ID = process.argv[2];

if (!RECEIPT_ID) {
  console.error("Usage: node scripts/pw-test-vendor-payment-autopost.mjs <receipt_id>");
  process.exit(1);
}

const log = (...m) => console.error("[vendor-payment]", ...m);

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

// 自動 accept window.confirm dialog
page.on("dialog", async (d) => {
  log("dialog:", d.message());
  await d.accept();
});

page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("accounting]")) log("(browser console)", text);
});

try {
  const target = `${BASE}/parts/receipt/po-grn/${RECEIPT_ID}`;
  log(`goto ${target}`);
  const resp = await page.goto(target, {
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

  const payBtn = page.locator('button:has-text("結款")').first();
  await payBtn.waitFor({ timeout: 30_000 });
  log("pay button visible");

  const beforeText = await payBtn.textContent();
  if (beforeText?.includes("已結款")) {
    log("WARN: 此單已結款，腳本中止（換一張 receipt 跑）");
    process.exit(5);
  }

  await payBtn.click();
  log("clicked pay button (dialog auto-accepted)");

  const okLocator = page.locator('text=/✓ 已結款/');
  const errLocator = page.locator('[class*="FDECEA"]:has-text("結款失敗")');
  try {
    await okLocator.waitFor({ timeout: 30_000 });
    const txt = await okLocator.textContent();
    log("SUCCESS:", txt);
  } catch {
    const errText = await errLocator.first().textContent().catch(() => "(no err detected)");
    log("FAILED: banner ok 未出現。err preview:", errText);
    process.exit(4);
  }

  // 等 after() hook 跑完
  await page.waitForTimeout(3_000);
  log("done — 等 after() hook 完成");
} finally {
  await ctx.close();
  await browser.close();
}
