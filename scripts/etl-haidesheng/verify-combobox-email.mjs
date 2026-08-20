import { chromium } from "playwright";
import path from "path";

const BASE_URL = "https://dealeros.zeabur.app";
const SHOTS_DIR = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260820/screenshots";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', "david@hdsmoto.com");
  await page.fill('input[type="password"]', process.env.DAVID_PW);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });

  await page.goto(`${BASE_URL}/admin/navigation/users/new`);
  await page.waitForLoadState("networkidle").catch(() => {});
  const combo = page.locator('input[placeholder="搜尋姓名或 Email…"]');
  await combo.click();
  await combo.fill("david");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS_DIR, "task1-david-search-by-email-works.png") });
  console.log("email-search screenshot done");

  await browser.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
