#!/usr/bin/env node
/**
 * BDN #20 驗證：RS05 交車管理 — 簽名必填校驗
 *
 * 走法：
 *   1) 進 /sales/delivery（用 .pw-state.json）
 *   2) 直接點 step bar 跳 STEP 4
 *   3) 不簽任何 → 點 dlv-confirm → 應出現紅 toast 列「客戶簽名 / RS 簽名 / 技師簽名」
 *   4) 跳回 STEP 3 → 點 dlv-sign-customer
 *   5) 跳 STEP 4 → 點 dlv-confirm → toast 列剩「RS 簽名 / 技師簽名」
 *   6) 跳回 STEP 3 → 補 dlv-sign-rs + dlv-sign-tech
 *   7) 跳 STEP 4 → 點 dlv-confirm → 應出現「🎉 交車完成」+ dlv-confirmed 元素
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

const log = (...m) => console.error("[bdn20]", ...m);

async function readToast(page) {
  const toast = page.locator('[data-test-id="dlv-toast"]');
  if ((await toast.count()) === 0) return null;
  const variant = await toast.getAttribute("data-test-variant");
  const text = (await toast.textContent())?.trim() ?? "";
  return { variant, text };
}

async function gotoStep(page, n) {
  await page.locator(`#dlv-step-${n}`).click();
  // 等切換完成
  await page.waitForSelector(`[data-test-pane="${n}"]`, { timeout: 5000 });
}

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — 請先跑登入腳本");
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
    if (!report.ok) throw new Error("navigate failed");

    await page.waitForSelector('[data-test-id="dlv-step-bar"]', { timeout: 8000 });

    // ─── Case 1：完全沒簽，期待三項缺項 ───
    await gotoStep(page, 4);
    await page.locator('[data-test-id="dlv-confirm"]').click();
    // toast 可能需要一瞬間才 render
    await page.waitForTimeout(150);
    const t1 = await readToast(page);
    const shot1 = path.join(SHOT_DIR, "bdn20-1-missing-all.png");
    await page.screenshot({ path: shot1, fullPage: false });
    report.shots.push(shot1);

    const c1Ok =
      t1?.variant === "error" &&
      t1.text.includes("客戶簽名") &&
      t1.text.includes("RS 簽名") &&
      t1.text.includes("技師簽名") &&
      t1.text.includes("尚有簽名未完成");
    record(
      "Case 1: 全空 → 紅 banner 列三項",
      c1Ok,
      `variant=${t1?.variant} text="${t1?.text}"`,
    );

    // wait toast 消失（2.8s + buffer），避免污染下一個 case 的 readToast
    await page.waitForTimeout(3200);

    // ─── Case 2：只簽客戶，期待缺 RS / 技師 ───
    await gotoStep(page, 3);
    await page.locator('[data-test-id="dlv-sign-customer"]').click();
    await page.waitForTimeout(150);
    await page.waitForTimeout(3200); // 等「客戶已簽名」success toast 消失
    await gotoStep(page, 4);
    await page.locator('[data-test-id="dlv-confirm"]').click();
    await page.waitForTimeout(150);
    const t2 = await readToast(page);
    const shot2 = path.join(SHOT_DIR, "bdn20-2-missing-two.png");
    await page.screenshot({ path: shot2, fullPage: false });
    report.shots.push(shot2);

    const c2Ok =
      t2?.variant === "error" &&
      !t2.text.includes("客戶簽名") &&
      t2.text.includes("RS 簽名") &&
      t2.text.includes("技師簽名");
    record(
      "Case 2: 簽客戶 → 紅 banner 列剩兩項（不含客戶）",
      c2Ok,
      `variant=${t2?.variant} text="${t2?.text}"`,
    );

    await page.waitForTimeout(3200);

    // ─── Case 3：補簽 RS + 技師，期待通過 ───
    await gotoStep(page, 3);
    await page.locator('[data-test-id="dlv-sign-rs"]').click();
    await page.waitForTimeout(150);
    await page.waitForTimeout(3200);
    await page.locator('[data-test-id="dlv-sign-tech"]').click();
    await page.waitForTimeout(150);
    await page.waitForTimeout(3200);
    await gotoStep(page, 4);
    const shot3 = path.join(SHOT_DIR, "bdn20-3-before-confirm.png");
    await page.screenshot({ path: shot3, fullPage: false });
    report.shots.push(shot3);
    await page.locator('[data-test-id="dlv-confirm"]').click();
    await page.waitForTimeout(200);
    const t3 = await readToast(page);
    const confirmedCount = await page.locator('[data-test-id="dlv-confirmed"]').count();
    const shot4 = path.join(SHOT_DIR, "bdn20-4-completed.png");
    await page.screenshot({ path: shot4, fullPage: false });
    report.shots.push(shot4);

    const c3Ok =
      (t3?.variant === "info" && t3.text.includes("交車完成")) &&
      confirmedCount === 1;
    record(
      "Case 3: 三項都簽 → 通過、dlv-confirmed 出現",
      c3Ok,
      `variant=${t3?.variant} text="${t3?.text}" confirmedCount=${confirmedCount}`,
    );
  } catch (err) {
    record("uncaught", false, String(err?.message ?? err));
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("[bdn20] fatal", err);
  process.exit(2);
});
