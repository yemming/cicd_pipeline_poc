// 一次性 E2E：對正式站驗第十八輪 GRP16/17 策略評估層
// admin 登入 → Indian scope → 兩頁斷言 + 截圖
// 跑：node round18-verify.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHOT_DIR = "docs/test-evidence/round-18";
fs.mkdirSync(SHOT_DIR, { recursive: true });

const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  ✓" : "  ✗"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
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
  console.log(`\n[1] 登入 ${BASE}/login`);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 30000 });
  ok("登入成功", true, page.url());
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE }]);
  ok("設定 Indian scope cookie", true);

  // GRP16 Dealer Health Score
  console.log(`\n[2] GRP16 /group/health-score`);
  await goto("/group/health-score");
  let body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP16 頁可見", false, body.slice(0, 140));
    await page.screenshot({ path: `${SHOT_DIR}/health-score-DENIED.png`, fullPage: true });
  } else {
    ok("GRP16 頁可見", true);
    ok("H1『Dealer Health Score』", await page.getByRole("heading", { name: /Dealer Health Score/i }).first().isVisible().catch(() => false));
    const svg = await page.locator("svg").count();
    ok("圖表 svg >= 5（gauge+雷達+走勢）", svg >= 5, `${svg} svg`);
    ok("含門店名（台北/台中）", /台北|台中/.test(body));
    ok("含分級標籤（優秀/良好/普通/警示/危險）", /優秀|良好|普通|警示|危險/.test(body));
    await page.screenshot({ path: `${SHOT_DIR}/health-score.png`, fullPage: true });
  }

  // GRP17 門店評估四象限
  console.log(`\n[3] GRP17 /group/store-quadrant`);
  await goto("/group/store-quadrant");
  body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP17 頁可見", false, body.slice(0, 140));
    await page.screenshot({ path: `${SHOT_DIR}/store-quadrant-DENIED.png`, fullPage: true });
  } else {
    ok("GRP17 頁可見", true);
    ok("H1『門店評估四象限』", await page.getByRole("heading", { name: /門店評估四象限/ }).first().isVisible().catch(() => false));
    const svg = await page.locator("svg").count();
    ok("四象限散佈圖 svg >= 1", svg >= 1, `${svg} svg`);
    ok("含象限標籤（卓越/重點輔導）", /卓越|重點輔導|待發展|穩健/.test(body));
    ok("含門店名", /台北|台中|高雄|台南|嘉義/.test(body));
    // 點第一間門店列觸發詳情面板
    const firstStore = page.getByText(/台北|台中|高雄/).first();
    await firstStore.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${SHOT_DIR}/store-quadrant.png`, fullPage: true });
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
