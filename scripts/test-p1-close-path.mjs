/**
 * Playwright 驗證腳本：P1 關單分歧修復
 *
 * 驗證目標：
 * 1. 結帳關單路徑（completeAction）把 RO status 寫成「已關單」（不再是「已結案」）
 * 2. D+3 / D+7 售後電訪任務在結帳關單後確實建立
 * 3. 驗證方式：建一張 Indian brand RO → 走結帳四步驟 → 完成關單 → 用 service role 查 DB
 *
 * 測試資料用完後自動清除（clean up）。
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");

// 讀 .env.local
const envRaw = readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const BASE_URL = "http://localhost:3100";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";

let createdRoId = null;
let createdCheckoutId = null;

async function cleanup() {
  if (createdCheckoutId) {
    await sb.from("ro_checkouts").delete().eq("id", createdCheckoutId);
    console.log(`  [cleanup] 刪除 ro_checkout ${createdCheckoutId}`);
  }
  if (createdRoId) {
    // 刪測試用 call_tasks（D+3/D+7）
    await sb.from("call_tasks").delete().eq("metadata->>source_ro", createdRoId);
    // 刪 RO
    await sb.from("repair_orders").delete().eq("id", createdRoId);
    console.log(`  [cleanup] 刪除 repair_order ${createdRoId}`);
  }
}

// ─── Step 0：直接透過 service role 建立測試 RO（Indian brand）+ 結帳單，跳過 UI 建單步驟 ───
// 原因：UI 建單需要完整的預約/預檢資料，過於複雜；我們只需驗證 completeAction 的關單連鎖。
// 直接在 DB 建一張已付款結帳單，然後用 Playwright 按「確認關單」按鈕觸發 completeAction。

async function setupTestData() {
  console.log("\n[setup] 查 Indian brand 基本 seed 資料...");

  // 找 Indian brand 的任一客戶
  const { data: customers } = await sb
    .from("customers")
    .select("id, name")
    .eq("brand_id", "indian")
    .limit(1);

  if (!customers || customers.length === 0) {
    throw new Error("找不到 Indian brand 客戶，請確認 seed 資料");
  }
  const customer = customers[0];
  console.log(`  使用客戶：${customer.name} (${customer.id})`);

  // 建測試 RO
  const now = new Date().toISOString();
  const { data: ro, error: roErr } = await sb
    .from("repair_orders")
    .insert({
      brand_id: "indian",
      ro_code: `MN-TEST-${Date.now()}`,
      prefix_p1: "MN",
      prefix_p2: "CP",
      issue_date: now.slice(0, 10),
      sequence_no: 9999,
      customer_id: customer.id,
      status: "待結帳",  // 結帳完成前的狀態
      priority: "normal",
      opened_at: now,
      fee_allocation: "customer",
      metadata: { _test: true },
    })
    .select("id, ro_code")
    .single();

  if (roErr || !ro) {
    throw new Error(`建 RO 失敗：${roErr?.message}`);
  }
  createdRoId = ro.id;
  console.log(`  建立測試 RO：${ro.ro_code} (${ro.id})`);

  // 建對應的已付款結帳單
  const { data: ck, error: ckErr } = await sb
    .from("ro_checkouts")
    .insert({
      brand_id: "indian",
      repair_order_id: ro.id,
      checkout_no: `CK-TEST-${Date.now()}`,
      status: "paid",  // 已付款，可以直接關單
      fee_summary: { payable: 0, lines: [], discount_pct: 0, customer_no_dispute: true },
      customer_signature: { signature_text: "test-sig", signed_at: now },
      payment: { method: "cash", paid_at: now, amount: 0 },
      invoice: { kind: "personal", invoice_no: "EI-TEST", issued_at: now },
      fees_confirmed_at: now,
    })
    .select("id, checkout_no")
    .single();

  if (ckErr || !ck) {
    throw new Error(`建結帳單失敗：${ckErr?.message}`);
  }
  createdCheckoutId = ck.id;
  console.log(`  建立測試結帳單：${ck.checkout_no} (${ck.id})`);

  return { ro, checkout: ck, customer };
}

async function runTest() {
  let browser;
  try {
    const { ro, checkout, customer } = await setupTestData();

    console.log("\n[playwright] 啟動瀏覽器...");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 登入
    console.log("[playwright] 登入...");
    await page.goto(`${BASE_URL}/login`);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/(parts|workspace|admin|feedback|dashboard)/, { timeout: 15000 });
    console.log("  登入成功");

    // 設定 Indian scope cookie
    await context.addCookies([{
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
      domain: "localhost",
      path: "/",
      httpOnly: false,
    }]);

    // 開啟結帳頁（step4 — 已付款結帳單，按「確認關單」）
    const checkoutUrl = `${BASE_URL}/parts/aftersales/checkout/${checkout.id}`;
    console.log(`[playwright] 開啟結帳頁：${checkoutUrl}`);
    await page.goto(checkoutUrl);
    await page.waitForLoadState("networkidle");

    // 找並點擊「確認關單」按鈕
    const closeBtn = page.getByText(/確認關單|標記 RO 已結案/);
    const closeBtnCount = await closeBtn.count();
    if (closeBtnCount === 0) {
      // 找其他可能的關單按鈕
      const allBtns = await page.locator("button").allInnerTexts();
      console.log("  頁面上的按鈕：", allBtns.filter(t => t.trim()).join(" | "));
      throw new Error("找不到「確認關單」按鈕，可能頁面結構不同或需要先走前面步驟");
    }

    console.log("[playwright] 點擊「確認關單」...");
    await closeBtn.first().click();

    // 等待關單完成（等 banner 出現或按鈕消失）
    await page.waitForTimeout(3000);

    const bannerText = await page.locator('[class*="bottom"]').first().innerText().catch(() => "");
    console.log(`  頁面反饋：${bannerText || "(無 banner)"}`);

    await browser.close();
    browser = null;

    // ─── DB 驗證 ───
    console.log("\n[DB verify] 驗證資料庫狀態...");

    // 1. 驗 RO status
    const { data: roFinal } = await sb
      .from("repair_orders")
      .select("status, closed_at")
      .eq("id", createdRoId)
      .single();

    if (!roFinal) throw new Error("找不到 RO 資料");

    const statusOk = roFinal.status === "已關單";
    console.log(`  RO status = "${roFinal.status}" ${statusOk ? "✅" : "❌ (期望「已關單」)"}`);

    // 2. 驗 checkout status
    const { data: ckFinal } = await sb
      .from("ro_checkouts")
      .select("status, closed_at")
      .eq("id", createdCheckoutId)
      .single();

    const checkoutOk = ckFinal?.status === "completed";
    console.log(`  checkout status = "${ckFinal?.status}" ${checkoutOk ? "✅" : "❌"}`);

    // 3. 驗 D+3 / D+7 call_tasks（after() 非同步，等最多 5 秒）
    console.log("  [等待 after() hooks 執行，最多 5s]");
    await new Promise(r => setTimeout(r, 5000));

    const { data: tasks } = await sb
      .from("call_tasks")
      .select("id, call_type, scheduled_at, metadata")
      .eq("customer_id", customer.id)
      .in("call_type", ["aftersales_d3", "aftersales_d7"]);

    const hasD3 = tasks?.some(t => t.call_type === "aftersales_d3") ?? false;
    const hasD7 = tasks?.some(t => t.call_type === "aftersales_d7") ?? false;
    console.log(`  D+3 電訪任務：${hasD3 ? "✅" : "❌"}`);
    console.log(`  D+7 電訪任務：${hasD7 ? "✅" : "❌"}`);

    // 彙總結果
    const allOk = statusOk && checkoutOk && hasD3 && hasD7;
    console.log(`\n[result] 整體：${allOk ? "✅ 全部通過" : "❌ 有項目失敗"}`);

    if (!allOk) {
      // 顯示 tasks 原始資料協助診斷
      if (tasks) console.log("  tasks found:", JSON.stringify(tasks.slice(0, 3), null, 2));
      throw new Error("P1 驗證失敗");
    }

    return true;
  } finally {
    if (browser) await browser.close();
    console.log("\n[cleanup] 清除測試資料...");
    await cleanup();
    console.log("[cleanup] 完成");
  }
}

runTest()
  .then(() => {
    console.log("\n✅ P1 關單分歧修復驗證通過");
    process.exit(0);
  })
  .catch(e => {
    console.error("\n❌ 驗證失敗：", e.message);
    cleanup().catch(() => {});
    process.exit(1);
  });
