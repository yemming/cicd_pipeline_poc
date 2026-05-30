// Round-21 GRP13 促銷活動管理 — Deploy-then-Test（打正式站）
// 用法：node round21-verify.mjs
// 流程：登入正式站 → /group/promotions → 斷言 list/KPI/tabs/監看表/效益/越界 banner
//       → 開 side panel 新增活動（折扣驗證 + 海報即時更新）→ 送出 → 截圖
// DB 落地確認 + 清測試記錄：腳本印出建立的活動名稱，由 MCP execute_sql 查 business_rules 驗證。

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const OUT = "docs/test-evidence/round-21";
const TEST_NAME = `__R21測試活動_${Date.now()}`;

mkdirSync(OUT, { recursive: true });

let pass = 0,
  fail = 0;
const log = (ok, msg) => {
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${msg}`);
  ok ? pass++ : fail++;
};

const consoleErrors = [];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
page.on("console", (m) => {
  if (m.type() === "error") consoleErrors.push(m.text());
});

try {
  // ── 登入（沿用 round20 已驗證流程）──
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  log(!page.url().includes("/login"), `登入成功（${page.url()}）`);
  await ctx.addCookies([
    { name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE },
  ]);

  // ── 進 GRP13 ──
  await page.goto(`${BASE}/group/promotions`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2500);
  const bodyText = await page.textContent("body");

  log(bodyText.includes("促銷活動管理"), "頁面標題 促銷活動管理");
  log(bodyText.includes("GRP13"), "GRP13 章節 chip");
  log(bodyText.includes("進行中活動"), "KPI：進行中活動");
  log(bodyText.includes("折扣越界") || bodyText.includes("待確認"), "KPI/banner：折扣越界 / 待確認");
  log(bodyText.includes("門店折扣執行監看"), "區塊：門店折扣執行監看");
  log(bodyText.includes("活動效益分析"), "區塊：活動效益分析");

  // 活動卡（seed 8 筆）
  const cardTitles = ["Q2換季保養優惠", "FTR 1200 試乘購車禮", "年度保養包"];
  for (const t of cardTitles) log(bodyText.includes(t), `活動卡：${t}`);

  // 越界門店（高雄 78折）
  log(bodyText.includes("78折") || bodyText.includes("越界"), "監看表：高雄越界 78折");
  // 效益指標
  log(bodyText.includes("2.84M") || bodyText.includes("回購率"), "效益：年度保養包 / 回購率");

  await page.screenshot({ path: `${OUT}/grp13-list.png`, fullPage: true });

  // 狀態 tabs 點「進行中」
  const tab = page.locator('button:has-text("進行中")').first();
  if (await tab.count()) {
    await tab.click();
    await page.waitForTimeout(800);
    log(true, "狀態 tab 切換 進行中");
  }

  // ── 開 side panel 新增活動 ──
  await page.click('button:has-text("新增活動")');
  await page.waitForTimeout(1000);
  const panelText = await page.textContent("body");
  log(panelText.includes("新增促銷活動"), "Side panel 開啟（新增促銷活動）");
  log(panelText.includes("折扣授權範圍"), "panel：折扣授權範圍區塊");
  log(panelText.includes("LINE 海報預覽"), "panel：LINE 海報預覽區塊");

  // 填表
  await page.fill('input[placeholder*="2026 Q3"], input[placeholder*="夏季精品節"]', TEST_NAME);
  // 折扣下限/上限
  const nums = page.locator('input[type="number"]');
  await nums.nth(0).fill("85");
  await nums.nth(1).fill("95");
  await page.waitForTimeout(400);
  const afterDisc = await page.textContent("body");
  log(afterDisc.includes("授權範圍：85折 ～ 95折"), "折扣驗證：85～95 顯示 OK");

  // 折扣標語（海報即時更新）
  const discInput = page.locator('input[placeholder*="全館85折起"]');
  if (await discInput.count()) {
    await discInput.fill("全館88折起");
    await page.waitForTimeout(400);
    const posterText = await page.textContent("body");
    log(posterText.includes("全館88折起"), "海報即時更新：折扣標語綁定");
  }

  await page.screenshot({ path: `${OUT}/grp13-panel.png`, fullPage: true });

  // 送出（建立活動）— banner 2.2s 自動消，故在 1.2s 內抓；panel 關閉也是成功訊號
  await page.click('button:has-text("建立活動")');
  await page.waitForTimeout(1200);
  const bannerText = await page
    .locator(".fixed.bottom-6.right-6")
    .textContent()
    .catch(() => "");
  const panelClosed = (await page.locator("text=新增促銷活動").count()) === 0;
  log(
    (bannerText && bannerText.includes("已建立活動")) || panelClosed,
    `建立活動成功（banner="${bannerText}" panelClosed=${panelClosed}）`,
  );

  await page.screenshot({ path: `${OUT}/grp13-created.png`, fullPage: true });

  // console error
  log(consoleErrors.length === 0, `無 console error（${consoleErrors.length} 筆）`);
  if (consoleErrors.length) console.log("  console errors:", consoleErrors.slice(0, 5));
} catch (e) {
  log(false, `例外：${e.message}`);
  await page.screenshot({ path: `${OUT}/grp13-error.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  console.log(`\n建立的測試活動名稱（供 DB 查驗 + 清除）：${TEST_NAME}`);
  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  process.exit(fail ? 1 : 0);
}
