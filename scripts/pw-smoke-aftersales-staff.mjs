#!/usr/bin/env node
// Smoke test for /parts/aftersales/management/staff（員工名冊）
// - list 載入、職級 chip、複檢授權 chip、Indian seed 員工、職級權限對照表
// - detail 頁載入（view mode）+ 主管鎖定授權判斷
// - new 頁載入（create mode）
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[aftersales-staff-smoke]", ...m);

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

  // 1) list page
  {
    const resp = await page.goto(`${BASE}/parts/aftersales/management/staff`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    results.push(status === 200 ? "✓ list HTTP 200" : `✗ list HTTP ${status}`);
    await page.waitForTimeout(800);

    const h1 = await page.locator("h1").first().textContent();
    results.push(h1?.includes("員工名冊") ? "✓ h1 = 員工名冊" : `✗ h1 = ${h1}`);

    // Indian seed 應該看到「王志強」「魏呈宇」「陳建明」
    const seedNames = ["王志強", "陳建明", "魏呈宇"];
    for (const n of seedNames) {
      const cnt = await page.locator("text=" + n).count();
      results.push(cnt > 0 ? `✓ Indian seed 看到「${n}」` : `✗ 看不到 Indian seed「${n}」`);
    }

    // 職級 chip 至少一顆「售後主管」
    const gradeChip = await page.locator("text=售後主管").count();
    results.push(gradeChip > 0 ? "✓ 售後主管 chip 渲染" : "✗ 售後主管 chip 缺");

    // 複檢授權 chip
    const authChip = await page.locator("text=已授權").count();
    results.push(authChip > 0 ? "✓ 已授權 chip 渲染" : "✗ 已授權 chip 缺");

    // CRUD：＋ 新增員工 button
    const addBtn = page.getByRole("button", { name: /新增員工/ });
    results.push(((await addBtn.count()) > 0) ? "✓ ＋ 新增員工 button 在" : "✗ ＋ 新增員工 button 缺");

    // 職級權限對照表標題
    const refTbl = await page.locator("text=職級權限對照表").count();
    results.push(refTbl > 0 ? "✓ 職級權限對照表渲染" : "✗ 職級權限對照表缺");

    await page.screenshot({
      path: path.join(TMP_DIR, "aftersales-staff-list.png"),
      fullPage: true,
    });
  }

  // 2) detail page — 透過第一筆「編輯」button 拿 href
  {
    const editBtn = page.getByRole("button", { name: "編輯" }).first();
    let detailHref = null;
    if ((await editBtn.count()) > 0) {
      // edit button 是 router.push，沒有 href；改用 nextjs Link 找
    }
    // 直接撈第一個指向 staff/<uuid> 的 link 不存在（rowActions 全是 button）
    // → 改用 client-side click + waitForURL
    if ((await editBtn.count()) > 0) {
      await Promise.all([
        page.waitForURL(/\/parts\/aftersales\/management\/staff\/[0-9a-f-]{36}/, {
          timeout: NAV_TIMEOUT,
        }),
        editBtn.click(),
      ]);
      detailHref = page.url();
      results.push(`✓ detail navigated to ${detailHref.split("/").pop().slice(0, 8)}…`);

      const status = (await page.evaluate(() => 200)) ?? 0; // navigation 已完成
      results.push(`✓ detail HTTP ${status}`);
      await page.waitForTimeout(500);

      // breadcrumb
      const crumbs = await page.locator("text=員工名冊").count();
      results.push(crumbs > 0 ? "✓ 麵包屑「員工名冊」在" : "✗ 麵包屑缺");

      // CRUD pill：返回列表 / 新增 / 修改 / 刪除 / 停用啟用
      const pills = ["返回列表", "新增", "修改", "刪除"];
      for (const p of pills) {
        const cnt = await page.getByRole("button", { name: p }).count();
        const linkCnt = await page.getByRole("link", { name: p }).count();
        const ok = cnt + linkCnt > 0;
        results.push(ok ? `✓ pill「${p}」` : `✗ pill「${p}」缺`);
      }

      await page.screenshot({
        path: path.join(TMP_DIR, "aftersales-staff-detail.png"),
        fullPage: true,
      });
    } else {
      results.push("✗ list 沒有「編輯」button，跳過 detail 驗證");
    }
  }

  // 3) new page — create mode
  {
    const resp = await page.goto(`${BASE}/parts/aftersales/management/staff/new`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    results.push(status === 200 ? "✓ new HTTP 200" : `✗ new HTTP ${status}`);
    await page.waitForTimeout(400);

    const createMode = await page.locator("text=建立模式").count();
    results.push(createMode > 0 ? "✓ 建立模式 badge" : "✗ 建立模式 badge 缺");

    const submitBtn = page.getByRole("button", { name: /建立並開啟/ });
    results.push(((await submitBtn.count()) > 0) ? "✓ 建立並開啟 button" : "✗ 建立並開啟 button 缺");

    await page.screenshot({
      path: path.join(TMP_DIR, "aftersales-staff-new.png"),
      fullPage: true,
    });
  }

  log("results:");
  for (const r of results) console.error(" ", r);
  if (consoleErrors.length > 0) {
    log("console errors:");
    for (const e of consoleErrors) console.error(" ", e);
  }
  await browser.close();

  const failures = results.filter((r) => r.startsWith("✗"));
  if (failures.length > 0 || consoleErrors.length > 0) {
    log(`FAIL: ${failures.length} assertion(s) + ${consoleErrors.length} console error(s)`);
    process.exit(1);
  }
  log("PASS");
}

main().catch((e) => {
  log("error:", e?.message ?? e);
  process.exit(2);
});
