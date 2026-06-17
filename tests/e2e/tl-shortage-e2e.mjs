// 真實 e2e（Russell 6/17 兩件）：
//  Part A — Item 1：借料未還「列表層級」chip（正式工單 RO 列表）真實截圖
//  Part B — Item 2：TL 工單借 3 項零件、2 項有貨 1 項缺貨 → 倉管 repair-pick
//           的「缺貨情境」現況行為（驗證 Russell 的可能性 A：整單卡死、逐項偵測）
//
// 全程走真實 UI，不用 SQL 塞結果值。缺貨用「借量 > 現貨」自然構成
// （shortage = need − allocated；need 超出 available 時 allocated 受限 → 缺料，
//   與「某項零庫存待料」走完全相同的判定分支）。
//
// 跑：node tests/e2e/tl-shortage-e2e.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE || "https://dealeros.zeabur.app";
const HOST = new URL(BASE).hostname;
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260617_2/shots";
fs.mkdirSync(OUT, { recursive: true });

// 乾淨測試車（indian）
const CUSTOMER_ID = "e260afbf-bbc4-dce7-e23b-75acda90dc29";
const VEHICLE_ID = "48a0ec12-429b-4f92-85d9-441f32c63237";

// 借料 3 項：2 有貨 + 1 缺貨（借量遠超現貨 60 → 缺料）
const PART_LINES = [
  { code: "CON-FIL-002", name: "機油濾芯 (V2/L-twin)", qty: 1, expect: "ok" },   // 現貨 250
  { code: "OEM-ELE-002", name: "NGK 火星塞 (V4)", qty: 1, expect: "ok" },          // 現貨 120
  { code: "OEM-TRN-001", name: "V4 鏈條", qty: 999, expect: "short" },             // 現貨 60 → 缺 939
];

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
  await page.locator(`[data-testid="${testid}"] button`, { hasText: "確認簽名" }).first().click({ timeout: 15000 });
  await page.waitForTimeout(400);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 1024 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const result = { partA: {}, partB: {} };

