#!/usr/bin/env node
/**
 * Smoke：售後「核對明細」landing
 *
 * 路徑：/parts/aftersales/repair-orders/lines （nav_node 入口）
 *
 * 驗證項：
 *  1) 200 + 不踢 /login + H1 「核對明細」
 *  2) KPI 卡 4 張（工單總數 / 未核對 / 低庫存 / 本批合計）
 *  3) Filter Bar：狀態 select、工單編號 input、日期 from/to、僅顯示未核對 checkbox、查詢/重置/開新工單按鈕
 *  4) DataGrid 渲染：工單編號 link、狀態 chip、工項/零件 cell
 *  5) 篩選互動：勾「僅顯示未核對」→ 查詢 → URL 帶 empty_only=1
 *  6) 截圖 2 張
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const SHOT_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 60_000);

const log = (...m) => console.error("[lines-landing-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — please log in once via Playwright MCP first");
    process.exit(2);
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const report = { ok: true, steps: [], shots: [] };
  const record = (name, ok, detail = "") => {
    report.steps.push({ name, ok, detail });
    if (!ok) report.ok = false;
    log(`${ok ? "OK " : "NG "} ${name} ${detail}`);
  };

  try {
    // ---- 1. 進站 ----
    let resp = await page.goto(`${BASE}/parts/aftersales/repair-orders/lines`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    let status = resp?.status() ?? 0;
    let finalUrl = page.url();
    record(
      "GET /parts/aftersales/repair-orders/lines",
      status === 200 && !finalUrl.includes("/login"),
      `status=${status} url=${finalUrl}`,
    );
    await page.waitForTimeout(800);

    const h1 = await page.locator("h1:has-text('核對明細')").count();
    record("H1『核對明細』", h1 > 0, `count=${h1}`);

    // ---- 2. KPI ----
    const kpis = await page.locator(
      "text=/工單總數|未核對（無明細）|低庫存提示|本批合計/",
    ).count();
    record("KPI 卡 4 張全現身", kpis >= 4, `count=${kpis}`);

    // ---- 3. Filter Bar ----
    const statusSelect = await page.locator("select").count();
    record("狀態 select 存在", statusSelect > 0, `count=${statusSelect}`);

    const qInput = await page.locator("input[placeholder*='MN-CP']").count();
    record("工單編號 input", qInput > 0, `count=${qInput}`);

    const dateInputs = await page.locator("input[type='date']").count();
    record("日期 input 兩個", dateInputs >= 2, `count=${dateInputs}`);

    const emptyCheckbox = await page.locator("input[type='checkbox']").count();
    record("『僅顯示未核對』checkbox", emptyCheckbox > 0, `count=${emptyCheckbox}`);

    const searchBtn = await page.locator("button:has-text('查詢')").count();
    record("查詢按鈕", searchBtn > 0);

    const resetBtn = await page.locator("button:has-text('重置')").count();
    record("重置按鈕", resetBtn > 0);

    const newBtn = await page.locator("a:has-text('開新工單')").count();
    record("『＋ 開新工單』link", newBtn > 0);

    // ---- 4. DataGrid ----
    // 整個列表的 ro_code link（每列）
    const roCodeLinks = await page
      .locator("a[href*='/parts/aftersales/repair-orders/'][href*='/lines']")
      .count();
    // 至少 row action「維護明細」+ 工單編號 link 兩種會配對
    record("DataGrid 渲染（含 ro→lines link）", roCodeLinks >= 1, `count=${roCodeLinks}`);

    const totalCountTxt = await page.locator("text=/共\\s*\\d+\\s*張工單/").count();
    record("『共 N 張工單』統計列", totalCountTxt > 0);

    let shot = path.join(SHOT_DIR, "lines-landing.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // ---- 5. 篩選互動：empty_only ----
    await page.locator("input[type='checkbox']").first().check();
    await page.waitForTimeout(150);
    await page.locator("button:has-text('查詢')").first().click();
    await page.waitForTimeout(900);
    finalUrl = page.url();
    record(
      "勾『僅顯示未核對』→ URL 帶 empty_only=1",
      finalUrl.includes("empty_only=1"),
      `url=${finalUrl}`,
    );

    shot = path.join(SHOT_DIR, "lines-landing-empty-only.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // ---- 6. 重置 ----
    await page.locator("button:has-text('重置')").first().click();
    await page.waitForTimeout(700);
    finalUrl = page.url();
    record(
      "重置 → URL 不帶 empty_only",
      !finalUrl.includes("empty_only"),
      `url=${finalUrl}`,
    );
  } catch (e) {
    log("EXCEPTION:", e.message);
    record("uncaught", false, e.message);
  } finally {
    await browser.close();
  }

  log("---");
  log("REPORT:", JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((e) => {
  log("FATAL:", e);
  process.exit(3);
});
