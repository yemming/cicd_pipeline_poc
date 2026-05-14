#!/usr/bin/env node
/**
 * Smoke：/sales/showroom/new-cars 新車庫存看板（RS03A）
 *
 * 驗證項：
 *  1) 200 OK、不被踢 /login
 *  2) H1 含「新車庫存看板」
 *  3) KPI 列 4 張卡（newcar-kpi-{available,hold,ordering,soldThisMonth}）
 *  4) Filter 列三選一 + 搜尋（filter-{series,status,color,search}）
 *  5) Card grid 預設展開，>= 10 張卡
 *  6) 切到列表視圖後 newcar-list-view 出現
 *  7) 搜尋 "Panigale" → count 顯示 >= 1 張卡
 *  8) 截圖
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const SHOT = path.join(__dirname, "..", "tmp", "sales-newcar-inventory.png");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 60_000);

const log = (...m) => console.error("[newcar-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json");
    process.exit(2);
  }
  fs.mkdirSync(path.dirname(SHOT), { recursive: true });

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

  const title = await page.locator("h1").first().innerText().catch(() => "");
  log("title:", title);
  if (!title.includes("新車庫存看板")) failures.push(`h1 missing 新車庫存看板 (got: ${title})`);

  // KPI 4 張
  for (const k of ["available", "hold", "ordering", "soldThisMonth"]) {
    const c = await page.locator(`[data-testid="newcar-kpi-${k}"]`).count();
    if (c === 0) failures.push(`missing newcar-kpi-${k}`);
  }
  log("kpi OK");

  // Filter controls
  for (const k of ["series", "status", "color", "search"]) {
    const c = await page.locator(`[data-testid="filter-${k}"]`).count();
    if (c === 0) failures.push(`missing filter-${k}`);
  }
  log("filters OK");

  // Card grid 預設展開
  const cardGrid = await page.locator('[data-testid="newcar-card-grid"]').count();
  if (cardGrid === 0) failures.push("missing newcar-card-grid (default view)");

  const cardCount = await page
    .locator('[data-testid="newcar-card-grid"] > article')
    .count();
  log("card count:", cardCount);
  if (cardCount < 10) failures.push(`card count expected >=10, got ${cardCount}`);

  // 切到列表
  await page.locator('[data-testid="view-toggle-list"]').click();
  await page.waitForTimeout(300);
  const listView = await page.locator('[data-testid="newcar-list-view"]').count();
  if (listView === 0) failures.push("list view not appearing after toggle");
  log("list-toggle OK");

  // 切回卡片
  await page.locator('[data-testid="view-toggle-card"]').click();
  await page.waitForTimeout(200);

  // 搜尋 Panigale
  await page.locator('[data-testid="filter-search"]').fill("Panigale");
  await page.waitForTimeout(300);
  const filteredCards = await page
    .locator('[data-testid="newcar-card-grid"] > article')
    .count();
  log("Panigale filtered card count:", filteredCards);
  if (filteredCards < 1) failures.push(`Panigale filter expected >=1, got ${filteredCards}`);
  if (filteredCards >= cardCount) failures.push(`Panigale filter did not reduce count`);

  // 清掉搜尋
  await page.locator('[data-testid="filter-search"]').fill("");
  await page.waitForTimeout(200);

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
