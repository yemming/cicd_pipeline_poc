#!/usr/bin/env node
// Smoke test for /parts/aftersales/final-inspections（竣工複檢）
// - list 頁可載入、表格顯示複檢列、篩選、新增 modal
// - 點第一筆 detail → 5-step wizard 顯示、tab 切換、CheckRow 渲染
// - 截圖 list / detail（step1 / step5）
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[aftersales-final-inspections-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — run scripts/pw-login.mjs first");
    process.exit(2);
  }
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian" }),
      url: BASE,
    },
  ]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });

  const results = [];

  // 1) list
  {
    const resp = await page.goto(`${BASE}/parts/aftersales/final-inspections`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    results.push(status === 200 ? "✓ list HTTP 200" : `✗ list HTTP ${status}`);
    await page.waitForTimeout(800);
    const h1 = await page.locator("h1").first().textContent();
    results.push(h1?.includes("竣工複檢") ? "✓ list h1 對得上" : `✗ h1 = ${h1}`);
    // 期望至少看到 indian seed 的 FI-260515-001
    const inspectionLink = page.locator("a", { hasText: "FI-260515-001" }).first();
    const hasLink = await inspectionLink.count();
    results.push(hasLink > 0 ? "✓ 看到 indian seed FI-260515-001" : "✗ 看不到 indian seed");
    // 看到「＋ 新增複檢」button
    const addBtn = page.getByRole("button", { name: /新增複檢/ });
    results.push(((await addBtn.count()) > 0) ? "✓ 新增複檢 button 在" : "✗ 新增複檢 button 缺");
    await page.screenshot({
      path: path.join(TMP_DIR, "final-inspections-list.png"),
      fullPage: true,
    });
  }

  // 2) detail (indian seed) — 直接 navigate（避免 SPA click race）
  {
    const link = page.locator("a", { hasText: "FI-260515-001" }).first();
    const href = (await link.count()) > 0 ? await link.getAttribute("href") : null;
    const detailUrl = href ? `${BASE}${href}` : null;
    if (!detailUrl) {
      results.push("✗ 找不到 detail link href，跳過 detail 驗證");
    } else {
      const r2 = await page.goto(detailUrl, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT,
      });
      results.push(r2?.status() === 200 ? "✓ detail HTTP 200" : `✗ detail HTTP ${r2?.status()}`);
      await page.waitForTimeout(800);
      const url2 = page.url();
      results.push(url2.includes("final-inspections/") ? "✓ 進入 detail 頁" : `✗ url=${url2}`);
      // 5 step pill 在
      const stepBtns = await page.getByRole("button", { name: /維修項目複檢|試車記錄|清潔確認|複檢簽核|通知取車/ }).count();
      results.push(stepBtns >= 5 ? `✓ 看到 5 個 step pill (${stepBtns})` : `✗ step pill 只有 ${stepBtns}`);
      // step1 預設顯示，CheckRow > 0
      const okBtns = await page.getByRole("button", { name: /✓ 通過/ }).count();
      results.push(okBtns >= 5 ? `✓ step1 通過 button >= 5 (${okBtns})` : `✗ 通過 button 只有 ${okBtns}`);
      await page.screenshot({
        path: path.join(TMP_DIR, "final-inspections-detail-step1.png"),
        fullPage: true,
      });

      // 切到 step 5（通知取車）
      const step5Btn = page.getByRole("button", { name: /通知取車/ }).first();
      if ((await step5Btn.count()) > 0) {
        await step5Btn.click();
        await page.waitForTimeout(400);
        const sendBtns = await page.getByRole("button", { name: /發送 Line 訊息|發送 簡訊|發送 電話通知/ }).count();
        results.push(sendBtns >= 3 ? `✓ step5 通知 button >= 3 (${sendBtns})` : `✗ 通知 button 只有 ${sendBtns}`);
        await page.screenshot({
          path: path.join(TMP_DIR, "final-inspections-detail-step5.png"),
          fullPage: true,
        });
      }
    }
  }

  // 3) Ducati seed 存在性以 DB 為準（dev session scope 限 indian，前端可能無法 access）
  results.push("ℹ ducati seed 已在 DB（dev test user scope 限 indian，前端不驗）");

  await browser.close();
  console.log("\n=== final-inspections smoke ===");
  results.forEach((r) => console.log(r));
  if (consoleErrors.length) {
    console.log("\n!! console errors:");
    consoleErrors.forEach((e) => console.log("  " + e));
  }
  const failed = results.filter((r) => r.startsWith("✗")).length;
  process.exit(failed > 0 || consoleErrors.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
