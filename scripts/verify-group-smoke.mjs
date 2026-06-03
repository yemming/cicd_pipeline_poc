/**
 * 集團模組全頁 smoke（admin + indian scope）— 18 GRP 場景對應路由逐一載入，
 * 驗 HTTP ok + 有實質渲染內容 + 無 Next error overlay。抓本輪 GRP14 改動的跨頁回歸。
 *   node scripts/verify-group-smoke.mjs
 */
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";

// 路由 → 場景標籤
const ROUTES = [
  ["/group/group-overview", "GRP01 集團總覽"],
  ["/group/bsc", "GRP02 BSC 計分卡"],
  ["/group/sales-target", "GRP03 銷售目標/Pace"],
  ["/group/dashboard", "GRP04 集團看板"],
  ["/group/quarterly-report", "GRP05 季度績效報告"],
  ["/group/dashboard-mobile", "GRP06 看板Mobile"],
  ["/group/sales-efficiency", "GRP07 銷售顧問能效"],
  ["/group/sa-efficiency", "GRP08 SA 能效"],
  ["/group/store-sales", "GRP09 門店銷售診斷"],
  ["/group/store-service", "GRP10 門店售後診斷"],
  ["/group/parts-financials", "GRP12/19 集團零件財務"],
  ["/group/promotions", "GRP13 促銷活動"],
  ["/group/pricing", "GRP14 定價折扣"],
  ["/group/tech-efficiency", "GRP15 技師效率"],
  ["/group/health-score", "GRP16 Dealer Health"],
  ["/group/store-quadrant", "GRP17 門店四象限"],
  ["/group/customer-dynamics", "GRP18 集團客戶動態"],
  ["/group/org-structure", "GRP20 組織架構"],
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
      // 用精確的 Next error overlay / 404 / 權限頁標記（不用裸數字，避免誤中價格如 NT$4,500）
      const hasError =
        /Application error|Unhandled Runtime Error|This page could not be found|僅限管理者|無權限/.test(
          bodyText,
        );
      const ok = status >= 200 && status < 400 && bodyText.trim().length > 150 && !hasError;
      results.push({ label, ok, extra: `HTTP ${status} · ${bodyText.trim().length} chars` });
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
