#!/usr/bin/env node
/**
 * Verify：RS03A 新車庫存看板 — 進貨 sub-status chip（BDN #18）
 *
 * 驗證項：
 *  1) 200 OK
 *  2) Card grid 內每張卡都有 sub-status chip
 *  3) 至少抓到 4 種 sub-status 的代表性樣本：
 *      - in_stock (在庫)         — 多數卡片（fallback 推導）
 *      - in_transit (在途)       — DV4-001
 *      - eta (預估到貨 YYYY-MM-DD) — MSP-002 / HM-002 / DX-002
 *      - assigned (已配車)        — PV4S-002 / MV4S-002
 *  4) 切到列表視圖後，row 也有 sub-status 欄位
 *  5) 截圖 3 張：tmp/bdn18-card.png / bdn18-list.png / bdn18-detail.png
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 60_000);

const log = (...m) => console.error("[bdn18-verify]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json");
    process.exit(2);
  }
  fs.mkdirSync(TMP, { recursive: true });

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

  const target = `${BASE}/sales/showroom/new-cars`;
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

  // ── Card view 截圖 ──────────────────
  await page.screenshot({ path: path.join(TMP, "bdn18-card.png"), fullPage: true });
  log("saved bdn18-card.png");

  // 每張卡都有 sub-status chip
  const cardCount = await page
    .locator('[data-testid="newcar-card-grid"] > article')
    .count();
  const subStatusOnCardCount = await page
    .locator('[data-testid^="newcar-substatus-"]')
    .count();
  log("card / substatus chip count:", cardCount, "/", subStatusOnCardCount);
  if (subStatusOnCardCount < cardCount) {
    failures.push(`expected sub-status chip on every card (${cardCount}), got ${subStatusOnCardCount}`);
  }

  // 4 種 kind 都至少出現一次
  for (const kind of ["in-stock", "in-transit", "eta", "assigned"]) {
    const c = await page.locator(`[data-testid="substatus-${kind}"]`).count();
    log(`kind ${kind} count:`, c);
    if (c < 1) failures.push(`missing sub-status kind: ${kind}`);
  }

  // 抓特定樣本驗證 label
  const pv4s002Text = await page
    .locator('[data-testid="newcar-substatus-PV4S-002"]')
    .innerText()
    .catch(() => "");
  log("PV4S-002 substatus:", pv4s002Text);
  if (!pv4s002Text.includes("已配車") || !pv4s002Text.includes("王志強")) {
    failures.push(`PV4S-002 expected 已配車（王志強）, got: ${pv4s002Text}`);
  }

  const msp002Text = await page
    .locator('[data-testid="newcar-substatus-MSP-002"]')
    .innerText()
    .catch(() => "");
  log("MSP-002 substatus:", msp002Text);
  if (!msp002Text.includes("預估到貨") || !msp002Text.includes("2026-06-15")) {
    failures.push(`MSP-002 expected 預估到貨 2026-06-15, got: ${msp002Text}`);
  }

  const dv4001Text = await page
    .locator('[data-testid="newcar-substatus-DV4-001"]')
    .innerText()
    .catch(() => "");
  log("DV4-001 substatus:", dv4001Text);
  if (!dv4001Text.includes("在途")) {
    failures.push(`DV4-001 expected 在途, got: ${dv4001Text}`);
  }

  // 任一張帶 VIN 的應該是 in_stock fallback
  const inStockSample = await page.locator('[data-testid="substatus-in-stock"]').first().innerText().catch(() => "");
  log("in-stock sample:", inStockSample);
  if (!inStockSample.includes("在庫")) {
    failures.push(`in_stock chip label should be 在庫, got: ${inStockSample}`);
  }

  // 詳細截圖：focus 第一張卡（含 sub-status chip 的視覺位置）
  const firstCard = page.locator('[data-testid="newcar-card-grid"] > article').first();
  await firstCard.scrollIntoViewIfNeeded();
  await firstCard.screenshot({ path: path.join(TMP, "bdn18-detail.png") });
  log("saved bdn18-detail.png");

  // ── 切到列表 ────────────────────
  await page.locator('[data-testid="view-toggle-list"]').click();
  await page.waitForTimeout(400);

  const listSubCount = await page
    .locator('[data-testid^="row-newcar-substatus-"]')
    .count();
  log("list-row substatus count:", listSubCount);
  if (listSubCount < cardCount) {
    failures.push(`list view expected ${cardCount} sub-status cells, got ${listSubCount}`);
  }

  await page.screenshot({ path: path.join(TMP, "bdn18-list.png"), fullPage: true });
  log("saved bdn18-list.png");

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
