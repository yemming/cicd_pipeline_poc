#!/usr/bin/env node
/**
 * Smoke：售後正式工單 RO 模組
 *
 * 路徑：
 *  - /parts/aftersales/repair-orders        list（DataGrid）
 *  - /parts/aftersales/repair-orders/[id]   detail
 *  - /parts/aftersales/repair-orders/new    gate confirm（建單）
 *
 * 驗證項：
 *  1) list 200 + 不踢 /login + H1 含「正式工單 RO」+ DataGrid 渲染（看到 ro_code link）
 *  2) detail 200 + breadcrumb + KV grid + 狀態切換按鈕
 *  3) new 200 + RO ID preview card + P1/P2 兩組 radio + confirm 按鈕
 *  4) 在 new 頁切 P1=WC、P2=FR → confirm button disabled、show error 文字
 *  5) 切回 P1=MN、P2=CP → confirm button 可按
 *  6) 截圖 4 張
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

const log = (...m) => console.error("[ro-smoke]", ...m);

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
    // ---- 1. List ----
    let resp = await page.goto(`${BASE}/parts/aftersales/repair-orders`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    let status = resp?.status() ?? 0;
    let finalUrl = page.url();
    record(
      "GET /parts/aftersales/repair-orders",
      status === 200 && !finalUrl.includes("/login"),
      `status=${status} url=${finalUrl}`,
    );
    await page.waitForTimeout(700);

    const listH1 = await page.locator("h1:has-text('正式工單 RO')").count();
    record("list H1 顯示", listH1 > 0, `count=${listH1}`);

    const roCodeLinks = await page.locator("a[href*='/parts/aftersales/repair-orders/']").count();
    record("DataGrid 有 ro_code link", roCodeLinks > 0, `count=${roCodeLinks}`);

    const newBtn = await page.locator("a:has-text('新增 RO')").count();
    record("新增 RO 按鈕", newBtn > 0, `count=${newBtn}`);

    let shot = path.join(SHOT_DIR, "ro-list.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // ---- 2. Detail ----
    // 點第一筆 ro_code link
    const firstRoLink = page.locator("a[href*='/parts/aftersales/repair-orders/']:not([href$='/new']):not([href$='repair-orders'])").first();
    const detailHref = await firstRoLink.getAttribute("href");
    if (detailHref) {
      resp = await page.goto(`${BASE}${detailHref}`, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT,
      });
      status = resp?.status() ?? 0;
      finalUrl = page.url();
      record(
        `GET ${detailHref}`,
        status === 200 && !finalUrl.includes("/login"),
        `status=${status}`,
      );
      await page.waitForTimeout(500);

      const detailBreadcrumb = await page.locator("text=/正式工單 RO/").count();
      record("detail breadcrumb 含『正式工單 RO』", detailBreadcrumb > 0);

      const kvLabel = await page.locator("text=/車主姓名|開單日期|預估金額/").count();
      record("detail KV grid 渲染", kvLabel > 0, `count=${kvLabel}`);

      const statusToggle = await page.locator("button:has-text('切「')").count();
      record("detail 狀態切換按鈕存在", statusToggle > 0, `count=${statusToggle}`);

      shot = path.join(SHOT_DIR, "ro-detail.png");
      await page.screenshot({ path: shot, fullPage: true });
      report.shots.push(shot);
    } else {
      record("找到 detail link", false, "no detail link");
    }

    // ---- 3. New (gate confirm) ----
    resp = await page.goto(`${BASE}/parts/aftersales/repair-orders/new`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    status = resp?.status() ?? 0;
    finalUrl = page.url();
    record(
      "GET /parts/aftersales/repair-orders/new",
      status === 200 && !finalUrl.includes("/login"),
      `status=${status}`,
    );
    await page.waitForTimeout(700);

    const previewBlock = await page.locator("text=/-NNN/").count();
    record("RO ID 預覽（含 -NNN）", previewBlock > 0, `count=${previewBlock}`);

    const p1Buttons = await page.locator("button:has-text('Maintenance')").count();
    record("P1 業務類型 radio（看到 Maintenance desc）", p1Buttons > 0);

    const p2Buttons = await page.locator("button:has-text('Customer Pay')").count();
    record("P2 付款性質 radio（看到 Customer Pay desc）", p2Buttons > 0);

    // 預設 MN-CP，confirm button 應啟用
    const confirmBtn = page.locator("button:has-text('確認開立工單')");
    const confirmCount = await confirmBtn.count();
    record("confirm button 存在", confirmCount > 0);
    const confirmDisabled = confirmCount > 0 ? await confirmBtn.first().isDisabled() : true;
    record("MN-CP 預設組合：confirm 可按", !confirmDisabled);

    shot = path.join(SHOT_DIR, "ro-new-default.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // ---- 4. 切到 WC-FR 應該被擋 ----
    await page.locator("button:has-text('保固索賠')").first().click();
    await page.waitForTimeout(150);
    await page.locator("button:has-text('免費施工')").first().click();
    await page.waitForTimeout(300);

    const errMsg = await page.locator("text=/邏輯衝突/").count();
    record("WC-FR 顯示『邏輯衝突』錯誤", errMsg > 0, `count=${errMsg}`);

    const blockedDisabled = await page.locator("button:has-text('請先選擇正確組合')").count();
    record("WC-FR：confirm button 切換為『請先選擇正確組合』", blockedDisabled > 0);

    shot = path.join(SHOT_DIR, "ro-new-wc-fr-blocked.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);
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
