/**
 * B5 修復：Indian 品牌 4 家門店（台中/台南/嘉義/高雄）在 warehouses 表零記錄，
 * 導致無法測試「跨兩家不同門店」的調撥。
 *
 * 根因確認：不是 code bug —— /parts/setup/org 的「＋ 新增倉庫」（domain/org.ts
 * addWarehouse）本身運作正常，只是從沒人幫這 4 家店建過倉庫（純資料缺口）。
 *
 * 本腳本走真實 UI（/parts/setup/org）替 4 家店各建 1 個 main 倉庫，
 * 讓「跨門店調撥」場景可以真正被測到。
 */

import { chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.join(__dirname, "../../../docs/20260728_russell_reply/shots");
const BASE_URL = "https://dealeros.zeabur.app";

const ADMIN = { email: "yemming.yu@gmail.com", password: "yemming.yu@gmail.com" };

// 待建立的 4 家門店倉庫（code 需在 (brand_id, code) 唯一）
const NEW_WAREHOUSES = [
  { storeCode: "STORE-TAICHUNG", storeName: "台中直營店", code: "WH-TC-MAIN", name: "台中主倉" },
  { storeCode: "STORE-TAINAN", storeName: "台南直營店", code: "WH-TN-MAIN", name: "台南主倉" },
  { storeCode: "STORE-CHIAYI", storeName: "嘉義直營店", code: "WH-CY-MAIN", name: "嘉義主倉" },
  { storeCode: "STORE-KAOHSIUNG", storeName: "高雄直營店", code: "WH-KH-MAIN", name: "高雄主倉" },
];

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function shot(page, name) {
  const filepath = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 ${name}.png`);
  return filepath;
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', ADMIN.email);
  await page.fill('input[type="password"]', ADMIN.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
  console.log(`✅ 登入成功 → ${page.url()}`);
}

async function switchToIndian(page) {
  await page.goto(`${BASE_URL}/parts/setup/org`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  // topbar scope switcher：文字含「/」的按鈕，title="切換品牌 / 門店"
  const switcher = page.locator('button[title="切換品牌 / 門店"]');
  await switcher.waitFor({ state: "visible", timeout: 10000 });
  const label = await switcher.innerText();
  console.log("目前品牌/門店：", label);
  if (label.includes("Indian") || label.includes("印第安")) {
    console.log("已經是 Indian scope，略過切換");
    return;
  }
  await switcher.click();
  await page.waitForTimeout(300);
  // 品牌清單裡點含 Indian 字樣的項目
  const indianOption = page.locator("ul li button", { hasText: /Indian|印第安/ }).first();
  await indianOption.click();
  await page.waitForTimeout(1000);
  await page.waitForLoadState("domcontentloaded").catch(() => {});
}

async function createWarehouse(page, wh) {
  await page.goto(`${BASE_URL}/parts/setup/org`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  const addBtn = page.getByRole("button", { name: "＋ 新增倉庫" });
  await addBtn.waitFor({ state: "visible", timeout: 15000 });
  await addBtn.click();
  await page.waitForTimeout(300);

  // Modal：所屬門店 select（第一個 select）
  const storeSelect = page.locator("select").first();
  const options = await storeSelect.locator("option").allTextContents();
  const optText = options.find((o) => o.includes(wh.storeName));
  if (!optText) {
    throw new Error(`找不到門店選項「${wh.storeName}」，現有：${options.join(", ")}`);
  }
  await storeSelect.selectOption({ label: optText });
  await page.waitForTimeout(200);

  // 倉庫代碼 / 名稱 input（placeholder 分別為 例：WH-001 / 無 placeholder，用順序抓）
  const codeInput = page.locator('input[placeholder="例：WH-001"]');
  await codeInput.fill(wh.code);
  // 名稱是 code 旁邊的另一個 text input（在同一個 grid 內、非 code input）
  const nameInput = page.locator("input").nth(1); // 0=code(first ref), 1=name usually next
  // 更保險：抓所有可見 text input，第二個通常是名稱
  const allTextInputs = page.locator('input[type="text"], input:not([type])');
  const count = await allTextInputs.count();
  console.log(`  modal 內 text input 數：${count}`);
  await codeInput.waitFor({ state: "visible" });

  await shot(page, `B5fix-${wh.code}-modal填寫前`);

  // 找「倉庫名稱」label 對應的 input：用 label text 定位其後的 input
  const nameByLabel = page.locator("label", { hasText: "倉庫名稱" }).locator("xpath=following-sibling::input").first();
  if (await nameByLabel.count()) {
    await nameByLabel.fill(wh.name);
  } else {
    await nameInput.fill(wh.name);
  }

  await shot(page, `B5fix-${wh.code}-modal填寫後`);

  const submitBtn = page.getByRole("button", { name: /建立/ }).last();
  await submitBtn.click();
  await page.waitForTimeout(1200);
  await shot(page, `B5fix-${wh.code}-建立後`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  try {
    await login(page);
    await switchToIndian(page);

    for (const wh of NEW_WAREHOUSES) {
      console.log(`\n── 建立 ${wh.storeName} → ${wh.code} ${wh.name} ──`);
      await createWarehouse(page, wh);
    }

    console.log("\n✅ 全部完成");
  } catch (err) {
    console.error("❌ 執行中出錯：", err);
    await shot(page, "B5fix-ERROR_最後狀態");
    throw err;
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
