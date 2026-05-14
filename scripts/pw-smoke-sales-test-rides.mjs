#!/usr/bin/env node
/**
 * Smoke：/sales/reception/test-rides 試乘試駕（RS02）
 *
 * 驗證項：
 *  1) 200 OK、不被踢 /login
 *  2) H1 含「試乘試駕」+ RS02 chip
 *  3) Step bar 有 4 step（td-step-1..4）
 *  4) STEP 1 預設可見、有「試駕基本登記」標題
 *  5) 點 td-step-2 切到安全清單、顯示 14 項、進度 0%
 *  6) 點「全部 OK」→ 進度 100%、計數 14/14
 *  7) 切 STEP 3 看到計時面板 00:00、按開始 → badge 變「試駕中」
 *  8) 切 STEP 4 看到「⚡ 黃金時刻」CTA
 *  9) 截圖
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

const log = (...m) => console.error("[test-rides-smoke]", ...m);

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
    const resp = await page.goto(`${BASE}/sales/reception/test-rides`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    record(
      "navigate /sales/reception/test-rides",
      status === 200 && !finalUrl.includes("/login"),
      `status=${status} url=${finalUrl}`,
    );

    await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => {});

    // H1
    const h1 = await page.locator("h1").first().textContent();
    record("H1 = 試乘試駕", h1?.includes("試乘試駕") ?? false, `h1="${h1?.trim()}"`);

    // RS02 chip
    const chip = await page.getByText("RS02", { exact: true }).count();
    record("RS02 chip exists", chip > 0, `count=${chip}`);

    // Step bar 4 steps
    const stepBar = page.locator('[data-test-id="td-step-bar"]');
    await stepBar.waitFor({ timeout: 5000 });
    for (let i = 1; i <= 4; i++) {
      const exists = (await page.locator(`#td-step-${i}`).count()) > 0;
      record(`step ${i} button exists`, exists);
    }

    // STEP 1 visible
    const step1Title = await page.getByText("試駕基本登記").count();
    record("STEP 1 panel visible", step1Title > 0);

    // 截 STEP 1
    let shot = path.join(SHOT_DIR, "sales-test-rides-step1.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // 切 STEP 2
    await page.locator("#td-step-2").click();
    await page.waitForTimeout(300);
    const cntInitial = await page.locator('[data-test-id="td-safety-cnt"]').textContent();
    record("STEP 2 initial 0/14", cntInitial?.trim() === "0 / 14", `cnt="${cntInitial?.trim()}"`);

    // 點全部 OK
    await page.locator('[data-test-id="td-check-all"]').click();
    await page.waitForTimeout(300);
    const cntAfter = await page.locator('[data-test-id="td-safety-cnt"]').textContent();
    const pct = await page.locator('[data-test-id="td-safety-pct"]').textContent();
    record(
      "STEP 2 全部 OK → 14/14 + 100%",
      cntAfter?.trim() === "14 / 14" && pct?.trim() === "100%",
      `cnt="${cntAfter?.trim()}" pct="${pct?.trim()}"`,
    );

    shot = path.join(SHOT_DIR, "sales-test-rides-step2-full.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // 切 STEP 3
    await page.locator("#td-step-3").click();
    await page.waitForTimeout(300);
    const timer = await page.locator('[data-test-id="td-timer-display"]').textContent();
    record("STEP 3 timer = 00:00", timer?.trim() === "00:00", `timer="${timer?.trim()}"`);

    // 按開始試駕
    await page.getByRole("button", { name: /開始試駕/ }).click();
    await page.waitForTimeout(1100);
    const badgeRunning = await page.getByText("試駕中", { exact: true }).count();
    record("STEP 3 timer running → badge 試駕中", badgeRunning > 0);
    await page.getByRole("button", { name: /結束試駕/ }).click();

    shot = path.join(SHOT_DIR, "sales-test-rides-step3.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // 切 STEP 4
    await page.locator("#td-step-4").click();
    await page.waitForTimeout(300);
    const golden = await page.getByText("⚡ 黃金時刻").count();
    record("STEP 4 黃金時刻 CTA 出現", golden > 0);

    shot = path.join(SHOT_DIR, "sales-test-rides-step4.png");
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
