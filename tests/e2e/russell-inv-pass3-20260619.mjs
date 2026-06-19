// Pass3 — 場景九 Price Book 匯入 modal 乾淨截圖
import { chromium } from "@playwright/test";
const BASE = "https://dealeros.zeabur.app";
const HOST = new URL(BASE).hostname;
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260619/shots";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 950 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type=email]', "yemming.yu@gmail.com");
  await page.fill('input[type=password]', "yemming.yu@gmail.com");
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {});
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" }]);
  await page.goto(`${BASE}/parts/setup/items`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  // 點「原廠 Price Book 匯入」按鈕
  const btn = page.getByRole("button", { name: /Price Book|原廠.*匯入/ }).first();
  await btn.click().catch((e) => console.log("click fail " + e));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/S9b_pricebook-modal.png` });
  console.log("📸 S9b_pricebook-modal");
} catch (e) { console.log("ERR " + e); } finally { await browser.close(); }