try {
  // ── 登入 + indian scope ──
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("input[type=email]", "yemming.yu@gmail.com");
  await page.fill("input[type=password]", "yemming.yu@gmail.com");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }).catch(() => {});
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" }]);
  log("登入 OK " + page.url());

  // ═══════════════ Part A：列表層級借料未還 chip ═══════════════
  // 正式工單 RO 列表，篩 TL → 已知 TL-IN-260617-001/002/003 有借料未還
  await page.goto(`${BASE}/parts/aftersales/repair-orders?prefix_p1=TL`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const listBadges = page.locator('[data-testid="tl-loan-outstanding-badge"]');
  const listBadgeCount = await listBadges.count().catch(() => 0);
  result.partA.listBadgeCount = listBadgeCount;
  result.partA.listBadgeTexts = [];
  for (let i = 0; i < listBadgeCount; i++) {
    result.partA.listBadgeTexts.push((await listBadges.nth(i).textContent().catch(() => ""))?.trim());
  }
  log(`A1 RO 列表借料未還 chip 數=${listBadgeCount} texts=${JSON.stringify(result.partA.listBadgeTexts)}`);
  await shot(page, "A1_ro-list-tl-loan-chips");

  // 派工看板（緊急置頂 / 待派工橫幅）— TL-IN-260617-001 為「進行中」會在待派工橫幅
  await page.goto(`${BASE}/parts/aftersales/management/dispatch`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  result.partA.dispatchBadgeCount = await page.locator('[data-testid="tl-loan-outstanding-badge"]').count().catch(() => 0);
  log(`A2 派工看板借料未還 chip 數=${result.partA.dispatchBadgeCount}`);
  await shot(page, "A2_dispatch-tl-loan-chips");

  // ═══════════════ Part B：缺貨情境（possibility A 驗證） ═══════════════
  // 1) 建預約 scaffold
  await page.goto(`${BASE}/parts/aftersales/appointments/new?customer_id=${CUSTOMER_ID}&vehicle_id=${VEHICLE_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /建立並開啟|建立中/ }).first().click();
  await page.waitForURL(/\/appointments\/[0-9a-f-]{36}/, { timeout: 20000 }).catch(() => {});
  const apptId = (page.url().match(/\/appointments\/([0-9a-f-]{36})/) || [])[1];
  log("B1 建預約 OK apptId=" + apptId);

  // 2) 開 TL 工單
  await page.goto(`${BASE}/parts/aftersales/repair-orders/new?from=${apptId}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.locator('[data-testid="prefix-TL"]').click();
  await page.waitForSelector('[data-testid="tl-form"]', { timeout: 10000 });
  await page.locator('[data-testid="tl-loan-purpose"]').fill("缺貨情境真實 e2e：借 3 項零件、其中 1 項現貨不足");
  await drawSign(page, "tl-sa-signature-canvas");
  await drawSign(page, "tl-tech-signature-canvas");
  await page.locator('[data-testid="create-tl-ro-btn"]').click();
  await page.waitForSelector('[data-testid="tl-ro-created-badge"]', { timeout: 20000 });
  const roCode = (await page.locator('[data-testid="tl-ro-number"]').textContent().catch(() => ""))?.trim();
  const tlCloseHref = await page.locator('a:has-text("借用結案")').getAttribute("href").catch(() => null);
  const roId = tlCloseHref ? (tlCloseHref.match(/repair-orders\/([0-9a-f-]{36})/) || [])[1] : null;
  result.partB.roCode = roCode;
  result.partB.roId = roId;
  log(`B2 開 TL 工單 OK roCode=${roCode} roId=${roId}`);

  // 3) 加 3 項借料明細
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${roId}/lines`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  for (const pl of PART_LINES) {
    const partSection = page.locator("section", { has: page.locator("text=🔩 零件明細") }).first();
    const searchInput = partSection.locator('input[placeholder*="搜尋"]').first();
    await searchInput.fill(pl.code);
    await page.waitForTimeout(700);
    const partSelect = partSection.locator("select").first();
    const optVal = await partSelect.locator("option", { hasText: pl.code }).first().getAttribute("value").catch(() => null);
    if (optVal) await partSelect.selectOption(optVal);
    else await partSelect.selectOption({ index: 1 });
    await page.waitForTimeout(400);
    const qtyInput = partSection.locator('input[type="number"]').first();
    await qtyInput.fill(String(pl.qty)).catch(() => {});
    await partSection.getByRole("button", { name: /＋ 新增|新增/ }).first().click();
    await page.waitForTimeout(1500);
    log(`B3 加明細 ${pl.code} ×${pl.qty} (${pl.expect})`);
  }
  await shot(page, "B3_tl-lines-3parts");

  // 4) 倉管 repair-pick → 備料 → 預覽配置（不過帳，停在缺貨阻擋畫面）
  await page.goto(`${BASE}/parts/issue/repair-pick`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /待領料工單/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  result.partB.seenInPick = (await page.content()).includes(roCode);
  log(`B4 repair-pick 待領料含 ${roCode}: ${result.partB.seenInPick}`);
  await shot(page, "B4_repair-pick-pending");

  const card = page.locator("div").filter({ hasText: new RegExp(roCode) }).filter({ has: page.getByRole("button", { name: /備料/ }) }).last();
  await card.getByRole("button", { name: /備料/ }).first().click().catch(async () => {
    await page.locator('input[placeholder*="工單號"]').fill(roCode);
    await page.getByRole("button", { name: /帶入/ }).click();
  });
  await page.waitForURL(/repair-pick\/new/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const radioRow = page.locator("tr", { has: page.locator(`text=${roCode}`) }).first();
  if (await radioRow.count().catch(() => 0)) {
    await radioRow.locator("input[type=radio]").first().check().catch(() => {});
  }
  await page.getByRole("button", { name: /預覽配置/ }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  // ── 缺貨阻擋斷言 ──
  const pageText = await page.content();
  result.partB.hasShortageBadge = pageText.includes("庫存不足");
  // 缺貨明細應點名 V4 鏈條（OEM-TRN-001）
  result.partB.shortageMentionsShortPart = pageText.includes("V4 鏈條") || pageText.includes("OEM-TRN-001");
  // 過帳按鈕應 disabled
  const postBtn = page.getByRole("button", { name: /一鍵領料並過帳|過帳/ }).first();
  result.partB.postBtnExists = (await postBtn.count().catch(() => 0)) > 0;
  result.partB.postBtnDisabled = result.partB.postBtnExists ? await postBtn.isDisabled().catch(() => null) : null;
  log(`B5 缺貨判定 → 庫存不足badge=${result.partB.hasShortageBadge} 點名缺料=${result.partB.shortageMentionsShortPart} 過帳鈕disabled=${result.partB.postBtnDisabled}`);
  await shot(page, "B5_pick-preview-shortage-blocked");

  // 嘗試點過帳（應點不動 / 被擋）— 證明真的不能出庫
  await postBtn.click({ timeout: 3000 }).catch(() => log("過帳鈕點不動（符合預期，disabled）"));
  await page.waitForTimeout(1500);
  result.partB.urlAfterClick = page.url();
  result.partB.stillOnPreview = page.url().includes("repair-pick/new");
  await shot(page, "B6_after-attempt-post");

  log("DONE " + JSON.stringify(result));
  log("pageerrors: " + JSON.stringify(errors.slice(0, 5)));
} catch (e) {
  log("ERROR: " + e + " | partial=" + JSON.stringify(result));
  await shot(page, "99_error");
} finally {
  fs.writeFileSync(`${OUT}/_result.json`, JSON.stringify({ result, errors }, null, 2));
  await browser.close();
}
