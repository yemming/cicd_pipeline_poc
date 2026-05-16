#!/usr/bin/env node
// 驗證 /crm 模組首頁
// - headless chromium 載入 /crm
// - 算 module card 數（每張卡片是 anchor with code chip）
// - 截圖到 /tmp/crm-home-verify.png

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3001";
const SHOT = process.env.SHOT_PATH || "/tmp/crm-home-verify.png";
const NAV_TIMEOUT = 60_000;

const log = (...m) => console.error("[verify-crm-home]", ...m);

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
    const resp = await page.goto(`${BASE}/crm`, {
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
    log(`[FAIL] /crm responded ${status}`);
    await browser.close();
    process.exit(1);
  }

  // 等 client-side hydration（grid 渲完）
  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => {});
  await page.waitForTimeout(500);

  // 圖卡：anchor + 內含 code chip（CRM01A / CRM02A …）
  const cardLinks = page.locator('a[href^="/sales/crm/"], a[href^="/aftersales/crm/"], a[href^="/customer-service/"]');
  const cardCount = await cardLinks.count();

  // Hero title
  const heroTitle = await page
    .locator("h1")
    .first()
    .innerText()
    .catch(() => "");

  await page.screenshot({ path: SHOT, fullPage: true });
  log(`screenshot saved: ${SHOT}`);
  log(`h1: ${heroTitle}`);
  log(`status: ${status}`);
  log(`url: ${finalUrl}`);

  if (errors.length) {
    log("page console errors:");
    for (const e of errors) log("  ", e);
  }

  if (cardCount < 3) {
    log(`[FAIL] only ${cardCount} card(s) rendered, expected ≥ 3`);
    await browser.close();
    process.exit(1);
  }

  log(`[OK] /crm rendered ${cardCount} cards`);
  await browser.close();
  process.exit(0);
}

main().catch((e) => {
  console.error("[verify-crm-home] crashed:", e);
  process.exit(1);
});
