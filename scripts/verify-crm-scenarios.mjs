/**
 * 客服管理（CRM）模組全頁 smoke（admin + indian scope）— 13 路由逐一載入，
 * 驗 HTTP ok + 有實質渲染內容 + 無 Next error overlay。對應 19 個 CRM 場景。
 *   node scripts/verify-crm-scenarios.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";

const ROUTES = [
  ["/crm/sales/customer-base", "CRM01A 銷售客戶基盤"],
  ["/crm/sales/survey-templates", "CRM02A 銷售問卷設定"],
  ["/crm/sales/call-tasks", "CRM03A 銷售電訪工作台"],
  ["/crm/sales/dormant-leads", "CRM04A 銷售休眠戰敗"],
  ["/crm/sales/nps", "CRM05A 銷售 NPS 看板"],
  ["/crm/sales/push-notifications", "CRM06A 銷售推播通知"],
  ["/crm/aftersales/customer-base", "CRM01B 售後客戶基盤"],
  ["/crm/aftersales/survey-templates", "CRM02B 售後問卷設定"],
  ["/crm/aftersales/call-tasks", "CRM03B 售後電訪工作台"],
  ["/crm/aftersales/dormant-customers", "CRM04B 售後休眠流失"],
  ["/crm/aftersales/nps", "CRM05B 售後 NPS 看板"],
  ["/crm/aftersales/push-notifications", "CRM06B 售後推播通知"],
  ["/crm/store-report", "CRM07 店長綜合報表"],
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
      const resp = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 30_000 });
      const status = resp?.status() ?? 0;
      const bodyText = (await page.locator("body").innerText().catch(() => "")) ?? "";
      const hasError =
        /Application error|Unhandled Runtime Error|This page could not be found|僅限管理者|無權限|沒有.*權限/.test(
          bodyText,
        );
      const ok = status >= 200 && status < 400 && bodyText.trim().length > 150 && !hasError;
      results.push({ label, ok, extra: `HTTP ${status} · ${bodyText.trim().length} chars${hasError ? " · ⚠error-overlay" : ""}` });
    } catch (e) {
      results.push({ label, ok: false, extra: String(e).slice(0, 80) });
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
