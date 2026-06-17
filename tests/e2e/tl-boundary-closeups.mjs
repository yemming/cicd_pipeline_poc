// 裁示三邊界 — 三狀態清晰 closeup（clip header+breakdown），全程 UI 無塞值
import { chromium } from "@playwright/test";
import fs from "node:fs";
const BASE = "https://dealeros.zeabur.app", HOST = "dealeros.zeabur.app";
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260617/shots-boundary";
fs.mkdirSync(OUT, { recursive: true });
// 王建民 RDB-1102（乾淨）
const CUSTOMER_ID = "a79e277e-cacc-0f4c-7f06-579d221d2de5";
const VEHICLE_ID = "7c073595-0b40-4e75-90fa-e133bfa522d9";
const PARTS = ["E2E-P-001", "E2E-P-002"];
const CLIP = { x: 226, y: 88, width: 1130, height: 250 };
const log = (m) => console.log(m);
async function clip(page, name) {
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: CLIP });
  log("📸 " + name);
}
async function drawSign(page, t) {
  const c = page.locator(`[data-testid="${t}"] canvas`); await c.scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
  const b = await c.boundingBox(); const y = b.y + b.height / 2;
  await page.mouse.move(b.x + 40, y); await page.mouse.down();
  await page.mouse.move(b.x + 140, y - 18, { steps: 6 }); await page.mouse.move(b.x + 240, y + 18, { steps: 6 }); await page.mouse.move(b.x + 300, y, { steps: 6 });
  await page.mouse.up(); await page.waitForTimeout(250);
  await page.locator(`[data-testid="${t}"] button`, { hasText: "確認簽名" }).first().click(); await page.waitForTimeout(300);
}
async function badge(page) { const b = page.locator('[data-testid="tl-loan-outstanding-badge"]'); return (await b.count()) ? await b.first().textContent() : "(無)"; }
const br = await chromium.launch(); const ctx = await br.newContext({ viewport: { width: 1366, height: 950 } }); const page = await ctx.newPage(); page.setDefaultTimeout(60000);
const r = {};
try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill('input[type=email]', "yemming.yu@gmail.com"); await page.fill('input[type=password]', "yemming.yu@gmail.com"); await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }).catch(() => {});
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" }]);
  await page.goto(`${BASE}/parts/aftersales/appointments/new?customer_id=${CUSTOMER_ID}&vehicle_id=${VEHICLE_ID}`, { waitUntil: "networkidle" }); await page.waitForTimeout(700);
  await page.getByRole("button", { name: /建立並開啟|建立中/ }).first().click();
  await page.waitForURL(/\/appointments\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
  const apptId = (page.url().match(/\/appointments\/([0-9a-f-]{36})/) || [])[1];
  await page.goto(`${BASE}/parts/aftersales/repair-orders/new?from=${apptId}`, { waitUntil: "networkidle" }); await page.waitForTimeout(700);
  await page.locator('[data-testid="prefix-TL"]').click(); await page.waitForSelector('[data-testid="tl-form"]');
  await page.locator('[data-testid="tl-loan-purpose"]').fill("裁示三 closeup");
  await drawSign(page, "tl-sa-signature-canvas"); await drawSign(page, "tl-tech-signature-canvas");
  await page.locator('[data-testid="create-tl-ro-btn"]').click(); await page.waitForSelector('[data-testid="tl-ro-created-badge"]', { timeout: 20000 });
  const roCode = (await page.locator('[data-testid="tl-ro-number"]').textContent())?.trim();
  const roId = ((await page.locator('a:has-text("借用結案")').getAttribute("href")).match(/repair-orders\/([0-9a-f-]{36})/) || [])[1];
  r.roCode = roCode; log("TL " + roCode);
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}/lines`, { waitUntil: "networkidle" }); await page.waitForTimeout(900);
  const sec = page.locator("section", { has: page.locator("text=🔩 零件明細") }).first();
  for (const code of PARTS) {
    await sec.locator('input[placeholder*="搜尋"]').first().fill(code); await page.waitForTimeout(500);
    const sel = sec.locator("select").first();
    const v = await sel.locator("option", { hasText: code }).first().getAttribute("value").catch(() => null);
    if (v) await sel.selectOption(v); else await sel.selectOption({ index: 1 });
    await page.waitForTimeout(300); await sec.getByRole("button", { name: /＋ 新增|新增/ }).first().click(); await page.waitForTimeout(1200);
  }
  // pick
  await page.goto(`${BASE}/parts/issue/repair-pick`, { waitUntil: "networkidle" }); await page.waitForTimeout(700);
  await page.getByRole("button", { name: /待領料工單/ }).first().click().catch(() => {}); await page.waitForTimeout(700);
  const card = page.locator("div").filter({ hasText: new RegExp(roCode) }).filter({ has: page.getByRole("button", { name: /備料/ }) }).last();
  await card.getByRole("button", { name: /備料/ }).first().click(); await page.waitForURL(/repair-pick\/new/, { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1200);
  const row = page.locator("tr", { has: page.locator(`text=${roCode}`) }).first();
  if (await row.count()) await row.locator('input[type=radio]').first().check().catch(() => {});
  await page.getByRole("button", { name: /預覽配置/ }).first().click().catch(() => {}); await page.waitForTimeout(1800);
  await page.getByRole("button", { name: /一鍵領料並過帳|過帳/ }).first().click().catch(() => {}); await page.waitForTimeout(2800);
  // 狀態1
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  r.s1 = await badge(page); await clip(page, "D1_after-pick-2items"); log("s1 " + r.s1);
  // tl-close 兩件 return_to_stock
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}/tl-close`, { waitUntil: "networkidle" }); await page.waitForTimeout(1000);
  for (let i = 0; i < PARTS.length; i++) { const rd = page.locator(`[data-testid="line-${i}-return-to-stock"]`); if (await rd.count()) await rd.check().catch(() => rd.click()); }
  await page.locator('[data-testid="confirm-tl-close-btn"]').click(); await page.waitForSelector('[data-testid="tl-ro-closed-badge"]', { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(800);
  // 狀態2
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  r.s2 = await badge(page); await clip(page, "D2_after-close-still-2items"); log("s2 " + r.s2);
  // return-in 確認 1 件
  await page.goto(`${BASE}/parts/receipt/return-in`, { waitUntil: "networkidle" }); await page.waitForTimeout(900);
  await page.locator('[data-testid="tab-return-confirmation"]').click().catch(async () => { await page.getByRole("button", { name: /售後退料確認|退料確認/ }).first().click().catch(() => {}); });
  await page.waitForTimeout(900);
  const cb = page.locator("tr", { has: page.locator(`text=${roCode}`) }).first().getByTestId("return-request-item").first();
  if (await cb.count()) await cb.click(); else await page.locator('[data-testid="return-request-item"]').first().click().catch(() => {});
  await page.waitForTimeout(800); await page.locator('[data-testid="confirm-return-btn"]').first().click().catch(() => {});
  await page.waitForSelector('[data-testid="confirm-success-toast"]', { timeout: 15000 }).catch(() => {}); await page.waitForTimeout(1500);
  // 狀態3
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  r.s3 = await badge(page); await clip(page, "D3_after-confirm-1item"); log("s3 " + r.s3);
  log("DONE " + JSON.stringify(r));
} catch (e) { log("ERR " + e + " " + JSON.stringify(r)); }
finally { fs.writeFileSync(`${OUT}/_closeups_result.json`, JSON.stringify(r, null, 2)); await br.close(); }
