#!/usr/bin/env node
/**
 * BDN #8 · RS05 隨車文件點交清單 — Playwright headless verify
 *
 * 驗證新 section「📋 隨車文件點交清單（8 項）」：
 *  1) 跑完 step 1/2/3（快速）→ 進 step 4
 *  2) 確認新 panel 在（dlv-doc-cnt badge、8 個 dlv-doc-{id} checkbox）
 *  3) 截圖 step4 初始
 *  4) 勾 8 項 → badge = "8 / 8"
 *  5) 改鑰匙數量 +/- 操作驗證
 *  6) 填 docDeliveredAt 日期
 *  7) 在 signature canvas 拖一筆 → 點「確認簽名」→ 觀察 dlv-doc-signed 出現
 *  8) 截圖 step4 完成、確認 dlv-doc-status 顯示成功訊息
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

const log = (...m) => console.error("[bdn8-verify]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json");
    process.exit(2);
  }
  fs.mkdirSync(SHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 1100 },
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
    record(
      "navigate /sales/delivery",
      status === 200 && !page.url().includes("/login"),
      `status=${status}`,
    );
    await page.waitForLoadState("networkidle", { timeout: NAV_TIMEOUT }).catch(() => {});

    // ── 快速走完 step 1-3 ──
    await page.locator('[data-test-id="dlv-trigger-pdi"]').click();
    await page.waitForTimeout(150);
    await page.locator('[data-test-id="dlv-pdi-all"]').click();
    await page.waitForTimeout(150);
    await page.locator('[data-test-id="dlv-pdi-next"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-test-id="dlv-del-all"]').click();
    await page.waitForTimeout(150);
    await page.locator('[data-test-id="dlv-del-next"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-test-id="dlv-sign-tech"]').click();
    await page.locator('[data-test-id="dlv-sign-rs"]').click();
    await page.locator('[data-test-id="dlv-sign-customer"]').click();
    await page.waitForTimeout(150);
    await page.locator('[data-test-id="dlv-warranty-next"]').click();
    await page.waitForTimeout(300);

    // ── STEP 4：新文件交付段 ──
    const docCntBadge = page.locator('[data-test-id="dlv-doc-cnt"]');
    record("dlv-doc-cnt badge 在", (await docCntBadge.count()) > 0);

    const initBadgeText = await docCntBadge.textContent();
    record(
      "初始 0 / 8",
      initBadgeText?.trim() === "0 / 8",
      `badge="${initBadgeText?.trim()}"`,
    );

    let shot = path.join(SHOT_DIR, "bdn8-step4-initial.png");
    await page.locator('[data-test-pane="4"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // 8 個 checkbox 存在
    const docIds = [
      "license_plate",
      "compulsory_ins",
      "warranty_card",
      "service_manual",
      "keys",
      "tool_kit",
      "charger_or_tool",
      "id_copy",
    ];
    let allPresent = true;
    for (const id of docIds) {
      const c = await page.locator(`[data-test-id="dlv-doc-${id}"]`).count();
      if (c === 0) allPresent = false;
    }
    record("8 個 checkbox 都存在", allPresent);

    // 全勾
    for (const id of docIds) {
      await page.locator(`[data-test-id="dlv-doc-${id}"]`).click();
      await page.waitForTimeout(40);
    }
    const fullBadgeText = await docCntBadge.textContent();
    record(
      "勾完 8 項 → 8 / 8",
      fullBadgeText?.trim() === "8 / 8",
      `badge="${fullBadgeText?.trim()}"`,
    );

    shot = path.join(SHOT_DIR, "bdn8-step4-checked.png");
    await page.screenshot({ path: shot, fullPage: true });
    report.shots.push(shot);

    // 鑰匙數量 +/-
    const keysInput = page.locator('[data-test-id="dlv-doc-keys-input"]');
    await page.locator('[data-test-id="dlv-doc-keys-inc"]').click();
    await page.waitForTimeout(80);
    const after_inc = await keysInput.inputValue();
    record("鑰匙 + 後 = 3", after_inc === "3", `value=${after_inc}`);
    await page.locator('[data-test-id="dlv-doc-keys-dec"]').click();
    await page.waitForTimeout(80);
    const after_dec = await keysInput.inputValue();
    record("鑰匙 − 後 = 2", after_dec === "2", `value=${after_dec}`);

    // 交付日期
    await page
      .locator('[data-test-id="dlv-doc-delivered-at"]')
      .fill("2026-06-01");
    await page.waitForTimeout(100);
    const dateValue = await page
      .locator('[data-test-id="dlv-doc-delivered-at"]')
      .inputValue();
    record("交付日期 = 2026-06-01", dateValue === "2026-06-01", `value=${dateValue}`);

    // 簽名 canvas：在 canvas 上模擬畫一筆
    const padContainer = page.locator('[data-test-id="dlv-doc-sig-pad"]');
    record("簽名 pad 容器在", (await padContainer.count()) > 0);
    const canvasEl = padContainer.locator("canvas").first();
    const box = await canvasEl.boundingBox();
    if (!box) throw new Error("canvas no bbox");
    // 拖一筆斜線
    await page.mouse.move(box.x + 30, box.y + 60);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + 30 + i * 20, box.y + 60 + i * 8);
      await page.waitForTimeout(15);
    }
    await page.mouse.up();
    await page.waitForTimeout(100);

    // 點「確認簽名」（pad 內第二個 button）
    const confirmSigBtn = padContainer.getByRole("button", { name: /確認簽名/ });
    await confirmSigBtn.click();
    await page.waitForTimeout(300);

    const signedBox = page.locator('[data-test-id="dlv-doc-signed"]');
    record("客戶簽收 box 出現", (await signedBox.count()) > 0);

    // 完成 hint
    const statusBox = page.locator('[data-test-id="dlv-doc-status"]');
    const statusText = (await statusBox.textContent())?.trim() || "";
    record(
      "完成狀態顯示成功訊息",
      statusText.includes("文件交付完成"),
      `status="${statusText.slice(0, 60)}"`,
    );

    shot = path.join(SHOT_DIR, "bdn8-step4-signed.png");
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
