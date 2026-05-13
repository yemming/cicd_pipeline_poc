#!/usr/bin/env node
/**
 * One-shot：對一張既有 GRN 按「↩ 退回供應商」，驗證 returnReceipt() 自動 instantiateTransaction(PARTS_RETURN_TO_SUPPLIER)
 *
 * Usage:
 *   node scripts/pw-test-vendor-return-autopost.mjs <receipt_id>
 *
 * 前置：receipt 必須是 status=completed/posted、metadata.payment.status != 'paid'、metadata.return.status != 'returned'
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
  console.error("Usage: node scripts/pw-test-vendor-return-autopost.mjs <receipt_id>");
  process.exit(1);
}

const log = (...m) => console.error("[vendor-return]", ...m);

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

  const returnBtn = page.locator('button:has-text("退回供應商")').first();
  await returnBtn.waitFor({ timeout: 30_000 });
  log("return button visible");

  const beforeText = await returnBtn.textContent();
  if (beforeText?.includes("已退回")) {
    log("WARN: 此單已退回，腳本中止（換一張 receipt 跑）");
    process.exit(5);
  }
  if (await returnBtn.isDisabled()) {
    log("WARN: 退回按鈕 disabled（可能 isPaid / isReturned / isCancelled）");
    process.exit(6);
  }

  await returnBtn.click();
  log("clicked return button (dialog auto-accepted)");

  const okLocator = page.locator('text=/✓ 已退回供應商/');
  const errLocator = page.locator('[class*="FDECEA"]:has-text("退回失敗")');
  try {
    await okLocator.waitFor({ timeout: 30_000 });
    const txt = await okLocator.textContent();
    log("SUCCESS:", txt);
  } catch {
    const errText = await errLocator.first().textContent().catch(() => "(no err detected)");
    log("FAILED: banner ok 未出現。err preview:", errText);
    process.exit(4);
  }

  await page.waitForTimeout(3_000);
  log("done — 等 after() hook 完成");
} finally {
  await ctx.close();
  await browser.close();
}
