#!/usr/bin/env node
// BDN #16 · 驗證 db mode：填的 phone 對應到 indian brand 真實 customer，預期 toast=ok

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const SHOT_DIR = "/home/ming/projects/cicd_pipeline_poc/tmp";
const NAV_TIMEOUT = 60_000;

fs.mkdirSync(SHOT_DIR, { recursive: true });

const log = (...m) => console.error("[verify-crm-sync-db]", ...m);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: fs.existsSync(STATE_FILE) ? STATE_FILE : undefined,
    viewport: { width: 1440, height: 1200 },
  });
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: encodeURIComponent(JSON.stringify({ brand_id: "indian" })),
      url: BASE,
      sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();

  await page.goto(`${BASE}/sales/reception/handcard`, {
    waitUntil: "domcontentloaded",
    timeout: NAV_TIMEOUT,
  });
  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(300);

  await page.locator('button:has-text("新訪客")').first().click();
  await page.locator('[data-testid="handcard-customer-name"]').fill("BDN16 真實客戶");
  await page.locator('input[type="tel"]').fill("0900-000-016");
  // 多填幾個欄位確認 snapshot 完整
  await page.locator('select').first().selectOption({ index: 1 }).catch(() => {});

  await page.waitForTimeout(150);
  await page.locator('[data-testid="handcard-submit-top"]').click();

  const toast = page.locator('[data-testid="handcard-sync-toast"]');
  await toast.waitFor({ state: "visible", timeout: 10_000 });

  const kind = await toast.getAttribute("data-toast-kind");
  const msg = await toast.innerText();

  await page.screenshot({
    path: path.join(SHOT_DIR, "bdn16-04-toast-db.png"),
    fullPage: false,
  });

  log(`toast kind: ${kind}`);
  log(`toast msg: ${msg.replace(/\s+/g, " ").trim()}`);

  if (kind !== "ok") {
    log(`[FAIL] expected db mode (kind=ok), got ${kind}`);
    await browser.close();
    process.exit(1);
  }

  log(`[OK] db mode — CRM sync 寫入成功`);
  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("[verify-crm-sync-db] crashed:", e);
  process.exit(1);
});
