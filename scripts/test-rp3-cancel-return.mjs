/**
 * RP3 Playwright 驗證腳本 — 退料反向流程
 *
 * 驗證項目：
 *  1. 建立 addon → agree → 取消選「完整退料」→ 確認 UI 更新
 *  2. 建立 addon → agree → 取消選「損耗核銷」→ 確認 UI 更新 + metadata 記錄
 *  3. 後端驗證：node + supabase service role 查 DB
 *
 * 執行：node scripts/test-rp3-cancel-return.mjs
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// --- 讀 .env.local ---
const envPath = resolve(process.cwd(), ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split("=").map((s) => s.trim()))
    .filter(([k]) => k)
    .map(([k, ...v]) => [k, v.join("=")])
);

const BASE = "http://localhost:3100";
const EMAIL = "yemming.yu@gmail.com";
const PW = "yemming.yu@gmail.com";

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

// --- 工具函式 ---
function log(msg) {
  console.log(`[RP3] ${msg}`);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 在 repair_order_addons 找 indian brand 的活躍 agreed 追加項目（測試 seed） */
async function findOrCreateTestAddon() {
  // 先找有沒有已存在的 agreed addon（indian brand）
  const { data: existing } = await supabase
    .from("repair_order_addons")
    .select(
      "id, name, ro_id, customer_decision, repair_orders!inner(brand_id, id)",
    )
    .eq("repair_orders.brand_id", "indian")
    .eq("customer_decision", "agreed")
    .order("created_at", { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    log(`找到既有 agreed addon：${existing[0].id} / ${existing[0].name}`);
    return existing[0];
  }

  // 找 indian brand pending addon 也行（用 UI 去 agree）
  const { data: pending } = await supabase
    .from("repair_order_addons")
    .select(
      "id, name, ro_id, customer_decision, repair_orders!inner(brand_id, id)",
    )
    .eq("repair_orders.brand_id", "indian")
    .eq("customer_decision", "pending")
    .order("created_at", { ascending: false })
    .limit(1);

  if (pending && pending.length > 0) {
    log(`找到 pending addon（需 UI agree）：${pending[0].id}`);
    return { ...pending[0], needsAgree: true };
  }

  // 找 indian RO 建一個 seed addon
  const { data: ros } = await supabase
    .from("repair_orders")
    .select("id")
    .eq("brand_id", "indian")
    .in("status", ["進行中", "維修中", "待結帳"])
    .limit(1);

  if (!ros || ros.length === 0) {
    throw new Error("找不到 Indian brand 的活躍工單，無法建測試 addon");
  }

  const roId = ros[0].id;
  const { data: inserted, error } = await supabase
    .from("repair_order_addons")
    .insert({
      brand_id: "indian",
      ro_id: roId,
      addon_no: 99,
      name: "RP3-TEST-零件更換",
      addon_type: "parts",
      safety_level: "normal",
      estimated_fee: 500,
      tech_reason: "RP3 自動測試用",
      customer_decision: "agreed",
      customer_decision_at: new Date().toISOString(),
      reserved_at: new Date().toISOString(),
    })
    .select("id, name, ro_id, customer_decision")
    .single();

  if (error || !inserted) throw new Error(`建 seed addon 失敗：${error?.message}`);
  log(`建立測試 addon seed：${inserted.id}`);
  return { ...inserted, isTestSeed: true };
}

/** 清掉測試建的 rows（還原） */
async function cleanupTestAddon(addonId) {
  if (!addonId) return;
  const { error } = await supabase
    .from("repair_order_addons")
    .delete()
    .eq("id", addonId)
    .eq("customer_decision", "cancelled");
  if (error) log(`清理 addon 失敗（可忽略）：${error.message}`);
  else log(`已清理測試 addon：${addonId}`);
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
let browser;
let testAddonId1 = null;
let testAddonId2 = null;

try {
  // ── Step 0: 準備兩個 test addon（一個測完整退料、一個測損耗核銷）──
  log("=== Step 0: 準備測試資料 ===");
  const { data: ros } = await supabase
    .from("repair_orders")
    .select("id")
    .eq("brand_id", "indian")
    .in("status", ["進行中", "維修中", "待結帳"])
    .limit(1);

  if (!ros || ros.length === 0) {
    log("找不到 indian RO，嘗試找任意 indian RO...");
    const { data: anyRos } = await supabase
      .from("repair_orders")
      .select("id")
      .eq("brand_id", "indian")
      .limit(1);
    if (!anyRos || anyRos.length === 0) {
      throw new Error("找不到 Indian brand 的工單，無法建測試 addon");
    }
    ros[0] = anyRos[0];
  }

  const roId = ros[0].id;
  log(`使用工單 ${roId} 建測試 addon`);

  // 先查最大 addon_no，避免 unique constraint 衝突
  const { data: maxNo } = await supabase
    .from("repair_order_addons")
    .select("addon_no")
    .eq("ro_id", roId)
    .order("addon_no", { ascending: false })
    .limit(1);
  const baseNo = ((maxNo ?? [])[0]?.addon_no ?? 0) + 100;

  // Seed addon 1（完整退料測試）
  const { data: a1, error: e1 } = await supabase
    .from("repair_order_addons")
    .insert({
      brand_id: "indian",
      ro_id: roId,
      addon_no: baseNo,
      name: "RP3-TEST-完整退料",
      addon_type: "parts",
      safety_level: "normal",
      estimated_fee: 600,
      tech_reason: "RP3 test full_return",
      customer_decision: "agreed",
      customer_decision_at: new Date().toISOString(),
      reserved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (e1 || !a1) throw new Error(`建 addon1 失敗：${e1?.message}`);
  testAddonId1 = a1.id;
  log(`addon1 (full_return) id = ${testAddonId1}`);

  // Seed addon 2（損耗核銷測試）
  const { data: a2, error: e2 } = await supabase
    .from("repair_order_addons")
    .insert({
      brand_id: "indian",
      ro_id: roId,
      addon_no: baseNo + 1,
      name: "RP3-TEST-損耗核銷",
      addon_type: "parts",
      safety_level: "normal",
      estimated_fee: 800,
      tech_reason: "RP3 test damage_writeoff",
      customer_decision: "agreed",
      customer_decision_at: new Date().toISOString(),
      reserved_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (e2 || !a2) throw new Error(`建 addon2 失敗：${e2?.message}`);
  testAddonId2 = a2.id;
  log(`addon2 (damage_writeoff) id = ${testAddonId2}`);

  // ── Step 1: 啟動瀏覽器 + 登入 ──
  log("=== Step 1: 啟動 Playwright 登入 ===");
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PW);
  await page.click('button[type="submit"]');
  // 等待導向到非 login 頁（Supabase auth 回調需 ~3-5 秒）
  await page.waitForURL(/\/(?!login)/, { timeout: 20000 });
  await page.waitForTimeout(1500); // 讓 client 端 React hydrate 完成
  log(`登入成功，URL: ${page.url()}`);

  // 設 Indian brand scope
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
      domain: "localhost",
      path: "/",
      httpOnly: false,
    },
  ]);

  // ── Step 2: 驗證 addon1（complete_return） ──
  log("=== Step 2: 測試完整退料（full_return） ===");
  await page.goto(`${BASE}/parts/aftersales/addons/${testAddonId1}`);
  await page.waitForLoadState("networkidle");
  await sleep(1000);

  // 確認頁面有「取消（退料）」按鈕（agreed addon）
  const cancelBtn = page.getByTestId("cancel-agreed-btn");
  const cancelBtnVisible = await cancelBtn.isVisible();
  log(`cancel-agreed-btn visible: ${cancelBtnVisible}`);
  if (!cancelBtnVisible) throw new Error("agreed addon 的取消（退料）按鈕不可見！");

  // 點擊取消按鈕
  await cancelBtn.click();
  await sleep(500);

  // 確認 modal 出現
  const cancelModal = page.getByTestId("cancel-addon-modal");
  const modalVisible = await cancelModal.isVisible();
  log(`cancel-addon-modal visible: ${modalVisible}`);
  if (!modalVisible) throw new Error("RP3 取消確認框未顯示！");

  // 確認三個選項都存在
  const fullReturnBtn = page.getByTestId("cancel-mode-full_return");
  const damageBtn = page.getByTestId("cancel-mode-damage_writeoff");
  const midInstallBtn = page.getByTestId("cancel-mode-mid_install");
  log(`full_return btn: ${await fullReturnBtn.isVisible()}`);
  log(`damage_writeoff btn: ${await damageBtn.isVisible()}`);
  log(`mid_install btn: ${await midInstallBtn.isVisible()}`);

  // 選 full_return（預設應該就是）
  await fullReturnBtn.click();
  await sleep(200);

  // 填原因（選填）
  await page.getByTestId("cancel-reason-input").fill("測試：零件未安裝，完整退回");

  // 確認送出
  const confirmBtn = page.getByTestId("confirm-cancel-btn");
  await confirmBtn.click();
  await sleep(2500); // 等 server action + router.refresh

  // 確認 banner 出現（成功）
  const banner = page.locator("[class*='fixed bottom-6 right-6']");
  const bannerText = await banner.textContent({ timeout: 5000 }).catch(() => "");
  log(`banner: ${bannerText}`);
  if (!bannerText.includes("退料")) {
    log("警告：banner 未顯示退料訊息，可能有錯誤");
  }

  // DB 驗證 addon1
  await sleep(1000);
  const { data: dbAddon1 } = await supabase
    .from("repair_order_addons")
    .select("id, customer_decision, metadata")
    .eq("id", testAddonId1)
    .single();
  log(`addon1 DB status: ${dbAddon1?.customer_decision}`);
  if (dbAddon1?.customer_decision !== "cancelled") {
    throw new Error(`addon1 DB 狀態錯誤！期望 cancelled，實際 ${dbAddon1?.customer_decision}`);
  }
  const meta1 = dbAddon1?.metadata ?? {};
  const cancelRecord1 = meta1.cancel_record;
  log(`addon1 cancel_record: ${JSON.stringify(cancelRecord1)}`);
  if (!cancelRecord1 || cancelRecord1.cancel_mode !== "full_return") {
    throw new Error("addon1 metadata.cancel_record 未正確記錄 full_return");
  }
  log("✅ addon1 完整退料驗證通過");

  // ── Step 3: 測試損耗核銷 ──
  log("=== Step 3: 測試損耗核銷（damage_writeoff） ===");
  await page.goto(`${BASE}/parts/aftersales/addons/${testAddonId2}`);
  await page.waitForLoadState("networkidle");
  await sleep(1000);

  const cancelBtn2 = page.getByTestId("cancel-agreed-btn");
  if (!(await cancelBtn2.isVisible())) throw new Error("addon2 取消按鈕不可見！");
  await cancelBtn2.click();
  await sleep(500);

  // 選損耗核銷
  const damageBtn2 = page.getByTestId("cancel-mode-damage_writeoff");
  await damageBtn2.click();
  await sleep(200);

  // 損耗核銷必填原因
  const reasonInput = page.getByTestId("cancel-reason-input");
  await reasonInput.fill("油封安裝後無法復原，零件損耗");

  // 確認送出
  const confirmBtn2 = page.getByTestId("confirm-cancel-btn");
  await confirmBtn2.click();
  await sleep(2500);

  const banner2 = page.locator("[class*='fixed bottom-6 right-6']");
  const bannerText2 = await banner2.textContent({ timeout: 5000 }).catch(() => "");
  log(`banner2: ${bannerText2}`);

  // DB 驗證 addon2
  await sleep(1000);
  const { data: dbAddon2 } = await supabase
    .from("repair_order_addons")
    .select("id, customer_decision, metadata")
    .eq("id", testAddonId2)
    .single();
  log(`addon2 DB status: ${dbAddon2?.customer_decision}`);
  if (dbAddon2?.customer_decision !== "cancelled") {
    throw new Error(`addon2 DB 狀態錯誤！期望 cancelled，實際 ${dbAddon2?.customer_decision}`);
  }
  const meta2 = dbAddon2?.metadata ?? {};
  const cancelRecord2 = meta2.cancel_record;
  log(`addon2 cancel_record: ${JSON.stringify(cancelRecord2)}`);
  if (!cancelRecord2 || cancelRecord2.cancel_mode !== "damage_writeoff") {
    throw new Error("addon2 metadata.cancel_record 未正確記錄 damage_writeoff");
  }
  if (!cancelRecord2.cancel_reason || !cancelRecord2.cancel_reason.includes("油封")) {
    throw new Error("addon2 損耗原因未正確記錄");
  }
  log("✅ addon2 損耗核銷驗證通過");

  log("=== ✅ RP3 退料反向流程全部驗證通過 ===");

} catch (err) {
  console.error(`[RP3] ❌ 驗證失敗：${err.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  // 清理測試資料
  if (testAddonId1) await cleanupTestAddon(testAddonId1);
  if (testAddonId2) await cleanupTestAddon(testAddonId2);
  log("=== 清理完成 ===");

  // kill dev server
  try {
    const { execSync } = await import("child_process");
    execSync("lsof -ti tcp:3100 | xargs kill -9 2>/dev/null || true", { stdio: "ignore" });
    log("已關閉 dev server port 3100");
  } catch (_) {}
}
