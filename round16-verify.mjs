// 一次性 E2E：對正式站驗第十六輪 GRP07/08 個人能效散佈圖
// admin yemming.yu@gmail.com 登入 → 設 Indian scope cookie → 打兩頁 → 斷言 + 截圖
// 跑：node round16-verify.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHOT_DIR = "docs/test-evidence/round-16";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✓" : "  ✗"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

async function gotoPage(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1800); // 等 D3 client render
}

try {
  // ── 1) 登入 ──
  console.log(`\n[1] 登入 ${BASE}/login as ${EMAIL}`);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  ok("登入成功（離開 /login）", true, page.url());
  const cookies = await ctx.cookies();
  ok("取得 sb- auth cookie", cookies.some((c) => c.name.startsWith("sb-")));

  // ── 1.5) 強制 Indian scope（seeded 資料在 indian）──
  await ctx.addCookies([
    { name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE },
  ]);
  ok("設定 dealeros_scope=indian cookie", true);

  // ── 2) GRP07 銷售顧問能效 ──
  console.log(`\n[2] GRP07 /group/sales-efficiency`);
  await gotoPage("/group/sales-efficiency");
  let body = await page.locator("body").innerText();
  if (/無權限|請先登入|找不到|僅限管理者|Coming soon|尚未開發|This page could not/i.test(body)) {
    ok("GRP07 頁可見（非守門/placeholder）", false, body.slice(0, 160));
    await page.screenshot({ path: `${SHOT_DIR}/sales-efficiency-DENIED.png`, fullPage: true });
  } else {
    ok("GRP07 頁可見（非守門/placeholder）", true);
    const h1 = await page.getByRole("heading", { name: /銷售顧問能效/ }).first().isVisible().catch(() => false);
    ok("H1『銷售顧問能效』可見", h1);
    const svgCount = await page.locator("svg").count();
    ok("散佈圖 svg >= 4（4 圖）", svgCount >= 4, `${svgCount} svg`);
    const circles = await page.locator("svg circle").count();
    ok("銷售圓點 circle >= 8", circles >= 8, `${circles} circles`);
    const hasName = /黃柏勳|張承翰|周冠廷|蔡佩珊/.test(body);
    ok("頁面含 demo 業務名（資料對到 Indian）", hasName);
    await page.screenshot({ path: `${SHOT_DIR}/sales-efficiency.png`, fullPage: true });
    ok("GRP07 截圖存檔", true, `${SHOT_DIR}/sales-efficiency.png`);
  }

  // ── 3) GRP08 SA 能效診斷 ──
  console.log(`\n[3] GRP08 /group/sa-efficiency`);
  await gotoPage("/group/sa-efficiency");
  body = await page.locator("body").innerText();
  if (/無權限|請先登入|找不到|僅限管理者|Coming soon|尚未開發|This page could not/i.test(body)) {
    ok("GRP08 頁可見（非守門/placeholder）", false, body.slice(0, 160));
    await page.screenshot({ path: `${SHOT_DIR}/sa-efficiency-DENIED.png`, fullPage: true });
  } else {
    ok("GRP08 頁可見（非守門/placeholder）", true);
    const h1 = await page.getByRole("heading", { name: /SA\s*能效診斷/ }).first().isVisible().catch(() => false);
    ok("H1『SA 能效診斷』可見", h1);
    const svgCount = await page.locator("svg").count();
    ok("散佈圖 svg >= 4（4 圖）", svgCount >= 4, `${svgCount} svg`);
    const alertVisible = await page.getByText(/返修率異常/).first().isVisible().catch(() => false);
    ok("返修率告警橫幅可見", alertVisible);
    const hasWei = /魏呈宇/.test(body);
    ok("告警/頁面含 SA「魏呈宇」(返修率45%)", hasWei);
    await page.screenshot({ path: `${SHOT_DIR}/sa-efficiency.png`, fullPage: true });
    ok("GRP08 截圖存檔", true, `${SHOT_DIR}/sa-efficiency.png`);
  }

  ok("無 console error", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ").slice(0, 240));
} catch (e) {
  console.log("\n[FATAL]", e.message);
  await page.screenshot({ path: `${SHOT_DIR}/FATAL.png`, fullPage: true }).catch(() => {});
  results.push({ name: "FATAL", pass: false, detail: e.message });
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n===== ${passed}/${results.length} pass =====`);
const failed = results.filter((r) => !r.pass);
if (failed.length) {
  console.log("FAILED:");
  failed.forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`));
  process.exit(1);
}
console.log("ALL GREEN ✓");
process.exit(0);
