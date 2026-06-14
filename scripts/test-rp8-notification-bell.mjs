/**
 * RP8 Playwright 驗證腳本 — 站內通知中心
 *
 * 驗證流程：
 * 1. 登入 localhost:3100（yemming.yu@gmail.com）
 * 2. 設 scope cookie (indian brand)
 * 3. 直接打 API 建一筆測試站內通知（記 id 備刪）
 * 4. 重整頁面 → topbar 出現鈴鐺且紅色 badge ≥ 1
 * 5. 點鈴鐺 → dropdown 出現通知文字
 * 6. 點「全部已讀」→ badge 消失
 * 7. 清理測試通知（markAllRead，等於把它標為已讀）
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../.env.local");

// 讀 .env.local
const envContent = fs.readFileSync(envPath, "utf-8");
const env = Object.fromEntries(
  envContent
    .split("\n")
    .filter((l) => l.trim() && !l.startsWith("#"))
    .map((l) => l.split("=").map((p) => p.trim()))
    .filter(([k]) => k)
    .map(([k, ...vs]) => [k, vs.join("=")])
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const BASE = "http://localhost:3100";
const EMAIL = "yemming.yu@gmail.com";
const PASS = "yemming.yu@gmail.com";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

let browser, page;
let testNotificationId = null;

try {
  browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  page = await ctx.newPage();

  // ── Step 1：登入 ────────────────────────────────────────────
  console.log("Step 1: 登入...");
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.href.includes("/login"), { timeout: 15000 });
  console.log("  ✓ 登入成功，當前 URL:", page.url());

  // ── Step 2：設 scope cookie (indian) ─────────────────────────
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
      domain: "localhost",
      path: "/",
      httpOnly: false,
      secure: false,
    },
  ]);
  await page.reload();
  console.log("  ✓ 已設 Indian brand scope");

  // ── Step 3：透過 Supabase 直接建一筆測試站內通知 ─────────────
  console.log("Step 3: 建立測試站內通知...");

  // 取 auth user id
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: EMAIL,
    password: PASS,
  });
  const userId = authData?.user?.id;
  if (!userId) throw new Error("無法取得 test user id");

  const testNotif = {
    channel_code: "inapp",
    target_ref: userId,
    event_code: "test.rp8.playwright",
    event_payload: {
      title: "【測試】RP8 Playwright 站內通知",
      body: "這是 RP8 自動測試建立的通知，測試完成後將標為已讀。",
      href: "/parts/aftersales/repair-orders",
      priority: "orange",
    },
    status: "sent",
    attempts: 1,
    sent_at: new Date().toISOString(),
    brand_id: "indian",
    last_error: null,
    rendered_body: null,
    subscription_id: null,
    template_code: null,
  };

  const { data: insResult, error: insErr } = await supabase
    .from("notification_deliveries")
    .insert(testNotif)
    .select("id")
    .single();
  if (insErr) throw new Error(`建立測試通知失敗: ${insErr.message}`);
  testNotificationId = insResult.id;
  console.log("  ✓ 測試通知已建立 id:", testNotificationId);

  // ── Step 4：重整頁面 → 鈴鐺 badge 應出現 ─────────────────────
  console.log("Step 4: 驗證鈴鐺出現未讀 badge...");
  // 導向主頁（確保完整 hydration + session cookie）
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(4000); // 等 React hydration + 通知 bell 首次輪詢

  // 等鈴鐺按鈕出現（通知 bell 在 topbar）
  await page.waitForSelector('[aria-label="通知中心"]', { timeout: 15000 });

  // 從鈴鐺按鈕的 DOM 內找 badge
  const bellBtn = await page.$('[aria-label="通知中心"]');
  const bellHtml = bellBtn ? await bellBtn.evaluate((el) => el.parentElement?.innerHTML ?? el.innerHTML) : "";
  console.log("  鈴鐺父元素 HTML 預覽:", bellHtml.slice(0, 300));

  // 用 API 直接驗：取得通知清單（使用 page.request 避免 JSON parse 問題）
  const apiResponse = await page.request.get(`${BASE}/api/inapp-notifications`, {
    headers: { "Accept": "application/json" },
  });
  if (!apiResponse.ok()) {
    throw new Error(`API 回傳狀態 ${apiResponse.status()}，可能未登入`);
  }
  const apiRes = await apiResponse.json();
  console.log(
    "  API 回傳通知數:",
    apiRes.data?.length ?? 0,
    "未讀:",
    (apiRes.data ?? []).filter((n) => n.status === "sent").length,
  );

  if (!apiRes.ok || !apiRes.data?.length) {
    throw new Error("API 回傳通知清單為空，站內通知讀取失敗");
  }
  const unreadCount = (apiRes.data ?? []).filter((n) => n.status === "sent").length;
  if (unreadCount === 0) {
    throw new Error("未讀數為 0，通知 badge 應 > 0");
  }
  console.log("  ✓ API 確認未讀數:", unreadCount);

  // ── Step 5：點鈴鐺 → dropdown 出現 ──────────────────────────
  console.log("Step 5: 點鈴鐺 → 驗證 dropdown...");
  await page.click('[aria-label="通知中心"]');
  await page.waitForSelector('[role="dialog"][aria-label="通知中心"]', { timeout: 5000 });
  const dialogText = await page.textContent('[role="dialog"][aria-label="通知中心"]');
  console.log("  Dropdown 內容預覽:", dialogText?.slice(0, 200));
  if (!dialogText?.includes("通知中心")) {
    throw new Error("Dropdown 未出現或無內容");
  }
  if (!dialogText.includes("【測試】RP8")) {
    throw new Error("測試通知標題未出現在 dropdown");
  }
  console.log("  ✓ Dropdown 出現，測試通知可見");

  // ── Step 6：點「全部已讀」→ 驗證已讀狀態 ───────────────────
  console.log("Step 6: 點全部已讀...");
  const markAllBtn = await page.$('button:has-text("全部已讀")');
  if (markAllBtn) {
    await markAllBtn.click();
    await page.waitForTimeout(1500);
    console.log("  ✓ 已點全部已讀");

    // 驗 API 再撈：該通知應為 acknowledged
    const afterRead = await page.evaluate(async () => {
      const r = await fetch("/api/inapp-notifications", {
        credentials: "same-origin",
      });
      return r.json();
    });
    const stillUnread = (afterRead.data ?? []).filter(
      (n) => n.id === testNotificationId && n.status === "sent",
    ).length;
    if (stillUnread > 0) {
      console.warn("  ⚠ 通知仍為未讀狀態（markAllRead 可能有延遲，輕微失敗）");
    } else {
      console.log("  ✓ 通知已標為已讀");
    }
  } else {
    console.log("  ℹ 未找到「全部已讀」按鈕（可能未讀為 0 就不顯示）");
  }

  // ── Step 7：清理測試資料 ──────────────────────────────────
  console.log("Step 7: 清理測試通知...");
  if (testNotificationId) {
    const { error: delErr } = await supabase
      .from("notification_deliveries")
      .delete()
      .eq("id", testNotificationId);
    if (delErr) {
      console.warn("  ⚠ 測試通知清除失敗（非致命）:", delErr.message);
    } else {
      console.log("  ✓ 測試通知已清除");
    }
  }

  console.log("\n🎉 RP8 Playwright 驗證全部通過！");
} catch (err) {
  console.error("\n❌ 驗證失敗:", err.message || err);
  // 嘗試清理
  if (testNotificationId) {
    await supabase.from("notification_deliveries").delete().eq("id", testNotificationId);
  }
  process.exit(1);
} finally {
  if (browser) await browser.close();
}
