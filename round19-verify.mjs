// 一次性 E2E：對正式站驗第十九輪 GRP18 集團客戶動態
// admin 登入 → Indian scope → 集團視圖斷言 + drill-down 切換 + 截圖
// 跑：node round19-verify.mjs
import { chromium } from "playwright";
import fs from "node:fs";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "https://dealeros.zeabur.app";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";
const SHOT_DIR = "docs/test-evidence/round-19";
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

const DENY = /無權限|請先登入|找不到|僅限管理者|Coming soon|尚未開發|This page could not|Application error/i;
async function goto(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(2000);
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

  // ── 集團視圖 ──
  console.log(`\n[2] GRP18 集團視圖 /group/customer-dynamics`);
  await goto("/group/customer-dynamics");
  let body = await page.locator("body").innerText();
  if (DENY.test(body)) {
    ok("GRP18 頁可見", false, body.slice(0, 160));
    await page.screenshot({ path: `${SHOT_DIR}/customer-dynamics-DENIED.png`, fullPage: true });
  } else {
    ok("GRP18 頁可見", true);
    ok("H1『集團客戶動態』", await page.getByRole("heading", { name: /集團客戶動態/ }).first().isVisible().catch(() => false));
    ok("GRP18 chip", /GRP18/.test(body));
    const svg = await page.locator("svg").count();
    ok("圖表 svg >= 3（donut+流動bar+流失bar+NPS線）", svg >= 3, `${svg} svg`);
    ok("漏斗階段（潛在客戶/回購客戶）", /潛在客戶/.test(body) && /回購客戶/.test(body));
    ok("來源分析（客戶介紹）", /客戶介紹/.test(body));
    ok("5 KPI（活躍客戶/回購率/流失率/NPS）", /活躍客戶/.test(body) && /回購率/.test(body) && /流失率/.test(body) && /NPS/.test(body));
    ok("含 5 店名", /台北/.test(body) && /台中/.test(body) && /高雄/.test(body) && /台南/.test(body) && /嘉義/.test(body));
    ok("高風險彙總表（建議行動）", /高風險/.test(body) && /(關懷簡訊|電話關懷)/.test(body));
    ok("客戶警示橫幅", /客戶警示/.test(body));
    await page.screenshot({ path: `${SHOT_DIR}/customer-dynamics-group.png`, fullPage: true });
  }

  // ── 單店深鑽（switchStore 純前端切，選台中＝危機店）──
  console.log(`\n[3] drill-down → 台中直營店`);
  await page.locator("select").first().selectOption({ label: "台中直營店" }).catch(() => {});
  await page.waitForTimeout(1500);
  body = await page.locator("body").innerText();
  ok("進入單店深鑽模式", /單店深鑽模式/.test(body));
  ok("mode-bar 店名（台中直營店）", /台中直營店/.test(body));
  ok("客戶名單（匿名代號 C-TCH）", /C-TCH/.test(body));
  ok("高風險流失客戶清單", /高風險流失客戶清單/.test(body));
  ok("未回廠天數欄（天）", /\d+天/.test(body));
  await page.screenshot({ path: `${SHOT_DIR}/customer-dynamics-drill-tch.png`, fullPage: true });

  // ── 返回集團總覽 ──
  console.log(`\n[4] 返回集團總覽`);
  await page.getByRole("button", { name: /返回集團總覽/ }).click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1200);
  body = await page.locator("body").innerText();
  ok("返回集團視圖（高風險彙總表回來）", /集團彙總/.test(body) && !/單店深鑽模式/.test(body));

  ok("無 console error", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | ").slice(0, 260));
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
