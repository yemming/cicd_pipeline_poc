#!/usr/bin/env node
/**
 * One-shot：跑一筆「例外進貨」(exception_in)，驗證 createAdjustment 觸發
 *   STOCK_ADJUSTMENT_GAIN engine、產生 posted JE。
 *
 * Usage:
 *   node scripts/pw-test-exception-autopost.mjs [type]
 *   type ∈ exception_in | exception_out | damage（預設 exception_in）
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const TYPE = process.argv[2] || "exception_in";

const ITEM_ID = "2041680a-cff2-4bce-e749-992c9e8fccd0"; // CON-FIL-001 (Indian, 有 27 stock)

const log = (...m) => console.error("[exception]", ...m);

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
  const target = `${BASE}/parts/operations/exceptions/new`;
  log("goto", target);
  const resp = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (page.url().includes("/login")) { log("ERR: /login redirect"); process.exit(2); }
  if ((resp?.status() ?? 0) >= 400) { log(`ERR: status ${resp?.status()}`); process.exit(3); }

  // 選類型（select）
  await page.locator('select').first().selectOption(TYPE);
  log(`type = ${TYPE}`);

  // reason
  await page.locator('input[placeholder*="客退"]').fill("e2e: pw-test-exception-autopost");

  // 第一行 item select（明細區的第 1 個 select 在類型/倉庫 select 之後）
  const lineItemSelect = page.locator('tbody select').first();
  await lineItemSelect.selectOption(ITEM_ID);
  log(`item = CON-FIL-001 (${ITEM_ID})`);

  // 第一行 qty/unit_cost (使用 placeholder 或 td 位置)
  const qtyInputs = page.locator('tbody input[type="text"], tbody input:not([type])');
  // 來源：序列號 / 批號 / 數量 / 單價 / 備註（依 form 順序）
  // 改用 placeholder 精確抓
  const qty = page.locator('tbody input').nth(2); // 第 3 個 input = qty
  await qty.fill("2");
  const unitCost = page.locator('tbody input').nth(3); // 第 4 個 input = unit_cost
  await unitCost.fill("200");
  log("qty=2 unit_cost=200");
  void qtyInputs;

  // 送出
  await page.locator('button:has-text("建立並過帳")').click();
  log("submit clicked");

  // 等 URL 變成 /exceptions/{id} 或 banner success
  try {
    await page.waitForURL(/\/parts\/operations\/exceptions\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    log("SUCCESS: redirected to", page.url());
  } catch {
    log("FAILED: no redirect. URL:", page.url());
    const bodyText = await page.locator("body").textContent().catch(() => "(no body)");
    log("body text (1k):", bodyText?.slice(0, 1000));
    await page.screenshot({ path: "/tmp/exception-fail.png", fullPage: true }).catch(() => {});
    process.exit(4);
  }

  // 等 after() hook
  await page.waitForTimeout(2_500);
  log("done");
} finally {
  await ctx.close();
  await browser.close();
}
