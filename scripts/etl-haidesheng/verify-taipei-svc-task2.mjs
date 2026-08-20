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
  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });
  } catch (e) {
    await page.screenshot({ path: "/tmp/login-debug.png" });
    console.error("login failed, page text:", (await page.textContent("body")).slice(0, 500));
    throw e;
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await login(page, "willy30914@gmail.com", process.env.HUANGWEI_PW);

  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(500);

  await page.screenshot({
    path: path.join(SHOTS_DIR, "task2-01-huangwei-dashboard-taipei-svc-scope.png"),
  });
  const bodyText = await page.textContent("body");
  console.log("dashboard url:", page.url());
  console.log("dashboard contains 'DUCATI'?", bodyText.toUpperCase().includes("DUCATI"));
  console.log("dashboard contains 'INDIAN'?", bodyText.toUpperCase().includes("INDIAN"));

  await context.close();
  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
