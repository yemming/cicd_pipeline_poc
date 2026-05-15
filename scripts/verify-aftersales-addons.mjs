#!/usr/bin/env node
/**
 * Headless Playwright CLI 驗證 — /parts/aftersales/addons（追加項目記錄）
 *
 * 驗證項：
 *   1. /parts/aftersales/addons 載入 HTTP 200
 *   2. Page header「追加項目記錄」存在
 *   3. KPI 6 格存在
 *   4. Filter bar 4 個欄位 + 查詢/重置/+新增 button
 *   5. DataGrid 至少有 demo seed 3 筆 row
 *   6. 點「決策」按鈕，DecideModal 開啟
 *   7. 截圖到 /tmp/aftersales-addons.png
 */
import { chromium } from "playwright";

const BASE = process.env.APP_URL || "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const TARGET = `${BASE}/parts/aftersales/addons`;
const SCREENSHOT = "/tmp/aftersales-addons.png";

let exitCode = 0;
const results = [];

function check(label, ok, detail = "") {
  results.push({ label, ok, detail });
  if (!ok) exitCode = 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  ignoreHTTPSErrors: true,
});
const page = await ctx.newPage();

try {
  const resp = await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 90_000 });
  let status = resp?.status() ?? 0;
  console.log(`[nav] ${TARGET} → ${status}`);

  if (page.url().includes("/login")) {
    console.log("[auth] redirected to /login → filling credentials");
    await page.fill('input[type="email"], input[name="email"]', EMAIL);
    await page.fill('input[type="password"], input[name="password"]', PASSWORD);
    await Promise.all([
      page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 30_000 }),
      page.click('button[type="submit"]'),
    ]);
    if (!page.url().endsWith("/parts/aftersales/addons")) {
      const goRsp = await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 90_000 });
      status = goRsp?.status() ?? 0;
    } else {
      status = 200;
    }
  }

  check("Page HTTP 200", status === 200, `status=${status}`);

  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

  const bodyText = await page.locator("body").innerText().catch(() => "");

  check("Page header「追加項目記錄」存在", bodyText.includes("追加項目記錄"));
  check("Sprint chip「售後・Phase 4.5」存在", bodyText.includes("售後・Phase 4.5"));

  for (const k of ["總筆數", "待確認", "已同意", "已拒絕", "同意金額", "待追蹤"]) {
    check(`KPI 「${k}」存在`, bodyText.includes(k));
  }

  for (const k of ["決策狀態", "安全等級", "指定工單", "搜尋項目名稱"]) {
    check(`Filter 欄位「${k}」存在`, bodyText.includes(k));
  }

  for (const k of ["查詢", "重置", "＋ 新增追加項目"]) {
    check(`Button「${k}」存在`, bodyText.includes(k));
  }

  // 確認 demo seed
  for (const k of ["後避震器油封更換", "空氣濾芯更換", "前煞車卡鉗檢修"]) {
    check(`Demo addon「${k}」渲染`, bodyText.includes(k));
  }

  // 點「決策」開啟 modal
  const decideBtn = await page.$('button:has-text("決策")');
  if (decideBtn) {
    await decideBtn.click();
    await page.waitForTimeout(400);
    const modalText = await page.locator("body").innerText().catch(() => "");
    check("DecideModal 開啟（含「車主決策」標題）", modalText.includes("車主決策 —"));
    check("DecideModal 含「✅ 車主同意」選項", modalText.includes("✅ 車主同意"));
    check("DecideModal 含「❌ 拒絕（→ 增項閉環）」選項", modalText.includes("❌ 拒絕"));
  } else {
    check("找到「決策」按鈕", false);
  }

  await page.screenshot({ path: SCREENSHOT, fullPage: true });
  console.log(`[shot] ${SCREENSHOT}`);
} catch (err) {
  console.error("[fatal]", err.message);
  exitCode = 1;
  try { await page.screenshot({ path: SCREENSHOT, fullPage: true }); } catch {}
} finally {
  await browser.close();
}

console.log("\n=== 驗證總結 ===");
const passed = results.filter((r) => r.ok).length;
console.log(`Passed ${passed}/${results.length}`);
process.exit(exitCode);
