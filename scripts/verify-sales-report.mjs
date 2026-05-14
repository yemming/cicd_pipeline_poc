// Playwright CLI 驗證 RS_M2 業績報表
import { chromium } from "playwright";

const TARGET = "http://localhost:3000/sales/manager/sales-report";
const EMAIL = "yemming.yu@gmail.com";
const PASS = "yemming.yu@gmail.com";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
});

// Step 1: 預先導 /login 等 dev compile（dev mode 第一次編譯慢）
console.log("→ warmup /login");
await page.goto("http://localhost:3000/login", { waitUntil: "load", timeout: 180000 });
await page.waitForSelector('input[type="email"]', { timeout: 30000 });
// 等 client component hydration（onSubmit handler 才會掛上）
await page.waitForLoadState("networkidle", { timeout: 60000 }).catch(() => null);
await page.waitForTimeout(3000);

console.log("→ filling login form");
await page.fill('input[type="email"]', EMAIL);
await page.fill('input[type="password"]', PASS);
const supabaseAuth = page.waitForResponse(
  (r) => r.url().includes("supabase.co/auth/v1/token"),
  { timeout: 120000 },
).catch((e) => { console.log("auth wait failed:", e.message); return null; });
await page.click('button[type="submit"]');
const r = await supabaseAuth;
console.log(`→ supabase auth: ${r ? `${r.status()} ${r.url()}` : "missed"}`);

// 等 router.push("/dashboard") 完成（dev 第一次編譯可能 >60s）
try {
  await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 240000 });
} catch {
  const errText = await page.evaluate(() => {
    const el = document.querySelector('.text-on-error-container');
    return el ? el.textContent : null;
  });
  console.log(`login error visible: ${errText}`);
  console.log(`current url: ${page.url()}`);
  throw new Error(`登入沒跳走`);
}
console.log(`→ post-login url: ${page.url()}`);

// Step 2: 導目標頁（dev mode 第一次 compile 可能 >2 分鐘）
console.log(`→ navigate ${TARGET}`);
await page.goto(TARGET, { waitUntil: "commit", timeout: 300000 });
console.log(`→ committed: ${page.url()}`);

if (page.url().includes("/login")) {
  throw new Error("登入失敗或 session 沒帶上，仍被導回 /login");
}

await page.waitForSelector('[data-testid="sales-manager-report-page"]', { timeout: 60000 });
await page.waitForTimeout(2000);

// 抓關鍵 elements
const checks = await page.evaluate(() => {
  const txt = document.body.innerText;
  const txtLower = txt.toLowerCase();
  return {
    hasPageTestId: !!document.querySelector('[data-testid="sales-manager-report-page"]'),
    hasLayer1: txtLower.includes("layer 1") && txt.includes("結果指標"),
    hasLayer2: txtLower.includes("layer 2") && txt.includes("過程指標"),
    hasLayer3: txtLower.includes("layer 3") && txt.includes("行為數據"),
    hasBep: txt.includes("損益平衡進度"),
    hasMonthly: txt.includes("近 5 個月成交台數趨勢"),
    hasRsRanking: txt.includes("RS 個人業績排行"),
    hasModels: txt.includes("車系業績分析"),
    hasWeekly: txt.includes("本月週趨勢"),
    hasFinPlaceholder: txt.includes("財務損益報表"),
    hasExportBtn: txt.includes("匯出 Excel"),
    hasPeriodToggle: txt.includes("本月") && txt.includes("本季") && txt.includes("本年"),
    hasRsName: txt.includes("林佳蓉"),
    hasModelName: txt.includes("Panigale V4"),
    rowCount: document.querySelectorAll("tbody tr").length,
    kpiCardCount: document.querySelectorAll('[class*="border-["][class*="rounded-lg"][class*="px-3.5"]').length,
  };
});

await page.screenshot({ path: "/tmp/sales-report.png", fullPage: true });

console.log("checks:", JSON.stringify(checks, null, 2));
console.log("errors:", errors);
const allPass = Object.values(checks).every((v) => (typeof v === "boolean" ? v : v > 0));
console.log("ALL PASS:", allPass);

await browser.close();
process.exit(errors.filter((e) => !e.includes("Failed to load resource")).length > 0 || !allPass ? 1 : 0);
