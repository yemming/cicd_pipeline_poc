#!/usr/bin/env node
/**
 * Verify：/sales/manager/card-config 落地後可達 + 關鍵 UI 元素
 * Usage: node scripts/verify-card-config.mjs
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3007";
const TARGET = "/sales/manager/card-config";
const SCREENSHOT = "/tmp/card-config-verify.png";

const log = (...m) => console.error("[verify]", ...m);

if (!fs.existsSync(STATE_FILE)) {
  console.error(`[FAIL] storageState not found at ${STATE_FILE}`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: STATE_FILE });
const page = await ctx.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

try {
  log(`GET ${BASE}${TARGET}`);
  const resp = await page.goto(`${BASE}${TARGET}`, { waitUntil: "networkidle", timeout: 60_000 });
  const status = resp?.status() ?? 0;
  const finalUrl = page.url();

  if (status !== 200) {
    console.log(`[FAIL] status=${status} url=${finalUrl}`);
    await page.screenshot({ path: SCREENSHOT, fullPage: true }).catch(() => {});
    process.exit(2);
  }
  if (finalUrl.includes("/login")) {
    console.log(`[FAIL] redirected to /login (session expired)`);
    process.exit(3);
  }

  const body = await page.locator("body").innerText().catch(() => "");

  // 關鍵 UI 元素：手卡參數 view 主要區塊
  const checks = [
    { label: "page title", needle: "手卡參數" },
    { label: "dictionary group", needle: "線索來源" },
    { label: "threshold section", needle: "跟進" },
  ];
  const missing = checks.filter((c) => !body.includes(c.needle));

  await page.screenshot({ path: SCREENSHOT, fullPage: true }).catch(() => {});

  if (missing.length) {
    console.log(`[FAIL] missing UI elements: ${missing.map((m) => m.label).join(", ")}`);
    console.log(`screenshot: ${SCREENSHOT}`);
    process.exit(4);
  }

  if (consoleErrors.length) {
    console.log(`[WARN] console errors: ${consoleErrors.length}`);
    consoleErrors.slice(0, 5).forEach((e) => console.log(`  - ${e.slice(0, 200)}`));
  }

  console.log(`[OK] ${TARGET} status=200, key UI elements present`);
  console.log(`screenshot: ${SCREENSHOT}`);
} catch (err) {
  console.log(`[FAIL] exception: ${err.message}`);
  process.exit(5);
} finally {
  await browser.close();
}
