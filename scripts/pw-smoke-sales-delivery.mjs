#!/usr/bin/env node
/**
 * Smoke：/sales/delivery 交車流程（RS05）
 *
 * 驗證項：
 *  1) 200 OK、不被踢 /login
 *  2) H1 含「交車流程」+ RS05 chip
 *  3) Step bar 有 4 step（dlv-step-1..4）
 *  4) STEP 1 預設可見、PDI 觸發按鈕在
 *  5) 點觸發 → 工單建立成功訊息
 *  6) 點「全部完成」→ PDI 29/29
 *  7) 切 STEP 2 → 36 項清單、全部完成 36/36
 *  8) 切 STEP 3 → 三方簽署按鈕、點一下技師簽名
 *  9) 切 STEP 4 → 確認交車按鈕、按下後 toast
 * 10) 截圖
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

const log = (...m) => console.error("[delivery-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json");
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
    const resp = await page.goto(`${BASE}/sales/delivery`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    record(
      "navigate /sales/delivery",
      status === 200 && !finalUrl.includes("/login"),
      `status=${status} url=${finalUrl}`,
    );

    await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => {});

    const h1 = await page.locator("h1").first().textContent();
    record("H1 = 交車流程", h1?.includes("交車流程") ?? false, `h1="${h1?.trim()}"`);

    const chip = await page.getByText("RS05", { exact: true }).count();
    record("RS05 chip exists", chip > 0, `count=${chip}`);

    // Step bar 4 steps
    const stepBar = page.locator('[data-test-id="dlv-step-bar"]');
    await stepBar.waitFor({ timeout: 5000 });
    for (let i = 1; i <= 4; i++) {
      const exists = (await page.locator(`#dlv-step-${i}`).count()) > 0;
      record(`step ${i} button exists`, exists);
    }

    // STEP 1：觸發 PDI
    const triggerBtn = page.locator('[data-test-id="dlv-trigger-pdi"]');
    record("STEP 1 PDI 觸發按鈕在", (await triggerBtn.count()) > 0);

    let shot = path.join(SHOT_DIR, "sales-delivery-step1-initial.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    await triggerBtn.click();
    await page.waitForTimeout(300);
    const triggered = await page.locator('[data-test-id="dlv-pdi-triggered"]').count();
    record("STEP 1 觸發後顯示工單已建立", triggered > 0);

    // 全部完成 PDI
    await page.locator('[data-test-id="dlv-pdi-all"]').click();
    await page.waitForTimeout(300);
    const pdiCnt = await page.locator('[data-test-id="dlv-pdi-cnt"]').textContent();
    record(
      "STEP 1 全部完成 → 29 / 29",
      pdiCnt?.trim() === "29 / 29",
      `cnt="${pdiCnt?.trim()}"`,
    );

    shot = path.join(SHOT_DIR, "sales-delivery-step1-all-done.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // 切 STEP 2
    await page.locator('[data-test-id="dlv-pdi-next"]').click();
    await page.waitForTimeout(300);
    const del0 = await page.locator('[data-test-id="dlv-del-cnt"]').textContent();
    record("STEP 2 初始 0 / 36", del0?.trim() === "0 / 36", `cnt="${del0?.trim()}"`);

    await page.locator('[data-test-id="dlv-del-all"]').click();
    await page.waitForTimeout(300);
    const del36 = await page.locator('[data-test-id="dlv-del-cnt"]').textContent();
    record(
      "STEP 2 全部完成 → 36 / 36",
      del36?.trim() === "36 / 36",
      `cnt="${del36?.trim()}"`,
    );

    shot = path.join(SHOT_DIR, "sales-delivery-step2.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // 切 STEP 3
    await page.locator('[data-test-id="dlv-del-next"]').click();
    await page.waitForTimeout(300);
    const sigTech = page.locator('[data-test-id="dlv-sign-tech"]');
    record("STEP 3 技師簽名鈕在", (await sigTech.count()) > 0);

    await sigTech.click();
    await page.waitForTimeout(300);
    const techText = await sigTech.textContent();
    record("STEP 3 點完技師 → 顯示已簽名", techText?.includes("已簽名") ?? false, `text="${techText?.trim()}"`);

    // RS + 客戶簽名
    await page.locator('[data-test-id="dlv-sign-rs"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-test-id="dlv-sign-customer"]').click();
    await page.waitForTimeout(200);

    shot = path.join(SHOT_DIR, "sales-delivery-step3.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // 切 STEP 4
    await page.locator('[data-test-id="dlv-warranty-next"]').click();
    await page.waitForTimeout(300);
    const confirmBtn = page.locator('[data-test-id="dlv-confirm"]');
    record("STEP 4 確認交車鈕在", (await confirmBtn.count()) > 0);

    await confirmBtn.click();
    await page.waitForTimeout(400);
    const confirmed = await page.locator('[data-test-id="dlv-confirmed"]').count();
    record("STEP 4 點完確認 → 顯示已完成", confirmed > 0);

    shot = path.join(SHOT_DIR, "sales-delivery-step4.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);
  } catch (err) {
    record("FATAL", false, err?.message || String(err));
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  log("FAILED:", err?.stack || err);
  process.exit(1);
});
