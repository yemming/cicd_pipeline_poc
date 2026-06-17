// TL 橋接 — 倉管備料預覽配置截圖（選 TL 工單 → 預覽 FIFO 出庫）
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE || "https://dealeros.zeabur.app";
const HOST = new URL(BASE).hostname;
const TL_CODE = "TL-IN-260616-901";
const TL_WO = "6b2ab934-eb06-425d-bb3f-60900690122d";
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260617/shots";
fs.mkdirSync(OUT, { recursive: true });
const log = (m) => console.log(m);

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type=email]', "yemming.yu@gmail.com");
  await page.fill('input[type=password]', "yemming.yu@gmail.com");
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }).catch(() => {});
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" }]);

  await page.goto(`${BASE}/parts/issue/repair-pick/new?ro=${TL_WO}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // 勾選 TL 工單 radio（找 TL 文字那一列的 radio）
  const row = page.locator("tr", { has: page.locator(`text=${TL_CODE}`) }).first();
  const radio = row.locator('input[type=radio]').first();
  if (await radio.count().catch(() => 0)) {
    await radio.check().catch(() => radio.click());
    await page.waitForTimeout(500);
  } else {
    // fallback：點該列
    await row.click().catch(() => {});
  }

  // 點「預覽配置」
  const previewBtn = page.getByRole("button", { name: /預覽配置/ }).first();
  if (await previewBtn.count().catch(() => 0)) {
    await previewBtn.click().catch(() => {});
    await page.waitForTimeout(3000);
  }
  log("預覽後含『可過帳』或料件: " + ((await page.content()).includes("過帳") || (await page.content()).includes("機油濾芯")));
  await page.screenshot({ path: `${OUT}/03_repair-pick_TL_fifo-preview.png`, fullPage: true });
  log("📸 03_repair-pick_TL_fifo-preview");
  log("DONE url=" + page.url());
} catch (e) {
  log("ERROR " + e);
  await page.screenshot({ path: `${OUT}/99b_error.png` }).catch(() => {});
} finally {
  await browser.close();
}
