/**
 * R2 波次 E2E 驗證：RP7③ SA 手動新增待處理項 + B5-02 聯繫嘗試記錄
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 讀 .env.local
const env = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf8");
const envMap = {};
for (const line of env.split("\n")) {
  const m = line.match(/^([^=]+)=(.*)$/);
  if (m) envMap[m[1].trim()] = m[2].trim();
}

const SUPABASE_URL = envMap["NEXT_PUBLIC_SUPABASE_URL"];
const SERVICE_KEY = envMap["SUPABASE_SERVICE_ROLE_KEY"];
const BASE = "http://localhost:3100";
const EMAIL = "yemming.yu@gmail.com";
const PASS = "yemming.yu@gmail.com";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

let passed = 0;
let failed = 0;
const checks = [];

function check(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  if (ok) { passed++; console.log(`  ✅ ${name}${detail ? ` (${detail})` : ""}`); }
  else { failed++; console.error(`  ❌ ${name}${detail ? ` (${detail})` : ""}`); }
}

async function findTestVehicle() {
  const { data: v } = await supabase
    .from("customer_vehicles")
    .select("id, license_plate")
    .eq("brand_id", "indian")
    .not("license_plate", "is", null)
    .limit(1)
    .maybeSingle();
  return v;
}

async function findTestRo() {
  const { data: rows } = await supabase
    .from("repair_orders")
    .select("id, ro_code")
    .eq("brand_id", "indian")
    .limit(5);
  return rows?.[0] ?? null;
}

async function cleanupPendingItem(id) {
  if (!id) return;
  await supabase.from("vehicle_pending_items").delete().eq("id", id);
  console.log(`  🧹 已清理 vehicle_pending_items ${id}`);
}

async function cleanupContactAttempt(roId, at) {
  if (!roId || !at) return;
  const { data } = await supabase.from("repair_orders").select("metadata").eq("id", roId).maybeSingle();
  if (!data?.metadata) return;
  const meta = data.metadata;
  const events = Array.isArray(meta.events) ? meta.events : [];
  const filtered = events.filter(e => !(e.action === "contact_attempt" && e.at === at));
  await supabase.from("repair_orders").update({ metadata: { ...meta, events: filtered } }).eq("id", roId);
  console.log(`  🧹 已清理 RO ${roId} contact_attempt event at ${at}`);
}

let browser, page;
let createdPendingItemId = null;
let createdContactAttemptAt = null;
let testRoId = null;

try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  page = await ctx.newPage();

  // Step 1: 登入
  console.log("Step 1: 登入");
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"], input[name="email"]', EMAIL);
  await page.fill('input[type="password"], input[name="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(url => !url.href.includes("/login"), { timeout: 20000 });
  check("Step 1: 登入成功", !page.url().includes("/login"), page.url());

  // 設定 Indian scope cookie
  await ctx.addCookies([{
    name: "dealeros_scope",
    value: JSON.stringify({ brand_id: "indian", store_id: null }),
    domain: "localhost",
    path: "/",
    httpOnly: false,
  }]);

  // Step 2: 預檢 board「新增待處理項」button 可見
  console.log("Step 2: 預檢 board button 可見性");
  await page.goto(`${BASE}/parts/aftersales/pre-inspections`);
  // 等 filter bar 出現（不用 networkidle，notification bell 有 polling 不會 idle）
  await page.waitForSelector('button:has-text("查詢")', { timeout: 15000 });

  const pendingItemBtn = page.locator('button:has-text("新增待處理項")');
  const btnVisible = await pendingItemBtn.isVisible();
  check("Step 2: 「📌 新增待處理項」button 可見", btnVisible);

  // Step 3: modal → 查詢車牌 → submit → DB 確認
  console.log("Step 3: 新增待處理項 modal → submit");
  
  const testVehicle = await findTestVehicle();
  if (!testVehicle) {
    check("Step 3-pre: 找到 Indian 測試車輛", false, "DB 中無 Indian 車輛");
  } else {
    check("Step 3-pre: 找到 Indian 測試車輛", true, testVehicle.license_plate);
    
    if (btnVisible) {
      await pendingItemBtn.click();
      await page.waitForSelector('h2:has-text("SA 手動新增待處理項目")', { timeout: 5000 });
      check("Step 3a: modal 開啟", true);

      // 輸入車牌 (此 modal 的輸入框 placeholder 是 "ABC-1234")
      const plateInputs = page.locator('input[placeholder="ABC-1234"]');
      // 第一個可見的（新增預檢 modal 已關閉，只剩 pending-item modal 的）
      await plateInputs.first().fill(testVehicle.license_plate);
      await page.locator('button:has-text("🔍 查詢")').last().click();
      await page.waitForTimeout(2500);
      
      const lookupResult = await page.locator('text=找到車籍').isVisible();
      check("Step 3b: 車牌查詢成功", lookupResult, testVehicle.license_plate);
      
      if (lookupResult) {
        // 填項目說明
        await page.fill('input[placeholder*="前煞車皮"]', "R2測試-SA手動待處理項-前煞車片磨損");
        
        // 選安全等級（選含「警示」的 option）
        await page.locator('select:has(option:text-is("警示（影響使用安全）"))').selectOption("警示");
        
        // 填原因（第二個 input）
        await page.fill('input[placeholder*="客戶電話"]', "R2自動測試建立");
        
        // 點 modal 內的「新增待處理項」submit 按鈕（排除 filter bar 的那顆）
        // modal 內的 submit button 有 bg-[#854F0B]（深棕色），filter bar 的是 bg-[#FDF3E3]
        const submitBtn = page.locator('.bg-\\[\\#854F0B\\]:has-text("新增待處理項")');
        await submitBtn.click();
        await page.waitForTimeout(2500);
        
        // DB 確認
        const { data: pendingRows } = await supabase
          .from("vehicle_pending_items")
          .select("id, item_desc, metadata")
          .eq("vehicle_id", testVehicle.id)
          .eq("item_desc", "R2測試-SA手動待處理項-前煞車片磨損")
          .limit(1);
        
        const pendingRow = pendingRows?.[0];
        check("Step 3c: DB vehicle_pending_items 有新 row", !!pendingRow, pendingRow?.id ?? "無");
        if (pendingRow) {
          check("Step 3d: metadata.source = sa_manual", 
            pendingRow.metadata?.source === "sa_manual",
            String(pendingRow.metadata?.source));
          check("Step 3e: metadata.safety_level = 警示",
            pendingRow.metadata?.safety_level === "警示",
            String(pendingRow.metadata?.safety_level));
          createdPendingItemId = pendingRow.id;
        }
        
        const successBanner = await page.locator('text=已新增待處理項目').isVisible();
        check("Step 3f: 成功 banner", successBanner);
      }
    } else {
      check("Step 3a: modal button 不可見，跳過", false);
    }
  }

  // Step 4: 預檢側欄帶出待處理項（用 「新增預檢」blank modal 查車牌驗證）
  if (testVehicle && createdPendingItemId) {
    console.log("Step 4: 預檢新建 modal 車牌查詢帶出 pending_items");
    await page.goto(`${BASE}/parts/aftersales/pre-inspections`);
    await page.waitForSelector('button:has-text("查詢")', { timeout: 15000 });
    
    await page.click('button:has-text("新增預檢")');
    await page.waitForSelector('h2:has-text("新增預檢單")', { timeout: 5000 });
    await page.click('button:has-text("空白單（無預約）")');
    
    const plateInputBlank = page.locator('input[placeholder="ABC-1234"]').first();
    await plateInputBlank.fill(testVehicle.license_plate);
    await page.locator('button:has-text("🔍 查詢")').first().click();
    await page.waitForTimeout(2500);
    
    const pendingSection = await page.locator('text=待處理項目').isVisible();
    check("Step 4: 預檢 modal 車牌查詢帶出待處理項目", pendingSection);
    
    await page.keyboard.press("Escape");
  } else {
    check("Step 4: 略過（無測試資料）", true, "pending_item 未建或無車輛");
  }

  // Step 5: RO 詳情頁「記錄聯繫」button 可見
  console.log("Step 5: RO 詳情頁「記錄聯繫」button");
  const testRo = await findTestRo();
  if (!testRo) {
    check("Step 5-pre: 找到 Indian RO", false, "DB 無 Indian RO");
  } else {
    testRoId = testRo.id;
    check("Step 5-pre: 找到 Indian RO", true, testRo.ro_code);
    
    await page.goto(`${BASE}/parts/aftersales/repair-orders/${testRo.id}`);
    await page.waitForSelector('h1', { timeout: 15000 });

    const contactBtn = page.locator('button:has-text("記錄聯繫")');
    const contactBtnVisible = await contactBtn.isVisible();
    check("Step 5: 「📞 記錄聯繫」button 可見", contactBtnVisible);

    // Step 6: modal → submit → DB 確認
    console.log("Step 6: 記錄聯繫 modal → submit → DB 確認");
    
    if (contactBtnVisible) {
      await contactBtn.click();
      await page.waitForSelector('text=記錄聯繫嘗試', { timeout: 5000 });
      check("Step 6a: 聯繫嘗試 modal 開啟", true);
      
      // 選 LINE / 回覆
      await page.locator('select').nth(0).selectOption("LINE");
      await page.locator('select').nth(1).selectOption("回覆");
      
      // 填備註
      await page.fill('textarea', "R2自動測試-聯繫嘗試記錄-請忽略");
      
      const beforeAt = new Date().toISOString();
      
      await page.click('button:has-text("確認記錄")');
      await page.waitForTimeout(2500);
      
      // DB 確認
      const { data: roData } = await supabase
        .from("repair_orders")
        .select("metadata")
        .eq("id", testRo.id)
        .maybeSingle();
      
      const meta = roData?.metadata ?? {};
      const events = Array.isArray(meta.events) ? meta.events : [];
      const contactEvents = events.filter(
        e => e.action === "contact_attempt" && e.at > beforeAt
      );
      
      check("Step 6b: DB events[] 有 contact_attempt event", contactEvents.length > 0, 
        `全部 events: ${events.length}, contact_attempt (after test): ${contactEvents.length}`);
      
      if (contactEvents.length > 0) {
        const ev = contactEvents[contactEvents.length - 1];
        check("Step 6c: payload.method = LINE", ev.payload?.method === "LINE", String(ev.payload?.method));
        check("Step 6d: payload.result = 回覆", ev.payload?.result === "回覆", String(ev.payload?.result));
        check("Step 6e: payload.notes 有值", !!ev.payload?.notes, String(ev.payload?.notes));
        createdContactAttemptAt = ev.at;
      }
      
      const successBanner = await page.locator('text=已記錄聯繫嘗試').isVisible();
      check("Step 6f: 成功 banner", successBanner);
      
      // Refresh → timeline 顯示
      await page.reload();
      await page.waitForSelector('h1', { timeout: 15000 });
      const timelineContact = await page.locator('text=聯繫嘗試：LINE / 回覆').isVisible();
      check("Step 6g: refresh 後 timeline 顯示 contact_attempt", timelineContact);
    } else {
      check("Step 6: 跳過（button 不可見）", false);
    }
  }

} catch (err) {
  console.error("❌ 測試例外：", err.message, err.stack);
  failed++;
} finally {
  console.log("\n清理測試資料...");
  await cleanupPendingItem(createdPendingItemId);
  await cleanupContactAttempt(testRoId, createdContactAttemptAt);
  
  if (browser) await browser.close();
  
  console.log(`\n───────────────────────────────`);
  console.log(`R2 RP7③+B5-02 測試完成：${passed} passed / ${failed} failed`);
  if (failed > 0) {
    console.log("\n失敗項目：");
    checks.filter(c => !c.ok).forEach(c => console.log(`  ❌ ${c.name} ${c.detail ? `(${c.detail})` : ""}`));
  }
  process.exit(failed > 0 ? 1 : 0);
}
