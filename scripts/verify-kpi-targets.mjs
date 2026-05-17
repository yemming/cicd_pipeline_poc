#!/usr/bin/env node
/**
 * Playwright headless verification for /sales/manager/kpi-targets
 * BDN #2 — RS_M3 KPI 目標值 + HABC 閾值設定
 *
 * Steps:
 *   1. reuse pw-login state
 *   2. goto /sales/manager/kpi-targets
 *   3. screenshot full page → tmp/bdn2-01-loaded.png
 *   4. interact with one Layer 1 KPI input → save → screenshot
 *   5. interact with one HABC threshold input → save → screenshot
 *   6. console error capture
 */

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP = path.join(ROOT, "tmp");
const APP = process.env.APP_BASE_URL || "http://localhost:3000";

if (!fs.existsSync(TMP)) fs.mkdirSync(TMP, { recursive: true });
if (!fs.existsSync(STATE_FILE)) {
  console.error("[verify] no pw-state.json. Run: node scripts/pw-login.mjs --ensure");
  process.exit(1);
}

const consoleErrors = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ storageState: STATE_FILE, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const txt = msg.text();
        // skip noise (NotificationDispatcher 不該在這頁觸發、但留個白名單以防)
        if (txt.includes("net::ERR_") || txt.includes("Failed to load resource")) return;
        consoleErrors.push(`console: ${txt}`);
      }
    });

    console.log("[verify] navigate to /sales/manager/kpi-targets");
    const resp = await page.goto(`${APP}/sales/manager/kpi-targets`, { waitUntil: "networkidle", timeout: 30000 });
    const status = resp?.status() ?? 0;
    console.log("[verify] HTTP status =", status, "; URL =", page.url());

    if (page.url().includes("/login")) {
      throw new Error("redirected to /login — pw-state expired, re-run scripts/pw-login.mjs");
    }

    await page.waitForSelector("h1:has-text('KPI 目標與 HABC 閾值')", { timeout: 10000 });
    console.log("[verify] H1 found");

    // 截圖 01：載入完整頁面
    await page.screenshot({ path: path.join(TMP, "bdn2-01-loaded.png"), fullPage: true });
    console.log("[verify] screenshot 01 saved");

    // ─── 互動 #1: 改 Layer 1 KPI「月度成交台數目標」 ───
    const kpiCard = page.locator('[data-testid="kpi-monthly_delivery_target"]');
    await kpiCard.waitFor({ state: "visible", timeout: 5000 });
    const kpiInput = kpiCard.locator('input[type="number"]');
    const oldKpi = await kpiInput.inputValue();
    console.log("[verify] KPI monthly_delivery_target before =", oldKpi);
    const newKpi = oldKpi === "15" ? "18" : "15";
    await kpiInput.click({ clickCount: 3 });
    await kpiInput.fill(newKpi);
    await kpiInput.blur();
    // 等 banner
    await page.waitForSelector("text=✓ 已更新", { timeout: 5000 });
    console.log("[verify] KPI updated → banner appeared");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(TMP, "bdn2-02-kpi-updated.png"), fullPage: false });

    // 還原回去
    await kpiInput.click({ clickCount: 3 });
    await kpiInput.fill(oldKpi);
    await kpiInput.blur();
    await page.waitForTimeout(800);

    // ─── 互動 #2: 改 HABC H 級閾值 ───
    const habcCard = page.locator('[data-testid="habc-H"]');
    await habcCard.waitFor({ state: "visible", timeout: 5000 });
    const habcInput = habcCard.locator('input[type="number"]');
    const oldHabc = await habcInput.inputValue();
    console.log("[verify] HABC H before =", oldHabc);
    const newHabc = oldHabc === "30" ? "45" : "30";
    await habcInput.click({ clickCount: 3 });
    await habcInput.fill(newHabc);
    await habcInput.blur();
    await page.waitForSelector("text=✓ 已更新", { timeout: 5000 });
    console.log("[verify] HABC updated → banner appeared");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(TMP, "bdn2-03-habc-updated.png"), fullPage: false });

    // 還原
    await habcInput.click({ clickCount: 3 });
    await habcInput.fill(oldHabc);
    await habcInput.blur();
    await page.waitForTimeout(800);

    // ─── 截圖 04：最終整頁 ───
    await page.screenshot({ path: path.join(TMP, "bdn2-04-final.png"), fullPage: true });

    console.log("[verify] DONE");
    console.log(JSON.stringify({
      ok: consoleErrors.length === 0,
      httpStatus: status,
      consoleErrors,
      screenshots: ["bdn2-01-loaded.png", "bdn2-02-kpi-updated.png", "bdn2-03-habc-updated.png", "bdn2-04-final.png"],
    }, null, 2));
    process.exit(consoleErrors.length === 0 ? 0 : 2);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[verify] FAILED:", err?.stack || err);
  console.log(JSON.stringify({ ok: false, error: String(err?.message || err), consoleErrors }, null, 2));
  process.exit(1);
});
