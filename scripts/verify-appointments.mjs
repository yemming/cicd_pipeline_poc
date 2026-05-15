#!/usr/bin/env node
// Headless Playwright verification for /parts/aftersales/appointments
// usage: node scripts/verify-appointments.mjs

import { chromium } from "/home/ming/projects/cicd_pipeline_poc/node_modules/playwright/index.mjs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const PASS = "yemming.yu@gmail.com";
const TARGET = "/parts/aftersales/appointments";

const checks = [];
function record(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  const sym = ok ? "✓" : "✗";
  console.log(`${sym} ${name}${detail ? " — " + detail : ""}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error("[pageerror]", err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") console.error("[browser console error]", msg.text());
  });

  try {
    // 1. Navigate to target — expect login redirect
    const resp = await page.goto(BASE + TARGET, { waitUntil: "domcontentloaded", timeout: 30000 });
    record("初次 goto 取得 response", !!resp, `status=${resp?.status()}`);

    // Login if redirected
    if (page.url().includes("/login")) {
      await page.fill('input[type="email"], input[name="email"]', EMAIL);
      await page.fill('input[type="password"], input[name="password"]', PASS);
      const submitBtn = await page.locator('button[type="submit"], button:has-text("登入"), button:has-text("Sign")').first();
      await Promise.all([
        page.waitForLoadState("networkidle").catch(() => null),
        submitBtn.click(),
      ]);
      // After login, navigate again
      await page.goto(BASE + TARGET, { waitUntil: "networkidle", timeout: 30000 });
      record("登入完成後重新導向回目標頁", page.url().includes(TARGET), `url=${page.url()}`);
    }

    // 2. Final URL on target
    record("最終 URL 命中目標路徑", page.url().includes(TARGET), `url=${page.url()}`);

    // 3. Page title 出現
    const h1 = await page.locator("h1").first().textContent({ timeout: 8000 }).catch(() => null);
    record("有 H1 標題「預約管理看板」", h1 === "預約管理看板", `h1=${h1}`);

    // 4. KPI 卡 4 張
    const kpiTotal = await page.locator("text=今日預約").count();
    const kpiWaiting = await page.locator("text=等待中").count();
    const kpiInProgress = await page.locator("text=維修中").count();
    const kpiDone = await page.locator("text=已完成").count();
    record("KPI「今日預約」chip", kpiTotal >= 1);
    record("KPI「等待中」chip", kpiWaiting >= 1);
    record("KPI「維修中」chip", kpiInProgress >= 1);
    record("KPI「已完成」chip", kpiDone >= 1);

    // 5. Schedule + Tech Load cards
    const scheduleCard = await page.locator("text=今日排程").count();
    const techLoadCard = await page.locator("text=技師工作負載").count();
    record("「今日排程」card 出現", scheduleCard >= 1);
    record("「技師工作負載」card 出現", techLoadCard >= 1);

    // 6. Filter bar 4 fields + 查詢/重置/+新增
    const dateInput = await page.locator('input[type="date"]').count();
    const queryBtn = await page.locator('button:has-text("查詢")').count();
    const resetBtn = await page.locator('button:has-text("重置")').count();
    const addLink = await page.locator('a:has-text("＋ 新增預約"), a:has-text("+ 新增預約")').count();
    record("有日期 input", dateInput >= 1);
    record("有「查詢」button", queryBtn >= 1);
    record("有「重置」button", resetBtn >= 1);
    record("有「+ 新增預約」link", addLink >= 1);

    // 7. DataGrid 至少 1 row（indian seed 5 筆）
    const dataRows = await page.locator("tbody tr").count();
    record("表格至少 1 row", dataRows >= 1, `rows=${dataRows}`);

    // 8. row 內看到「預檢」與「編輯」操作
    const previewBtn = await page.locator('button:has-text("預檢")').count();
    const editLink = await page.locator('a:has-text("編輯")').count();
    record("有「預檢」button (disabled placeholder)", previewBtn >= 1, `count=${previewBtn}`);
    record("有「編輯」link", editLink >= 1, `count=${editLink}`);

    // 9. Screenshot for human review
    await page.screenshot({ path: "/tmp/verify-appointments-list.png", fullPage: true });
    record("截圖存到 /tmp/verify-appointments-list.png", true);

    // 10. Click 編輯 -> 進 detail page
    if (editLink >= 1) {
      const firstEdit = page.locator('a:has-text("編輯")').first();
      const href = await firstEdit.getAttribute("href");
      record("第一筆編輯 link 有 href", !!href, `href=${href}`);
      if (href) {
        await page.goto(BASE + href, { waitUntil: "networkidle", timeout: 30000 });
        const breadcrumbToList = await page.locator('a:has-text("預約管理看板")').count();
        record("進入 detail page、breadcrumb 有「預約管理看板」link", breadcrumbToList >= 1);
        const editPill = await page.locator('button:has-text("修改")').count();
        record("detail page 有「修改」pill", editPill >= 1);
        await page.screenshot({ path: "/tmp/verify-appointments-detail.png", fullPage: true });
        record("截圖 detail 存到 /tmp/verify-appointments-detail.png", true);
      }
    }

    // 11. New page
    await page.goto(BASE + TARGET + "/new", { waitUntil: "networkidle", timeout: 30000 });
    const createPill = await page.locator('button:has-text("建立並開啟")').count();
    record("/new 有「建立並開啟」button", createPill >= 1);
    const createBadge = await page.locator("text=建立模式").count();
    record("/new 有「建立模式」badge", createBadge >= 1);
    await page.screenshot({ path: "/tmp/verify-appointments-new.png", fullPage: true });
    record("截圖 new 存到 /tmp/verify-appointments-new.png", true);

    const passed = checks.filter((c) => c.ok).length;
    const failed = checks.filter((c) => !c.ok).length;
    console.log(`\n=== ${passed} passed / ${failed} failed (total ${checks.length}) ===`);
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error("[fatal]", err);
    try {
      await page.screenshot({ path: "/tmp/verify-appointments-fatal.png", fullPage: true }).catch(() => null);
    } catch {}
    process.exit(2);
  } finally {
    await browser.close();
  }
})();
