// Part B（缺貨情境）真實 e2e — 用既有未領料 TL 工單 TL-IN-260616-901，
// 加一條超量零件線（V4 鏈條 ×999，現貨 60）製造「3 項有貨 + 1 項缺貨」，
// 驅動倉管 repair-pick 預覽，驗證可能性 A（逐項偵測、整單卡死）。
// 跑：node tests/e2e/tl-shortage-existing.mjs
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE || "https://dealeros.zeabur.app";
const HOST = new URL(BASE).hostname;
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260617_2/shots";
fs.mkdirSync(OUT, { recursive: true });

const RO_ID = "61c3387d-e6fa-4af8-bc3c-b7d7f74aa2a3";
const RO_CODE = "TL-IN-260616-901";
const SHORT_CODE = "E2E-P-001"; // 傳動系統 零件 #001 (A類)，真零件，現貨 7
const SHORT_NAME = "傳動系統 零件 #001";
const SHORT_SEARCH = "E2E-P-001"; // 下拉按料號搜尋
const SHORT_QTY = 999;

const log = (m) => console.log(m);
async function shot(page, name, full = true) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full }).catch((e) => log("shot fail " + e));
  log("📸 " + name);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1480, height: 1024 } });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const result = {};

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("input[type=email]", "yemming.yu@gmail.com");
  await page.fill("input[type=password]", "yemming.yu@gmail.com");
  await page.click("button[type=submit]");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }).catch(() => {});
  await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" }]);
  log("登入 OK " + page.url());

  // 1) 在 901 加一條超量零件線（→ 橋接 wo 同步）
  await page.goto(`${BASE}/parts/aftersales/repair-orders/${RO_ID}/lines`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const partSection = page.locator("section", { has: page.locator("text=🔩 零件明細") }).first();
  await partSection.locator('input[placeholder*="搜尋"]').first().fill(SHORT_SEARCH);
  await page.waitForTimeout(1000);
  const partSelect = partSection.locator("select").first();
  // 列出 options，挑文字含「鏈條」或代碼的那個
  const opts = await partSelect.locator("option").evaluateAll((els) =>
    els.map((e) => ({ value: e.value, text: e.textContent || "" })),
  );
  log("options: " + JSON.stringify(opts).slice(0, 400));
  // 只挑真零件（排除 E2E-SVC 工資項）
  const match = opts.find((o) => o.value && o.text.includes(SHORT_CODE) && !o.text.includes("E2E-SVC"));
  const picked = match || opts.find((o) => o.value && !o.text.includes("E2E-SVC"));
  if (!picked) throw new Error("零件下拉無可選 option（搜尋=" + SHORT_SEARCH + "）");
  await partSelect.selectOption(picked.value);
  result.pickedOption = picked.text.trim();
  log("選中料件: " + result.pickedOption);
  await page.waitForTimeout(400);
  await partSection.locator('input[type="number"]').first().fill(String(SHORT_QTY)).catch(() => {});
  await partSection.getByRole("button", { name: /＋ 新增|新增/ }).first().click();
  await page.waitForTimeout(1800);
  result.lineAdded = (await page.content()).includes("鏈條");
  log(`1 加缺貨線 ${SHORT_CODE}×${SHORT_QTY}: ${result.lineAdded}`);
  await shot(page, "B3_tl-lines-with-shortage");

  // 2) repair-pick → 備料 → 預覽配置（不過帳）
  await page.goto(`${BASE}/parts/issue/repair-pick`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /待領料工單/ }).first().click().catch(() => {});
  await page.waitForTimeout(900);
  result.seenInPick = (await page.content()).includes(RO_CODE);
  log(`2 repair-pick 待領料含 ${RO_CODE}: ${result.seenInPick}`);
  await shot(page, "B4_repair-pick-pending");

  const card = page.locator("div").filter({ hasText: new RegExp(RO_CODE) }).filter({ has: page.getByRole("button", { name: /備料/ }) }).last();
  await card.getByRole("button", { name: /備料/ }).first().click().catch(async () => {
    await page.locator('input[placeholder*="工單號"]').fill(RO_CODE);
    await page.getByRole("button", { name: /帶入/ }).click();
  });
  await page.waitForURL(/repair-pick\/new/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const radioRow = page.locator("tr", { has: page.locator(`text=${RO_CODE}`) }).first();
  if (await radioRow.count().catch(() => 0)) {
    await radioRow.locator("input[type=radio]").first().check().catch(() => {});
  }
  await page.getByRole("button", { name: /預覽配置/ }).first().click().catch(() => {});
  await page.waitForTimeout(2500);

  const html = await page.content();
  result.hasShortageBadge = html.includes("庫存不足");
  result.shortageNamedPart = html.includes(SHORT_NAME) || html.includes(SHORT_CODE);
  result.inStockPartPresent = html.includes("機油濾芯");
  const postBtn = page.getByRole("button", { name: /一鍵領料並過帳|過帳/ }).first();
  result.postBtnExists = (await postBtn.count().catch(() => 0)) > 0;
  result.postBtnDisabled = result.postBtnExists ? await postBtn.isDisabled().catch(() => null) : null;
  log(`3 缺貨判定 → 庫存不足=${result.hasShortageBadge} 點名缺料=${result.shortageNamedPart} 有有貨項=${result.inStockPartPresent} 過帳鈕disabled=${result.postBtnDisabled}`);
  await shot(page, "B5_pick-preview-shortage-blocked");

  // 試點過帳 → 應點不動
  await postBtn.click({ timeout: 3000 }).catch(() => log("過帳鈕點不動（disabled，符合預期）"));
  await page.waitForTimeout(1200);
  result.stillOnPreview = page.url().includes("repair-pick/new");
  await shot(page, "B6_after-attempt-post");

  log("DONE " + JSON.stringify(result));
  log("pageerrors: " + JSON.stringify(errors.slice(0, 5)));
} catch (e) {
  log("ERROR: " + e + " | partial=" + JSON.stringify(result));
  await shot(page, "99_error_partB");
} finally {
  fs.writeFileSync(`${OUT}/_result_partB.json`, JSON.stringify({ result, errors }, null, 2));
  await browser.close();
}
