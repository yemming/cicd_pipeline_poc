import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE_URL = "https://dealeros.zeabur.app";
const ADMIN = { email: "yemming.yu@gmail.com", password: "yemming.yu@gmail.com" };
const SHOTS_DIR = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260820/screenshots";
fs.mkdirSync(SHOTS_DIR, { recursive: true });

const TS = Date.now();
const TEST_CODES = Array.from({ length: 10 }, (_, i) => `RS0820-TEST-${String(i + 1).padStart(2, "0")}-${TS}`);

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error("pageerror:", e.message));

  console.log("[1] 登入 admin...");
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', ADMIN.email);
  await page.fill('input[type="password"]', ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });

  console.log("[2] 到零件主檔頁，用批次匯入建立10筆測試資料...");
  await page.goto(`${BASE_URL}/parts/setup/items`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "批次匯入" }).click();
  await page.waitForTimeout(300);
  const initialRows = TEST_CODES.map((c, i) => `${c}\t測試件${i + 1}\t耗材\tC\t個\t${100 + i}\t${180 + i}`).join("\n");
  const importTSV = `料號\t名稱\t品類\t管控\t單位\t標準成本\t建議售價\n${initialRows}`;
  await page.locator("textarea").fill(importTSV);
  await page.getByRole("button", { name: "開始匯入" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS_DIR, "task2-01-initial-import.png"), fullPage: false });
  console.log("  screenshot: task2-01-initial-import.png");

  console.log("[3] 搜尋確認初始資料落地（畫面）...");
  await page.goto(`${BASE_URL}/parts/setup/items?q=${encodeURIComponent(TEST_CODES[0])}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: path.join(SHOTS_DIR, "task2-02-before-price-update.png"), fullPage: false });
  console.log("  screenshot: task2-02-before-price-update.png");

  console.log("[4] 開批次更新價格，貼新價格...");
  await page.goto(`${BASE_URL}/parts/setup/items`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "批次更新價格" }).click();
  await page.waitForTimeout(300);
  const updateRows = TEST_CODES.map((c, i) => `${c}\t${900 + i}\t${1500 + i}`).join("\n");
  const updateTSV = `料號\t標準成本\t建議售價\n${updateRows}`;
  await page.locator("textarea").fill(updateTSV);
  await page.getByRole("button", { name: "開始更新" }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(SHOTS_DIR, "task2-03-after-price-update.png"), fullPage: false });
  console.log("  screenshot: task2-03-after-price-update.png");

  console.log("[5] 搜尋確認更新後畫面...");
  await page.goto(`${BASE_URL}/parts/setup/items?q=${encodeURIComponent(TEST_CODES[0])}`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: path.join(SHOTS_DIR, "task2-04-verify-updated.png"), fullPage: false });
  console.log("  screenshot: task2-04-verify-updated.png");

  console.log("[6] 車型主檔頁：demo 批次匯入功能（2筆測試資料）...");
  const vmCodeSuffix = TS;
  await page.goto(`${BASE_URL}/admin/master-data/vehicle-models`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("button", { name: "批次匯入" }).click();
  await page.waitForTimeout(300);
  const vmTSV = `車系\t型號\t顯示名稱\t起始年份\t結束年份\t排量\nRS0820Test${vmCodeSuffix}\tTest Model A ${vmCodeSuffix}\tTest Model A ${vmCodeSuffix}\t2026\t\t500\nRS0820Test${vmCodeSuffix}\tTest Model B ${vmCodeSuffix}\tTest Model B ${vmCodeSuffix}\t2026\t\t650`;
  await page.locator("textarea").fill(vmTSV);
  await page.getByRole("button", { name: "開始匯入" }).click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SHOTS_DIR, "task1-vehicle-model-bulk-import.png"), fullPage: false });
  console.log("  screenshot: task1-vehicle-model-bulk-import.png");

  await context.close();

  console.log("[7] 登入海德生員工帳號 david@hdsmoto.com...");
  const context2 = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page2 = await context2.newPage();
  await page2.goto(`${BASE_URL}/login`);
  await page2.fill('input[type="email"]', "david@hdsmoto.com");
  await page2.fill('input[type="password"]', process.env.DAVID_PW);
  await page2.click('button[type="submit"]');
  await page2.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
  await page2.waitForTimeout(1500);
  await page2.screenshot({ path: path.join(SHOTS_DIR, "task3-01-david-login-success.png"), fullPage: false });
  console.log("  screenshot: task3-01-david-login-success.png, url=", page2.url());
  await context2.close();

  await browser.close();

  console.log("\nTEST_CODES:", JSON.stringify(TEST_CODES));
  console.log("VM_SUFFIX:", vmCodeSuffix);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
