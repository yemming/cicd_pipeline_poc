// Pass4 — 場景四 實測部分到貨：對 PO20260512-104(訂60,收0) 收部分量 → 驗 部分到貨 + 剩餘
import { chromium } from "@playwright/test";
const BASE = "https://dealeros.zeabur.app";
const HOST = new URL(BASE).hostname;
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260619/shots";
const PO_ID = "e3e7b153-1575-402b-9af0-5c385f2b9cca";
const PO_NO = "PO20260512-104";
const log = (m) => console.log(m);
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }).then(() => log("📸 " + n)).catch((e) => log("shot fail " + e));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 1100 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type=email]', "yemming.yu@gmail.com");
  await page.fill('input[type=password]', "yemming.yu@gmail.com");
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {});
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" }]);

  // 直接進該 PO 的收貨表單
  await page.goto(`${BASE}/parts/receipt/po-grn/new?po=${PO_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // 若仍是清單頁，點該 PO 的「收貨」
  if (await page.locator("tr", { hasText: PO_NO }).count().catch(() => 0)) {
    await page.locator("tr", { hasText: PO_NO }).first().getByRole("button", { name: /收貨|收/ }).click().catch(() => {});
    await page.waitForTimeout(1800);
  }
  await shot(page, "S4c_grn-form-before");

  // 把所有數量 input 設成部分量（每行設 1，遠小於訂購量 → 必為部分到貨）
  const nums = page.locator('input[type=number]');
  const cnt = await nums.count();
  log("數量 input 數: " + cnt);
  for (let i = 0; i < cnt; i++) {
    await nums.nth(i).fill("1").catch(() => {});
  }
  await page.waitForTimeout(500);
  // 送出（確認入庫 / 入庫 / 過帳）
  const submit = page.getByRole("button", { name: /確認入庫|一鍵入庫|入庫並過帳|確認收貨|過帳|入庫/ }).last();
  await submit.click().catch((e) => log("submit fail " + e));
  await page.waitForTimeout(4000);
  log("收貨後 URL: " + page.url());
  await shot(page, "S4d_grn-after-submit");

  // 驗 PO 詳情 → 部分到貨 + 進度
  await page.goto(`${BASE}/parts/purchase/orders/${PO_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const c = await page.content();
  log("PO詳情含『部分』: " + /部分到貨|部分入庫|部分/.test(c));
  log("PO詳情含進度%: " + /%/.test(c));
  await shot(page, "S4e_po-detail-partial");

  log("DONE Pass4");
} catch (e) { log("FATAL " + e); await shot(page, "S4_err"); } finally { await browser.close(); }
