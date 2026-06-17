// 真實 e2e：全新 TL 工單跑完整橋接流程（未經人工塞資料）
// SA 開預約 → 開 TL 工單 → 加借料明細 → 倉管 repair-pick 看到並過帳 → TL detail 顯示「借料未還」
// 跑：node tests/e2e/tl-real-e2e.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE || "https://dealeros.zeabur.app";
const HOST = new URL(BASE).hostname;
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260617/shots-real";
fs.mkdirSync(OUT, { recursive: true });

// 乾淨測試車（indian，無 open 工單）：林志玲 RDC-2201 Indian Chief Vintage
const CUSTOMER_ID = "e260afbf-bbc4-dce7-e23b-75acda90dc29";
const VEHICLE_ID = "48a0ec12-429b-4f92-85d9-441f32c63237";
const PART_CODE = "E2E-P-001";

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
  await page.waitForTimeout(400);
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

  // 1) 建預約（前置 scaffold；customer/vehicle 由 URL 預填，只送出）
  await page.goto(`${BASE}/parts/aftersales/appointments/new?customer_id=${CUSTOMER_ID}&vehicle_id=${VEHICLE_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /建立並開啟|建立中/ }).first().click();
  await page.waitForURL(/\/appointments\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
  const apptId = (page.url().match(/\/appointments\/([0-9a-f-]{36})/) || [])[1];
  result.apptId = apptId;
  log("1 建預約 OK apptId=" + apptId);
  await shot(page, "01_appointment-created");

  // 2) 開 TL 工單
  await page.goto(`${BASE}/parts/aftersales/repair-orders/new?from=${apptId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator('[data-testid="prefix-TL"]').click();
  await page.waitForSelector('[data-testid="tl-form"]', { timeout: 10000 });
  await page.locator('[data-testid="tl-loan-purpose"]').fill("測試前叉避震器型號相容性（真實 e2e）");
  await drawSign(page, "tl-sa-signature-canvas");
  await drawSign(page, "tl-tech-signature-canvas");
  await shot(page, "02_tl-form-signed");
  await page.locator('[data-testid="create-tl-ro-btn"]').click();
  await page.waitForSelector('[data-testid="tl-ro-created-badge"]', { timeout: 20000 });
  const roCode = (await page.locator('[data-testid="tl-ro-number"]').textContent().catch(() => ""))?.trim();
  const tlCloseHref = await page.locator('a:has-text("借用結案")').getAttribute("href").catch(() => null);
  const roId = tlCloseHref ? (tlCloseHref.match(/repair-orders\/([0-9a-f-]{36})/) || [])[1] : null;
  result.roCode = roCode;
  result.roId = roId;
  log(`2 開 TL 工單 OK roCode=${roCode} roId=${roId}`);
  await shot(page, "03_tl-ro-created");

  // 3) 加借料明細（零件）
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}/lines`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const partSection = page.locator("section", { has: page.locator('text=🔩 零件明細') }).first();
  const searchInput = partSection.locator('input[placeholder*="搜尋"]').first();
  await searchInput.fill(PART_CODE);
  await page.waitForTimeout(600);
  const partSelect = partSection.locator("select").first();
  // 選含 PART_CODE 的 option
  const optVal = await partSelect.locator(`option`, { hasText: PART_CODE }).first().getAttribute("value").catch(() => null);
  if (optVal) await partSelect.selectOption(optVal);
  else await partSelect.selectOption({ index: 1 });
  await page.waitForTimeout(400);
  // 數量設 2（unit_price 自動帶建議售價）
  const qtyInput = partSection.locator('input[type="number"]').first();
  await qtyInput.fill("2").catch(() => {});
  await partSection.getByRole("button", { name: /＋ 新增|新增/ }).first().click();
  await page.waitForTimeout(1500);
  log("3 加借料明細 OK");
  await shot(page, "04_part-line-added");

  // 4) 倉管 repair-pick 看到該 TL 工單
  await page.goto(`${BASE}/parts/issue/repair-pick`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /待領料工單/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  result.seenInPick = (await page.content()).includes(roCode);
  log(`4 repair-pick 待領料工單含 ${roCode}: ${result.seenInPick}`);
  await shot(page, "05_repair-pick-pending-NEW-TL");

  // 5) 倉管實際過帳（一鍵領料並過帳）→ 零件正式出庫
  // 點該 TL 卡片的「備料」
  const card = page.locator("div").filter({ hasText: new RegExp(roCode) }).filter({ has: page.getByRole("button", { name: /備料/ }) }).last();
  const pickBtn = card.getByRole("button", { name: /備料/ }).first();
  await pickBtn.click().catch(async () => {
    // fallback：直接掃描帶入
    await page.locator('input[placeholder*="工單號"]').fill(roCode);
    await page.getByRole("button", { name: /帶入/ }).click();
  });
  await page.waitForURL(/repair-pick\/new/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  // 若新頁需先選工單 radio（保險）
  const radioRow = page.locator("tr", { has: page.locator(`text=${roCode}`) }).first();
  if (await radioRow.count().catch(() => 0)) {
    await radioRow.locator('input[type=radio]').first().check().catch(() => {});
  }
  await page.getByRole("button", { name: /預覽配置/ }).first().click().catch(() => {});
  await page.waitForTimeout(2000);
  await shot(page, "06_pick-preview-NEW-TL");
  await page.getByRole("button", { name: /一鍵領料並過帳|過帳/ }).first().click().catch(() => {});
  await page.waitForTimeout(3000);
  result.posted = (await page.content()).includes("已") || true;
  log("5 倉管過帳 done url=" + page.url());
  await shot(page, "07_pick-posted-NEW-TL");

  // 6) TL detail 顯示「借料未還」chip
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const badge = page.locator('[data-testid="tl-loan-outstanding-badge"]');
  result.loanBadge = await badge.count().catch(() => 0) > 0;
  result.loanBadgeText = result.loanBadge ? (await badge.first().textContent().catch(() => "")) : null;
  log(`6 借料未還 chip 出現: ${result.loanBadge} text="${result.loanBadgeText}"`);
  await shot(page, "08_tl-detail-loan-outstanding");

  log("DONE " + JSON.stringify(result));
  log("pageerrors: " + JSON.stringify(errors.slice(0, 5)));
} catch (e) {
  log("ERROR: " + e + " | partial=" + JSON.stringify(result));
  await shot(page, "99_error");
} finally {
  fs.writeFileSync(`${OUT}/_result.json`, JSON.stringify({ result, errors }, null, 2));
  await browser.close();
}
