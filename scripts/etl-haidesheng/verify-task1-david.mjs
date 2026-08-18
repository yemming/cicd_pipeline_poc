import { chromium } from "playwright";
import path from "path";
import fs from "fs";

const BASE_URL = "https://dealeros.zeabur.app";
const SHOTS_DIR = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260820/screenshots";
fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', "david@hdsmoto.com");
  await page.fill('input[type="password"]', process.env.DAVID_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });

  await page.goto(`${BASE_URL}/parts/setup/items`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: path.join(SHOTS_DIR, "task1-items-list-hds.png"), fullPage: false });
  console.log("shot: task1-items-list-hds.png url=", page.url());

  await page.goto(`${BASE_URL}/parts/setup/items?q=005-4610199`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.screenshot({ path: path.join(SHOTS_DIR, "task1-items-search-real-part.png"), fullPage: false });
  console.log("shot: task1-items-search-real-part.png");

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
