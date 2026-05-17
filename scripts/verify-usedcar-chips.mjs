#!/usr/bin/env node
/**
 * Verify：BDN #13 — 中古車庫存看板（RS03B）三組業務 chip
 *
 * 驗證項：
 *  1) 200 OK、不被踢 /login
 *  2) H1 含「中古車庫存看板」
 *  3) Card grid 預設展開、至少 10 張卡
 *  4) 至少一張卡有 chip-lien-cleared（已清償，綠）
 *  5) 至少一張卡有 chip-lien-uncleared（未清償，紅）
 *  6) 至少一張卡有 chip-inspection-due（4 個月內驗車，黃）
 *  7) 至少一張卡有 chip-inspection-normal（正常，灰）
 *  8) 至少各有一張卡分別含 保險 / 配件升級 / Track Day 業務 chip
 *  9) 截圖 tmp/bdn13-usedcar-chips.png + tmp/bdn13-usedcar-card-detail.png
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const SHOT_FULL = path.join(__dirname, "..", "tmp", "bdn13-usedcar-chips.png");
const SHOT_DETAIL = path.join(__dirname, "..", "tmp", "bdn13-usedcar-card-detail.png");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 60_000);

const log = (...m) => console.error("[bdn13-verify]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json");
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(SHOT_FULL), { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
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

  const target = `${BASE}/sales/showroom/used-cars`;
  const resp = await page.goto(target, { waitUntil: "commit", timeout: NAV_TIMEOUT });
  await page.waitForLoadState("domcontentloaded", { timeout: NAV_TIMEOUT }).catch(() => {});
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

  const title = await page.locator("h1").first().innerText().catch(() => "");
  log("title:", title);
  if (!title.includes("中古車庫存看板")) failures.push(`h1 missing 中古車庫存看板 (got: ${title})`);

  const cardCount = await page.locator('[data-testid="usedcar-card-grid"] > article').count();
  log("card count:", cardCount);
  if (cardCount < 10) failures.push(`card count expected >=10, got ${cardCount}`);

  // 動保塗銷 chip
  const lienOk = await page.locator('[data-testid="chip-lien-cleared"]').count();
  const lienBad = await page.locator('[data-testid="chip-lien-uncleared"]').count();
  log(`lien-cleared=${lienOk}, lien-uncleared=${lienBad}`);
  if (lienOk < 1) failures.push("expected at least 1 chip-lien-cleared (已清償)");
  if (lienBad < 1) failures.push("expected at least 1 chip-lien-uncleared (未清償)");

  // 年審 chip
  const inspectionDue = await page.locator('[data-testid="chip-inspection-due"]').count();
  const inspectionNormal = await page.locator('[data-testid="chip-inspection-normal"]').count();
  log(`inspection-due=${inspectionDue}, inspection-normal=${inspectionNormal}`);
  if (inspectionDue < 1) failures.push("expected at least 1 chip-inspection-due (4 個月內驗車)");
  if (inspectionNormal < 1) failures.push("expected at least 1 chip-inspection-normal (正常)");

  // 衍生業務三種 tag
  for (const tag of ["保險", "配件升級", "Track Day"]) {
    const n = await page.locator(`[data-testid="chip-biz-${tag}"]`).count();
    log(`biz chip "${tag}" count: ${n}`);
    if (n < 1) failures.push(`expected at least 1 chip-biz-${tag}`);
  }

  // 截圖：完整頁
  await page.screenshot({ path: SHOT_FULL, fullPage: true });
  log("screenshot saved:", SHOT_FULL);

  // 截圖：聚焦第一張卡（含 chip 列）
  const firstCard = page.locator('[data-testid="usedcar-card-grid"] > article').first();
  if (await firstCard.count()) {
    await firstCard.scrollIntoViewIfNeeded();
    await firstCard.screenshot({ path: SHOT_DETAIL });
    log("card detail screenshot saved:", SHOT_DETAIL);
  }

  await browser.close();

  if (failures.length) {
    log("✗ FAILED");
    failures.forEach((f) => log("  -", f));
    process.exit(1);
  }
  log("✓ all checks passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
