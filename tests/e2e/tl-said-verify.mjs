// 驗證：TL 工單開立(SA+技師雙簽)後，repair_orders.sa_id 是否被正確寫入 typed 欄位
// 跑：BASE=http://localhost:3000 node tl-said-verify.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE || "http://localhost:3000";
const HOST = new URL(BASE).hostname;
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260728_russell_reply/shots";
fs.mkdirSync(OUT, { recursive: true });

// 乾淨測試車（indian，無 open 工單）：楊淑芬 IND-0002
const CUSTOMER_ID = "0246817a-d154-45fb-af1e-b73a9c124031";
const VEHICLE_ID = "f468bf86-32c0-48a6-8351-490e237033a3";

const log = (m) => console.log(m);
async function shot(page, name, full = true) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }).catch((e) => log("shot fail " + e));
  log("📸 " + name);
}
async function drawSign(page, testid) {
  const canvas = page.locator(`[data-testid="${testid}"] canvas`);
  await canvas.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas box for " + testid);
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, y - 20, { steps: 8 });
  await page.mouse.move(box.x + 200, y + 20, { steps: 8 });
  await page.mouse.move(box.x + 300, y - 10, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const confirmBtn = page.locator(`[data-testid="${testid}"] button`, { hasText: "確認簽名" }).first();
  await confirmBtn.click({ timeout: 15000 });
  await page.waitForTimeout(300);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

const result = {};
try {
  // 0) 登入 + indian scope
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type=email]', "yemming.yu@gmail.com");
  await page.fill('input[type=password]', "yemming.yu@gmail.com");
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }).catch(() => {});
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" }]);
  log("0 登入 OK " + page.url());

  // 1) 建預約
  await page.goto(`${BASE}/parts/aftersales/appointments/new?customer_id=${CUSTOMER_ID}&vehicle_id=${VEHICLE_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /建立並開啟|建立中/ }).first().click();
  await page.waitForURL(/\/appointments\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
  const apptId = (page.url().match(/\/appointments\/([0-9a-f-]{36})/) || [])[1];
  result.apptId = apptId;
  log("1 建預約 OK apptId=" + apptId);

  // 2) 開 TL 工單（SA + 技師雙簽）
  await page.goto(`${BASE}/parts/aftersales/repair-orders/new?from=${apptId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator('[data-testid="prefix-TL"]').click();
  await page.waitForSelector('[data-testid="tl-form"]', { timeout: 10000 });
  await page.locator('[data-testid="tl-loan-purpose"]').fill("驗證 sa_id/lead_technician_id typed 欄位寫入（tl-said-verify）");
  await drawSign(page, "tl-sa-signature-canvas");
  await drawSign(page, "tl-tech-signature-canvas");
  await shot(page, "tl-said-verify-01-form-signed");
  await page.locator('[data-testid="create-tl-ro-btn"]').click();
  await page.waitForSelector('[data-testid="tl-ro-created-badge"]', { timeout: 20000 });
  const roCode = (await page.locator('[data-testid="tl-ro-number"]').textContent().catch(() => ""))?.trim();
  const tlCloseHref = await page.locator('a:has-text("借用結案")').getAttribute("href").catch(() => null);
  const roId = tlCloseHref ? (tlCloseHref.match(/repair-orders\/([0-9a-f-]{36})/) || [])[1] : null;
  result.roCode = roCode;
  result.roId = roId;
  log(`2 開 TL 工單 OK roCode=${roCode} roId=${roId}`);
  await shot(page, "tl-said-verify-02-tl-ro-created");

  log("DONE " + JSON.stringify(result));
  log("pageerrors: " + JSON.stringify(errors.slice(0, 5)));
} catch (e) {
  log("ERROR: " + e + " | partial=" + JSON.stringify(result));
  await shot(page, "tl-said-verify-99-error");
} finally {
  fs.writeFileSync(`${OUT}/tl-said-verify-result.json`, JSON.stringify({ result, errors }, null, 2));
  await browser.close();
}
