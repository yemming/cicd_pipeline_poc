#!/usr/bin/env node
/**
 * Smoke：/sales/settings/handcard-params 手卡參數設定頁
 *
 * 驗證項：
 *  1) 200 OK、不被踢 /login
 *  2) 八種 dict section 全部渲染（data-testid=dict-section-<kind>）
 *  3) 數值 / flag section 渲染（data-testid=threshold-* / flag-*）
 *  4) 截圖
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const SHOT = path.join(__dirname, "..", "tmp", "handcard-params.png");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 60_000);

const DICT_KINDS = [
  "lead_source","purchase_method","contact_type","payment_method",
  "response_code","competitor","insurer","insurance_type",
];
const THRESHOLDS = ["first_followup_days","second_followup_days","dormant_days","retention_years"];
const FLAGS = ["testdrive_booking","line_push","nps_auto_send","used_car_cert_level","personal_funnel_view"];

const log = (...m) => console.error("[handcard-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json");
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(SHOT), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ storageState: STATE_FILE, viewport: { width: 1440, height: 900 } });
  // 注入 dealeros_scope cookie 指定 indian brand（該頁是 Indian-only 設定）
  const host = new URL(BASE).host.split(":")[0];
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
      domain: host,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();

  const target = `${BASE}/sales/settings/handcard-params`;
  const resp = await page.goto(target, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
  const status = resp?.status() ?? 0;
  const finalUrl = page.url();
  log("status", status, "url", finalUrl);
  if (status >= 400 || finalUrl.includes("/login")) {
    log("✗ 載入失敗");
    await browser.close();
    process.exit(1);
  }

  await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT });

  const failures = [];

  // Section heading
  const title = await page.locator("h1").first().innerText().catch(() => "");
  log("title:", title);
  if (!title.includes("手卡參數設定")) failures.push(`h1 missing 手卡參數設定 (got: ${title})`);

  // Dict sections
  for (const k of DICT_KINDS) {
    const exists = await page.locator(`[data-testid="dict-section-${k}"]`).count();
    if (exists === 0) failures.push(`missing dict-section-${k}`);
  }
  log("dict-sections OK");

  // Thresholds
  for (const k of THRESHOLDS) {
    const exists = await page.locator(`[data-testid="threshold-${k}"]`).count();
    if (exists === 0) failures.push(`missing threshold-${k}`);
  }
  log("thresholds OK");

  // Flags
  for (const k of FLAGS) {
    const exists = await page.locator(`[data-testid="flag-${k}"]`).count();
    if (exists === 0) failures.push(`missing flag-${k}`);
  }
  log("flags OK");

  // 線索來源 section 應該有 6 列（seed 數量）
  const leadSourceRows = await page
    .locator(`[data-testid="dict-section-lead_source"] tbody tr`)
    .count();
  log("lead_source rows:", leadSourceRows);
  if (leadSourceRows < 6) failures.push(`lead_source rows expected >=6, got ${leadSourceRows}`);

  await page.screenshot({ path: SHOT, fullPage: true });
  log("screenshot saved:", SHOT);

  await browser.close();

  if (failures.length) {
    log("✗ FAILED");
    failures.forEach((f) => log("  -", f));
    process.exit(1);
  }
  log("✓ all checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });
