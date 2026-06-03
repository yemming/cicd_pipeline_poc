/**
 * 銷售接待模組（① RS01~RS06 + RS_EX1）全頁 smoke（admin + indian scope）。
 * 對著真 React app 逐路由載入，驗 HTTP ok + 實質渲染 + 無 Next error / 權限 overlay。
 *   node scripts/verify-sales-reception-scenarios.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";

const ROUTES = [
  ["/sales/reception/handcard", "RS01 電子手卡 list"],
  ["/sales/reception/handcard/new", "RS01 電子手卡 new"],
  ["/sales/reception/test-rides", "RS02 試乘試駕 list"],
  ["/sales/reception/test-rides/wizard", "RS02 試乘 wizard"],
  ["/sales/showroom/new-cars", "RS03A 新車庫存看板"],
  ["/sales/showroom/stock", "RS03A 展廳庫存"],
  ["/sales/showroom/used-cars", "RS03B 中古車庫存看板"],
  ["/sales/quote", "RS04 報價單 list"],
  ["/sales/quote/new", "RS04 報價單 new"],
  ["/sales/orders", "RS04 成交訂單 list"],
  ["/sales/orders/new", "RS04 成交訂單 new"],
  ["/sales/delivery", "RS05 交車管理"],
  ["/sales/inventory/used-purchase", "RS06 中古車收購 list"],
  ["/sales/inventory/used-purchase/new", "RS06 中古車收購 new"],
  ["/sales/insurance", "RS_EX1 保險招攬工作台"],
];

const results = [];
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(EMAIL);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20_000 });
  await context.addCookies([
    { name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE },
  ]);

  for (const [route, label] of ROUTES) {
    try {
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 40_000 });
      const status = resp?.status() ?? 0;
      const bodyText = (await page.locator("body").innerText().catch(() => "")) ?? "";
      const hasError =
        /Application error|Unhandled Runtime Error|This page could not be found|僅限管理者|無權限|沒有.*權限/.test(
          bodyText,
        );
      const ok = status >= 200 && status < 400 && bodyText.trim().length > 150 && !hasError;
      results.push({ label, ok, extra: `HTTP ${status} · ${bodyText.trim().length} chars${hasError ? " · ERROR_OVERLAY" : ""}` });
    } catch (e) {
      results.push({ label, ok: false, extra: String(e).slice(0, 100) });
    }
  }
} catch (e) {
  results.push({ label: "SETUP", ok: false, extra: String(e).slice(0, 200) });
} finally {
  await browser.close();
}

let pass = 0;
for (const r of results) {
  console.log(`${r.ok ? "✅" : "❌"} ${r.label}  — ${r.extra}`);
  if (r.ok) pass++;
}
console.log(`\n${pass}/${results.length} 綠`);
process.exit(pass === results.length ? 0 : 1);
