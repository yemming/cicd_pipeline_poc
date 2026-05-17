#!/usr/bin/env node
// BDN #16 · 驗證 RS01 電子手卡 → CRM01A 同步
// - 載入 /sales/reception/handcard
// - 選來客身份「新訪客」、填客戶姓名、phone
// - 點「儲存並送出」（top header 那顆）
// - 等 toast 出現、截圖
// - 預期 demo mode（找不到對應 customer）→ kind=demo

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

const log = (...m) => console.error("[verify-crm-sync]", ...m);

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
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });

  let status = 0;
  let finalUrl = "";
  try {
    const resp = await page.goto(`${BASE}/sales/reception/handcard`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    status = resp?.status() ?? 0;
    finalUrl = page.url();
  } catch (e) {
    log("[FAIL] navigation error:", e.message);
    await browser.close();
    process.exit(1);
  }

  if (finalUrl.includes("/login")) {
    log(`[FAIL] redirected to login: ${finalUrl}`);
    await browser.close();
    process.exit(1);
  }
  if (status >= 400) {
    log(`[FAIL] /sales/reception/handcard responded ${status}`);
    await browser.close();
    process.exit(1);
  }

  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(400);

  await page.screenshot({
    path: path.join(SHOT_DIR, "bdn16-01-landing.png"),
    fullPage: true,
  });

  // 選來客身份「新訪客」（第一張卡）
  await page.locator('button:has-text("新訪客")').first().click();
  // 填客戶姓名
  await page.locator('[data-testid="handcard-customer-name"]').fill("BDN16 測試客戶（無此人）");
  // 填 phone（隨機，預期查不到）
  await page.locator('input[type="tel"]').fill("0900-000-016");

  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(SHOT_DIR, "bdn16-02-filled.png"),
    fullPage: false,
  });

  // 點 top header「儲存並送出」
  const submitTop = page.locator('[data-testid="handcard-submit-top"]');
  await submitTop.click();

  // 等 toast 出現
  const toast = page.locator('[data-testid="handcard-sync-toast"]');
  try {
    await toast.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    log("[FAIL] toast did not appear within 10s");
    await page.screenshot({
      path: path.join(SHOT_DIR, "bdn16-03-no-toast.png"),
      fullPage: false,
    });
    await browser.close();
    process.exit(1);
  }

  const kind = await toast.getAttribute("data-toast-kind");
  const msg = await toast.innerText();

  await page.screenshot({
    path: path.join(SHOT_DIR, "bdn16-03-toast.png"),
    fullPage: false,
  });

  log(`toast kind: ${kind}`);
  log(`toast msg: ${msg.replace(/\s+/g, " ").trim()}`);
  log(`status: ${status}`);
  log(`url: ${finalUrl}`);

  if (errors.length) {
    log("page console errors:");
    for (const e of errors) log("  ", e);
  }

  // 預期：demo mode（沒對應 customer）or ok（很巧剛好同名）
  if (kind !== "demo" && kind !== "ok") {
    log(`[FAIL] expected demo|ok, got ${kind}`);
    await browser.close();
    process.exit(1);
  }

  log(`[OK] toast=${kind} — CRM sync side-effect 觸發成功`);
  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("[verify-crm-sync] crashed:", e);
  process.exit(1);
});
