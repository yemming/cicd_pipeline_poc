/**
 * GRP14 → 04B/07B 下游定價同步鏈 端到端驗證（admin + indian scope）
 *   node scripts/verify-grp14-pricing-sync.mjs
 * 流程：建定價政策(msrp 6000, 綁 MN-6K) → 送審 → 核准 → 驗同步筆數 banner + 07B/04B 徽章。
 * DB 斷言 + 清理由主 agent 另以 SQL 做（本腳本只負責 UI 流程 + UI 斷言，並印出新政策 URL）。
 */
import { chromium } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EMAIL = "yemming.yu@gmail.com";
const NAME = "[E2E同步測試]6K保養定價";

const results = [];
const ok = (n, c, extra = "") => results.push({ n, c, extra });

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
let policyUrl = "";

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(EMAIL);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20_000 });
  await context.addCookies([
    { name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian" }), url: BASE },
  ]);
  ok("login + scope", true);

  // 1) 建新定價政策
  await page.goto(`${BASE}/group/pricing/new`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.getByPlaceholder("例：FTR 1200 S / 原廠機油濾心").fill(NAME);
  await page.getByPlaceholder("例：689000").fill("6000");
  await page.getByPlaceholder("例：93").fill("90");
  await page.getByPlaceholder("例：100").fill("100");
  ok("下游套餐多選區塊出現", await page.getByText("下游服務套餐").first().isVisible());

  // 勾 MN-6K：找含 MN-6K 文字的 label，內含 checkbox
  const mn6kLabel = page.locator("label", { hasText: "MN-6K" }).first();
  await mn6kLabel.locator('input[type="checkbox"]').check();
  ok("勾選 MN-6K", await mn6kLabel.locator('input[type="checkbox"]').isChecked());

  // 建立並開啟 → 進 detail
  await page.getByRole("button", { name: /建立並開啟/ }).click();
  await page.waitForURL(/\/group\/pricing\/[0-9a-f-]{36}/, { timeout: 20_000 });
  policyUrl = page.url();
  ok("建立後進 detail", /\/group\/pricing\/[0-9a-f-]{36}/.test(policyUrl), policyUrl);

  // 2) 送審
  await page.getByRole("button", { name: /^送審$/ }).click();
  await page.getByText(/已送審/).first().waitFor({ timeout: 15_000 });
  ok("送審成功", true);

  // 3) 核准生效 → 驗同步筆數 banner
  await page.getByRole("button", { name: /核准生效/ }).click();
  const syncedBanner = page.getByText(/已同步\s*1\s*個服務套餐定價/);
  await syncedBanner.waitFor({ timeout: 15_000 });
  ok("核准 banner 顯示同步 1 筆", true);

  // 4) 07B 服務套餐：MN-6K 受集團定價管控 chip
  await page.goto(`${BASE}/parts/aftersales/management/service-packages`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  ok(
    "07B 受集團定價管控徽章",
    await page.getByText(/受集團定價管控/).first().isVisible().catch(() => false),
  );

  // 5) 04B 快速報價：MN-6K 集團定價 chip + 反映 6000
  await page.goto(`${BASE}/parts/aftersales/quick-quote`, {
    waitUntil: "networkidle",
    timeout: 30_000,
  });
  ok(
    "04B 集團定價 chip",
    await page.getByText(/集團定價/).first().isVisible().catch(() => false),
  );
  ok(
    "04B 反映同步價 6,000",
    await page.getByText(/6,000|6000/).first().isVisible().catch(() => false),
  );
} catch (e) {
  ok("EXCEPTION", false, String(e).slice(0, 300));
} finally {
  await browser.close();
}

let pass = 0;
for (const r of results) {
  console.log(`${r.c ? "✅" : "❌"} ${r.n}${r.extra ? "  — " + r.extra : ""}`);
  if (r.c) pass++;
}
console.log(`\n${pass}/${results.length} 綠`);
console.log(`POLICY_URL=${policyUrl}`);
process.exit(pass === results.length ? 0 : 1);
