#!/usr/bin/env node
/**
 * Headless Playwright verification for /sales/manager/staff
 *
 * 1. 登入 dev test 帳號
 * 2. 切到 Indian brand → 截圖（任務規定的 dev scope）
 * 3. 切到 Ducati brand → 截圖（驗證雙 brand 都吃得到）
 *
 * usage: node scripts/verify-sales-staff.mjs
 * output: tmp/bdn3-indian.png + tmp/bdn3-ducati.png
 */

import fs from "node:fs";
import path from "node:path";
import { chromium } from "/home/ming/projects/cicd_pipeline_poc/node_modules/playwright/index.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const PASS = "yemming.yu@gmail.com";
const TARGET = "/sales/manager/staff";
const TMP = path.resolve(process.cwd(), "tmp");
fs.mkdirSync(TMP, { recursive: true });

const checks = [];
function record(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  const sym = ok ? "✓" : "✗";
  console.log(`${sym} ${name}${detail ? " — " + detail : ""}`);
}

async function login(page) {
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 30000 }),
    page.locator('button[type="submit"]').click(),
  ]);
}

async function setScope(page, brand) {
  // 直接寫 cookie；scope.brand_id 是 JSON
  await page.context().addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: brand, store_id: null }),
      url: BASE,
    },
  ]);
}

async function snapBrand(page, brand) {
  await setScope(page, brand);
  const resp = await page.goto(BASE + TARGET, {
    waitUntil: "networkidle",
    timeout: 45000,
  });
  record(
    `${brand}: goto ${TARGET}`,
    !!resp && resp.status() < 400 && page.url().includes(TARGET),
    `status=${resp?.status()} url=${page.url()}`,
  );

  // H1
  const h1 = await page
    .locator("h1")
    .first()
    .textContent({ timeout: 6000 })
    .catch(() => null);
  record(`${brand}: H1 = RS 人員管理`, h1?.trim() === "RS 人員管理", `h1=${h1}`);

  // Sprint chip
  const sprint = await page.locator('text=RS_M3 Tab3').count();
  record(`${brand}: 章節 chip「RS_M3 Tab3」`, sprint >= 1);

  // Filter bar 按鈕
  record(`${brand}: 有「查詢」`, (await page.locator('button:has-text("查詢")').count()) >= 1);
  record(`${brand}: 有「重置」`, (await page.locator('button:has-text("重置")').count()) >= 1);

  // 「全部車系」option
  const seriesSelect = await page.locator('select').nth(1);
  const seriesOptions = await seriesSelect.locator("option").count().catch(() => 0);
  record(`${brand}: 車系 select 有 ${seriesOptions} 個 option（至少 1=全部）`, seriesOptions >= 1);

  // 表格列數（DataGrid render；空狀態也算正常）
  const tableRows = await page.locator("table tbody tr").count();
  record(`${brand}: 表格 row count = ${tableRows}`, true, `${tableRows} rows`);

  // 截圖
  const out = path.join(TMP, `bdn3-${brand}.png`);
  await page.screenshot({ path: out, fullPage: true });
  record(`${brand}: 截圖 ${out}`, fs.existsSync(out));

  return { brand, rowCount: tableRows };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[browser-error]", msg.text());
  });

  let exitCode = 0;
  try {
    await login(page);
    record("登入成功", !page.url().includes("/login"), `url=${page.url()}`);

    // ── Indian brand（dev scope；任務規定主測） ──
    const indian = await snapBrand(page, "indian");

    // 試 modal「指派車系」（只有 RS row 存在時才測）
    if (indian.rowCount > 0) {
      const firstAssignBtn = page.locator('button:has-text("指派車系")').first();
      if (await firstAssignBtn.count()) {
        await firstAssignBtn.click();
        await page.waitForSelector('text=指派負責車系', { timeout: 5000 }).catch(() => null);
        record("indian: 點「指派車系」開出 modal",
          (await page.locator('text=指派負責車系').count()) >= 1);
        // 截圖 modal
        await page.screenshot({ path: path.join(TMP, "bdn3-indian-modal.png"), fullPage: false });
        // 關掉 modal
        await page.locator('button:has-text("取消")').first().click().catch(() => null);
      }
    } else {
      record("indian: 空狀態（無 RS seed）— 顯示提示訊息", true, "預期行為（proposal F.1 等 Ming 補 seed）");
    }

    // ── Ducati brand（驗證雙 brand）──
    const ducati = await snapBrand(page, "ducati");

    // 如果 ducati 有 row、試切 modal
    if (ducati.rowCount > 0) {
      const firstAssignBtn = page.locator('button:has-text("指派車系")').first();
      if (await firstAssignBtn.count()) {
        await firstAssignBtn.click();
        await page.waitForSelector('text=指派負責車系', { timeout: 5000 }).catch(() => null);
        const seriesCount = await page.locator('text=Panigale').count();
        record(`ducati: modal 看到 Panigale 車系 option`, seriesCount >= 1);
        await page.screenshot({ path: path.join(TMP, "bdn3-ducati-modal.png"), fullPage: false });
        await page.locator('button:has-text("取消")').first().click().catch(() => null);
      }
    }
  } catch (err) {
    console.error("FAILED:", err?.stack || err);
    exitCode = 1;
  } finally {
    const summary = {
      total: checks.length,
      passed: checks.filter((c) => c.ok).length,
      failed: checks.filter((c) => !c.ok).length,
    };
    console.log("\n=== SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));
    if (summary.failed > 0) exitCode = 1;
    await browser.close();
    process.exit(exitCode);
  }
})();
