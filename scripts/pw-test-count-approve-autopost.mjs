#!/usr/bin/env node
/**
 * One-shot：對一張既有 inventory_counts（status=pending_approval）按「核准」，
 * 驗證 approveCountAdjustmentAction() 自動 instantiateTransaction(STOCK_ADJUSTMENT_GAIN/LOSS)
 *
 * Usage:
 *   node scripts/pw-test-count-approve-autopost.mjs <ct_no>
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const CT_NO = process.argv[2];

if (!CT_NO) {
  console.error("Usage: node scripts/pw-test-count-approve-autopost.mjs <ct_no>");
  process.exit(1);
}

const log = (...m) => console.error("[count-approve]", ...m);

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
  const target = `${BASE}/parts/count/sessions`;
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

  // 找該 ct_no 的列，列尾應該有 ApproveCountButton（pending_approval status 才會渲染）
  const rowLocator = page.locator(`tr:has-text("${CT_NO}")`).first();
  await rowLocator.waitFor({ timeout: 30_000 });
  log(`row visible: ${CT_NO}`);

  const approveBtn = rowLocator.locator('button:has-text("核准")').first();
  await approveBtn.waitFor({ timeout: 10_000 });
  log("approve button visible");

  if (await approveBtn.isDisabled()) {
    log("WARN: 核准按鈕 disabled");
    process.exit(6);
  }

  await approveBtn.click();
  log("clicked approve (dialog auto-accepted)");

  const okLocator = page.locator('text=/✓ ADJ.* 已 post/');
  const errLocator = page.locator('text=/建調整單失敗|找不到盤點單/');
  try {
    await okLocator.waitFor({ timeout: 30_000 });
    const txt = await okLocator.textContent();
    log("SUCCESS:", txt);
  } catch {
    const errText = await errLocator.first().textContent().catch(() => "(no err detected)");
    log("FAILED: success message not seen. err preview:", errText);
    process.exit(4);
  }

  await page.waitForTimeout(3_000);
  log("done — 等 after() hook 完成");
} finally {
  await ctx.close();
  await browser.close();
}
