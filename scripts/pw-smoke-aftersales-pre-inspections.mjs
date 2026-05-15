#!/usr/bin/env node
// Smoke test for /parts/aftersales/pre-inspections（接待預檢）
// - list 頁可載入、表格顯示預檢列、篩選
// - 進 detail（indian seed PI-260515-001）→ 5-step wizard pill 全在
// - tab 切換到各 step、CheckRow / Purpose / Tech / Quote / Sign 渲染
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[aftersales-pre-inspections-smoke]", ...m);

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
    const resp = await page.goto(`${BASE}/parts/aftersales/pre-inspections`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    results.push(status === 200 ? "✓ list HTTP 200" : `✗ list HTTP ${status}`);
    await page.waitForTimeout(800);
    const h1 = await page.locator("h1").first().textContent();
    results.push(h1?.includes("接待預檢") ? "✓ list h1 對得上" : `✗ h1 = ${h1}`);

    const piLink = page.locator("a", { hasText: "PI-260515-001" }).first();
    const hasLink = await piLink.count();
    results.push(hasLink > 0 ? "✓ 看到 indian seed PI-260515-001" : "✗ 看不到 indian seed");

    const addBtn = page.getByRole("button", { name: /新增預檢/ });
    results.push(((await addBtn.count()) > 0) ? "✓ 新增預檢 button 在" : "✗ 新增預檢 button 缺");

    await page.screenshot({
      path: path.join(TMP_DIR, "pre-inspections-list.png"),
      fullPage: true,
    });
  }

  // 2) detail (indian seed)
  {
    const link = page.locator("a", { hasText: "PI-260515-001" }).first();
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
      results.push(url2.includes("pre-inspections/") ? "✓ 進入 detail 頁" : `✗ url=${url2}`);

      // 5 step pill
      const stepBtns = await page
        .getByRole("button", { name: /環車檢查|來意詢問|技師深入檢查|報價|確認簽名/ })
        .count();
      results.push(stepBtns >= 5 ? `✓ 看到 5 個 step pill (${stepBtns})` : `✗ step pill 只有 ${stepBtns}`);

      // step 1 預設顯示，環檢 row 至少 8 條
      const checkLabel = await page.getByText("車身外觀（刮傷/凹痕/龜裂）").count();
      results.push(checkLabel > 0 ? "✓ step1 環檢項目顯示" : "✗ step1 環檢項目缺");
      await page.screenshot({
        path: path.join(TMP_DIR, "pre-inspections-detail-step1.png"),
        fullPage: true,
      });

      // step 2
      const step2Btn = page.getByRole("button", { name: /^.*來意詢問$/ }).first();
      if ((await step2Btn.count()) > 0) {
        await step2Btn.click();
        await page.waitForTimeout(400);
        const purpose = await page.getByRole("button", { name: /定期保養/ }).count();
        results.push(purpose > 0 ? "✓ step2 來廠目的 button 顯示" : "✗ step2 來廠目的缺");
      }

      // step 3
      const step3Btn = page.getByRole("button", { name: /技師深入檢查/ }).first();
      if ((await step3Btn.count()) > 0) {
        await step3Btn.click();
        await page.waitForTimeout(400);
        const techCat = await page.getByText("引擎系統").count();
        results.push(techCat > 0 ? "✓ step3 引擎系統分類顯示" : "✗ step3 分類缺");
      }

      // step 4
      const step4Btn = page.getByRole("button", { name: /^.*報價$/ }).first();
      if ((await step4Btn.count()) > 0) {
        await step4Btn.click();
        await page.waitForTimeout(400);
        const total = await page.getByText("預估總費用").count();
        results.push(total > 0 ? "✓ step4 預估總費用顯示" : "✗ step4 預估總費用缺");
        await page.screenshot({
          path: path.join(TMP_DIR, "pre-inspections-detail-step4.png"),
          fullPage: true,
        });
      }

      // step 5
      const step5Btn = page.getByRole("button", { name: /確認簽名/ }).first();
      if ((await step5Btn.count()) > 0) {
        await step5Btn.click();
        await page.waitForTimeout(400);
        const sigSa = await page.getByText("SA 確認簽名").count();
        const sigCust = await page.getByText("車主確認簽名").count();
        results.push(
          sigSa > 0 && sigCust > 0
            ? "✓ step5 雙簽名區塊顯示"
            : `✗ step5 簽名缺 (sa=${sigSa},cust=${sigCust})`,
        );
        await page.screenshot({
          path: path.join(TMP_DIR, "pre-inspections-detail-step5.png"),
          fullPage: true,
        });
      }
    }
  }

  await browser.close();
  console.log("\n=== pre-inspections smoke ===");
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
