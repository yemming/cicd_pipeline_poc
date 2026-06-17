// TL 橋接 repair-pick — 正式站截圖（倉管看到 TL 工單 + 進入備料預覽）
// 跑：node tests/e2e/tl-repair-pick-shots.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE || "https://dealeros.zeabur.app";
const HOST = new URL(BASE).hostname;
const TL_CODE = "TL-IN-260616-901";
const OUT = process.env.OUT || "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260617/shots";
fs.mkdirSync(OUT, { recursive: true });

const log = (m) => console.log(m);
async function shot(page, name, full = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }).catch((e) => log("shot fail " + e));
  log("📸 " + name);
}

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
  log("登入後 URL: " + page.url());

  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
      domain: HOST,
      path: "/",
    },
  ]);

  // 1. repair-pick → 待領料工單 tab（倉管看到 TL 工單）
  await page.goto(`${BASE}/parts/issue/repair-pick`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const woTab = page.getByRole("button", { name: /待領料工單/ }).first();
  if (await woTab.count().catch(() => 0)) {
    await woTab.click().catch(() => {});
    await page.waitForTimeout(800);
  }
  log(`待領料工單列表含 ${TL_CODE}: ${(await page.content()).includes(TL_CODE)}`);
  await shot(page, "01_repair-pick_pending_TL"); // viewport focused

  // 2. 點 TL 卡片的「備料」→ 進備料/預覽
  const tlCard = page.locator(`text=${TL_CODE}`).first();
  await tlCard.scrollIntoViewIfNeeded().catch(() => {});
  // 找該卡片內的備料按鈕：用 TL 文字所在卡片往上找按鈕
  const pickBtn = page
    .locator("div", { has: page.locator(`text=${TL_CODE}`) })
    .locator("button, a", { hasText: /備料/ })
    .last();
  let navigated = false;
  if (await pickBtn.count().catch(() => 0)) {
    await Promise.all([
      page.waitForLoadState("networkidle").catch(() => {}),
      pickBtn.click().catch(() => {}),
    ]);
    await page.waitForTimeout(2500);
    navigated = page.url().includes("/repair-pick/new") || (await page.content()).includes(TL_CODE);
  }
  log("備料按鈕導向: " + navigated + " url=" + page.url());
  await shot(page, "02_repair-pick_pick-preview_TL", true);

  log("DONE");
} catch (e) {
  log("ERROR: " + e);
  await shot(page, "99_error");
} finally {
  await browser.close();
}
