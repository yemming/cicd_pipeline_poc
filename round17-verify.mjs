// 一次性 E2E：對正式站驗第十七輪 GRP09/10/11 門店診斷層
// admin 登入 → Indian scope → 三頁斷言 + GRP10 切台中店驗返修率告警 + 截圖
// 跑：node round17-verify.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const TAICHUNG = "17000000-0000-4000-8000-000000000001"; // 台中=返修率45%問題店
const SHOT_DIR = "docs/test-evidence/round-17";
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

const DENY = /無權限|請先登入|找不到|僅限管理者|Coming soon|尚未開發|This page could not/i;
async function goto(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(1800);
}

try {
  // 登入
  console.log(`\n[1] 登入 ${BASE}/login`);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  ok("登入成功", true, page.url());
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE }]);
  ok("設定 Indian scope cookie", true);

  // GRP11 跨部門能效
  console.log(`\n[2] GRP11 /group/cross-dept-efficiency`);
  await goto("/group/cross-dept-efficiency");
  let body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP11 頁可見", false, body.slice(0, 140));
    await page.screenshot({ path: `${SHOT_DIR}/cross-dept-DENIED.png`, fullPage: true });
  } else {
    ok("GRP11 頁可見", true);
    ok("H1『跨部門能效』", await page.getByRole("heading", { name: /跨部門能效/ }).first().isVisible().catch(() => false));
    const svg = await page.locator("svg").count();
    ok("散佈圖 svg >= 2", svg >= 2, `${svg} svg`);
    ok("含高流失 SA「魏呈宇」(資料對到 Indian)", /魏呈宇|蔡佩珊/.test(body));
    await page.screenshot({ path: `${SHOT_DIR}/cross-dept-efficiency.png`, fullPage: true });
  }

  // GRP09 門店銷售診斷（預設店）
  console.log(`\n[3] GRP09 /group/store-sales`);
  await goto("/group/store-sales");
  body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP09 頁可見", false, body.slice(0, 140));
    await page.screenshot({ path: `${SHOT_DIR}/store-sales-DENIED.png`, fullPage: true });
  } else {
    ok("GRP09 頁可見", true);
    ok("H1『門店銷售診斷』", await page.getByRole("heading", { name: /門店銷售診斷/ }).first().isVisible().catch(() => false));
    const svg = await page.locator("svg").count();
    ok("有圖表 svg >= 1（月趨勢）", svg >= 1, `${svg} svg`);
    ok("門店切換器含門店名", /台北|台中|高雄|台南|嘉義/.test(body));
    await page.screenshot({ path: `${SHOT_DIR}/store-sales.png`, fullPage: true });
  }

  // GRP10 門店售後診斷 — 切台中店驗返修率告警
  console.log(`\n[4] GRP10 /group/store-service?store=台中`);
  await goto(`/group/store-service?store=${TAICHUNG}`);
  body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP10 頁可見", false, body.slice(0, 140));
    await page.screenshot({ path: `${SHOT_DIR}/store-service-DENIED.png`, fullPage: true });
  } else {
    ok("GRP10 頁可見", true);
    ok("H1『門店售後診斷』", await page.getByRole("heading", { name: /門店售後診斷/ }).first().isVisible().catch(() => false));
    ok("返修率告警橫幅可見（台中 45%）", await page.getByText(/返修率異常/).first().isVisible().catch(() => false));
    ok("頁面含 45%（返修率）", /45\s*%|0\.45/.test(body));
    const svg = await page.locator("svg").count();
    ok("有圖表 svg >= 1（台次趨勢）", svg >= 1, `${svg} svg`);
    await page.screenshot({ path: `${SHOT_DIR}/store-service-taichung.png`, fullPage: true });
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
if (failed.length) { console.log("FAILED:"); failed.forEach((r) => console.log(`  ✗ ${r.name} — ${r.detail}`)); process.exit(1); }
console.log("ALL GREEN ✓"); process.exit(0);
