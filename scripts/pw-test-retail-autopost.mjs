#!/usr/bin/env node
/**
 * One-shot：跑一筆內售出貨，驗證 createInternalSale() 自動 instantiateTransaction(PARTS_RETAIL_SALE)
 *
 * Usage:
 *   node scripts/pw-test-retail-autopost.mjs <item_id> [qty] [unit_price]
 *
 * 預設 qty=2, unit_price=300
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const ITEM_ID = process.argv[2];
const QTY = process.argv[3] || "2";
const UNIT_PRICE = process.argv[4] || "300";

if (!ITEM_ID) {
  console.error("Usage: node scripts/pw-test-retail-autopost.mjs <item_id> [qty] [unit_price]");
  process.exit(1);
}

const log = (...m) => console.error("[retail-autopost]", ...m);

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
  log(`goto ${BASE}/parts/issue/internal-sale/new`);
  const resp = await page.goto(`${BASE}/parts/issue/internal-sale/new`, {
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

  // 選出庫倉 — 找有庫存的「主零件倉」WH-001
  const WAREHOUSE_ID = process.env.WAREHOUSE_ID || "6e9f3fdf-454e-43ac-b7ef-a22c13b4bc57";
  await page.locator('select').nth(0).selectOption(WAREHOUSE_ID);
  log(`warehouse selected: ${WAREHOUSE_ID}`);

  // 填用途說明
  await page.locator("textarea").first().fill("ERP engine 端到端測試（自動清除）");
  log("notes filled");

  // 第一行：選 item / qty / unit_price
  const itemSelect = page.locator('select').nth(2); // 0=warehouse, 1=customer, 2=item (first line)
  await itemSelect.selectOption(ITEM_ID);
  await page.locator('input[type="number"]').nth(0).fill(QTY); // qty
  await page.locator('input[type="number"]').nth(1).fill(UNIT_PRICE); // unit_price
  log(`line filled: item=${ITEM_ID} qty=${QTY} unit_price=${UNIT_PRICE}`);

  // 點預覽配置
  await page.click('button:has-text("預覽配置")');
  log("clicked preview");

  // 等「建單並出貨」按鈕 enabled
  const postBtn = page.locator('button:has-text("建單並出貨")');
  await postBtn.waitFor({ timeout: 30_000 });
  log("post button visible");
  try {
    await page.waitForFunction(
      () => {
        const btns = Array.from(document.querySelectorAll("button"));
        const b = btns.find((x) => x.textContent?.includes("建單並出貨"));
        return b && !b.disabled;
      },
      { timeout: 15_000 },
    );
  } catch {
    // dump preview 區內容協助 debug
    const text = await page.locator("section").last().innerText().catch(() => "(no preview text)");
    log("post button never enabled. preview content =", text.slice(0, 500));
    process.exit(5);
  }
  log("post button enabled");

  await postBtn.click();
  log("clicked post");

  // 等 router.push 跳到 detail page (/parts/issue/internal-sale/<id>) 或抓到失敗 banner
  try {
    await page.waitForURL(
      (u) => /\/parts\/issue\/internal-sale\/[a-f0-9-]{20,}/.test(u.toString()),
      { timeout: 30_000 },
    );
    log("SUCCESS — redirected to:", page.url());
  } catch {
    const errLocator = page.locator('text=/過帳失敗/');
    const errText = await errLocator.first().textContent().catch(() => "(no err detected)");
    log("FAILED: 未跳轉到 detail page。err banner:", errText);
    process.exit(4);
  }

  await page.waitForTimeout(2_500);
  log("done — 等待 after() hook 完成");
} finally {
  await ctx.close();
  await browser.close();
}
