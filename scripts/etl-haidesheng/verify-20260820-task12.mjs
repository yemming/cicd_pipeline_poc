import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE_URL = "https://dealeros.zeabur.app";
const SHOTS_DIR = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260820/screenshots";
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function login(page, email, password) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  // ── David: 任務① app_admin 升級 + 任務② Indian 視角不再顯示 Ducati 文字 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await login(page, "david@hdsmoto.com", process.env.DAVID_PW);

    // David 升 admin 後預設全品牌可見，新 session 沒有 scope cookie 會落在
    // accessibleBrands[0]（目前是 ducati）。比照 Russell 回報的實際情境——
    // 使用者用品牌切換器主動切到 Indian Motorcycle（海德生總代理）——用 UI 操作切換。
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.click('button[title="切換品牌 / 門店"]');
    await page.waitForTimeout(300);
    await page.click('button:has-text("Indian Motorcycle（海德生總代理）")');
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    // 任務②：切到 Indian 視角後確認 dashboard 首頁不再出現 Ducati 文字
    await page.screenshot({ path: path.join(SHOTS_DIR, "task2-01-david-dashboard-no-ducati-text.png") });
    const bodyText = await page.textContent("body");
    console.log("dashboard contains 'DUCATI'?", bodyText.toUpperCase().includes("DUCATI"));
    console.log("dashboard url:", page.url());

    // 任務①：/admin/navigation 可進
    await page.goto(`${BASE_URL}/admin/navigation`);
    await page.waitForLoadState("networkidle").catch(() => {});
    console.log("admin/navigation url after nav:", page.url());
    await page.screenshot({ path: path.join(SHOTS_DIR, "task1-david-admin-navigation.png") });

    // 任務①：新增授權頁 + 搜尋下拉
    await page.goto(`${BASE_URL}/admin/navigation/users/new`);
    await page.waitForLoadState("networkidle").catch(() => {});
    console.log("users/new url after nav:", page.url());
    const combo = page.locator('input[placeholder="搜尋姓名或 Email…"]');
    await combo.click();
    await combo.fill("劉");
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(SHOTS_DIR, "task1-david-new-assignment-search.png") });

    await context.close();
  }

  // ── Ducati admin：確認 Ducati 畫面沒被這次修復連帶弄壞 ──
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await login(page, "yemming.yu@gmail.com", "yemming.yu@gmail.com");
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.screenshot({ path: path.join(SHOTS_DIR, "task2-02-ducati-dashboard-unaffected.png") });
    const bodyText = await page.textContent("body");
    console.log("ducati dashboard contains 'DUCATI'?", bodyText.toUpperCase().includes("DUCATI"));
    console.log("ducati dashboard url:", page.url());
    await context.close();
  }

  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
