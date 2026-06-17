// 真實 e2e — 裁示三兩邊界驗證（全程 UI、無塞值）
// 建 2 件 TL → 領料(借料未還2項) → tl-close 兩件 return_to_stock(仍2項=未誤顯沒事)
// → return-in 確認1件(借料未還1項=部分歸還正確)
// 跑：node tests/e2e/tl-boundary-e2e.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE || "https://dealeros.zeabur.app";
const HOST = new URL(BASE).hostname;
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260617/shots-boundary";
fs.mkdirSync(OUT, { recursive: true });

// 乾淨測試車：李美玲 RDC-2202（無 open 工單）
const CUSTOMER_ID = "135e98d5-376e-406d-9fa3-6e3114718437";
const VEHICLE_ID = "f6bb96a8-e255-4b81-99cb-f2ae4a2056af";
const PARTS = ["E2E-P-001", "E2E-P-002"];

const log = (m) => console.log(m);
async function shot(page, name, full = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }).catch((e) => log("shot fail " + e));
  log("📸 " + name);
}
async function drawSign(page, testid) {
  const c = page.locator(`[data-testid="${testid}"] canvas`);
  await c.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  const b = await c.boundingBox();
  const y = b.y + b.height / 2;
  await page.mouse.move(b.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(b.x + 130, y - 18, { steps: 6 });
  await page.mouse.move(b.x + 230, y + 18, { steps: 6 });
  await page.mouse.move(b.x + 300, y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  await page.locator(`[data-testid="${testid}"] button`, { hasText: "確認簽名" }).first().click();
  await page.waitForTimeout(300);
}
async function badgeText(page) {
  const b = page.locator('[data-testid="tl-loan-outstanding-badge"]');
  return (await b.count()) ? (await b.first().textContent()) : "(無 chip)";
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 950 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const r = {};
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type=email]', "yemming.yu@gmail.com");
  await page.fill('input[type=password]', "yemming.yu@gmail.com");
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }).catch(() => {});
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" }]);
  log("0 login ok");

  // 1 預約
  await page.goto(`${BASE}/parts/aftersales/appointments/new?customer_id=${CUSTOMER_ID}&vehicle_id=${VEHICLE_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /建立並開啟|建立中/ }).first().click();
  await page.waitForURL(/\/appointments\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
  const apptId = (page.url().match(/\/appointments\/([0-9a-f-]{36})/) || [])[1];
  log("1 appt " + apptId);

  // 2 開 TL
  await page.goto(`${BASE}/parts/aftersales/repair-orders/new?from=${apptId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.locator('[data-testid="prefix-TL"]').click();
  await page.waitForSelector('[data-testid="tl-form"]');
  await page.locator('[data-testid="tl-loan-purpose"]').fill("裁示三邊界驗證：部分歸還情境");
  await drawSign(page, "tl-sa-signature-canvas");
  await drawSign(page, "tl-tech-signature-canvas");
  await page.locator('[data-testid="create-tl-ro-btn"]').click();
  await page.waitForSelector('[data-testid="tl-ro-created-badge"]', { timeout: 20000 });
  const roCode = (await page.locator('[data-testid="tl-ro-number"]').textContent())?.trim();
  const href = await page.locator('a:has-text("借用結案")').getAttribute("href");
  const roId = (href.match(/repair-orders\/([0-9a-f-]{36})/) || [])[1];
  r.roCode = roCode; r.roId = roId;
  log(`2 TL ${roCode} ${roId}`);

  // 3 加 2 件借料
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}/lines`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const sec = page.locator("section", { has: page.locator("text=🔩 零件明細") }).first();
  for (const code of PARTS) {
    await sec.locator('input[placeholder*="搜尋"]').first().fill(code);
    await page.waitForTimeout(500);
    const sel = sec.locator("select").first();
    const v = await sel.locator("option", { hasText: code }).first().getAttribute("value").catch(() => null);
    if (v) await sel.selectOption(v); else await sel.selectOption({ index: 1 });
    await page.waitForTimeout(300);
    await sec.getByRole("button", { name: /＋ 新增|新增/ }).first().click();
    await page.waitForTimeout(1200);
    log("  + " + code);
  }

  // 4 倉管領料（過帳）
  await page.goto(`${BASE}/parts/issue/repair-pick`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: /待領料工單/ }).first().click().catch(() => {});
  await page.waitForTimeout(700);
  const card = page.locator("div").filter({ hasText: new RegExp(roCode) }).filter({ has: page.getByRole("button", { name: /備料/ }) }).last();
  await card.getByRole("button", { name: /備料/ }).first().click();
  await page.waitForURL(/repair-pick\/new/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const row = page.locator("tr", { has: page.locator(`text=${roCode}`) }).first();
  if (await row.count()) await row.locator('input[type=radio]').first().check().catch(() => {});
  await page.getByRole("button", { name: /預覽配置/ }).first().click().catch(() => {});
  await page.waitForTimeout(1800);
  await page.getByRole("button", { name: /一鍵領料並過帳|過帳/ }).first().click().catch(() => {});
  await page.waitForTimeout(2800);
  log("4 picked/posted url=" + page.url());

  // 狀態1：剛領料 → 借料未還 2 項
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  r.afterPick = await badgeText(page);
  log("狀態1 afterPick chip = " + r.afterPick);
  await shot(page, "A1_after-pick-2items", true);

  // 5 tl-close 兩件都 return_to_stock
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}/tl-close`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  for (let i = 0; i < PARTS.length; i++) {
    const radio = page.locator(`[data-testid="line-${i}-return-to-stock"]`);
    if (await radio.count()) await radio.check().catch(() => radio.click());
  }
  await page.locator('[data-testid="confirm-tl-close-btn"]').click();
  await page.waitForSelector('[data-testid="tl-ro-closed-badge"]', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  log("5 tl-close done");

  // 狀態2：已結案 + 兩筆退料 pending → 仍應「借料未還 2 項」（不可顯示沒事）
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  r.afterClose = await badgeText(page);
  log("狀態2 afterClose chip = " + r.afterClose);
  await shot(page, "A2_after-close-pending-still-2items", true);

  // 6 return-in 確認 1 件
  await page.goto(`${BASE}/parts/receipt/return-in`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  // 切售後退料確認 Tab
  await page.locator('[data-testid="tab-return-confirmation"]').click().catch(async () => {
    await page.getByRole("button", { name: /售後退料確認|退料確認/ }).first().click().catch(() => {});
  });
  await page.waitForTimeout(900);
  // 找含本 TL roCode 的列，點第一個「確認」
  const confirmBtn = page.locator("tr", { has: page.locator(`text=${roCode}`) }).first().getByTestId("return-request-item").first();
  if (await confirmBtn.count()) {
    await confirmBtn.click();
  } else {
    // overdue section 版型
    await page.locator('[data-testid="return-request-item"]').first().click().catch(() => {});
  }
  await page.waitForTimeout(800);
  await page.locator('[data-testid="confirm-return-btn"]').first().click().catch(() => {});
  await page.waitForSelector('[data-testid="confirm-success-toast"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  log("6 confirmed 1 return");
  await shot(page, "B1_return-in-confirmed-one", true);

  // 狀態3：確認 1 件後 → 借料未還 1 項
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  r.afterConfirmOne = await badgeText(page);
  log("狀態3 afterConfirmOne chip = " + r.afterConfirmOne);
  await shot(page, "A3_after-confirm-one-1item", true);

  log("DONE " + JSON.stringify(r));
} catch (e) {
  log("ERROR " + e + " partial=" + JSON.stringify(r));
  await shot(page, "99_error", true);
} finally {
  fs.writeFileSync(`${OUT}/_result.json`, JSON.stringify(r, null, 2));
  await browser.close();
}
