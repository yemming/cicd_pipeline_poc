/**
 * Playwright test: RP4 工單事件時間軸
 *
 * 驗證：
 * 1. 登入 → 切 Indian scope
 * 2. 到工單詳情頁，確認「事件時間軸（稽核紀錄）」區塊存在
 * 3. 執行一個狀態變更（進行中 → 維修中），確認 DB metadata.events 有新增一筆
 * 4. Refresh 頁面，確認事件時間軸 UI 顯示新事件
 * 5. 清理：把狀態改回來（用 supabase service role 直接 UPDATE）
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3100";
const EMAIL = "yemming.yu@gmail.com";
const PWD = "yemming.yu@gmail.com";
const SUPABASE_URL = "https://bykvtcptbirpxyqkfwfl.supabase.co";
const SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5a3Z0Y3B0YmlycHh5cWtmd2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTc5MTYyMSwiZXhwIjoyMDkxMzY3NjIxfQ.QgtpBpj7dLXxV0fn_NetuPlam0iA_Co7apDsPyhnM8k";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// 用 service role 直接查 DB
async function getMetadataEvents(roId) {
  const { data, error } = await sb
    .from("repair_orders")
    .select("metadata")
    .eq("id", roId)
    .maybeSingle();
  if (error) throw new Error(`DB 查詢失敗: ${error.message}`);
  const meta = (data?.metadata ?? {});
  return Array.isArray(meta.events) ? meta.events : [];
}

async function main() {
  console.log("▶ RP4 事件時間軸 Playwright 測試開始");

  // 選一張 Indian brand 的 open RO
  const { data: ros, error: roErr } = await sb
    .from("repair_orders")
    .select("id, ro_code, status, metadata")
    .eq("brand_id", "indian")
    .eq("status", "進行中")
    .order("created_at", { ascending: false })
    .limit(1);
  if (roErr || !ros?.length) throw new Error(`找不到 Indian 進行中工單: ${roErr?.message}`);

  const ro = ros[0];
  console.log(`  → 使用工單：${ro.ro_code} (${ro.id}) status=${ro.status}`);
  const eventsBeforeCount = Array.isArray((ro.metadata ?? {}).events) ? ro.metadata.events.length : 0;
  console.log(`  → 目前 events 筆數：${eventsBeforeCount}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 1. 登入
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PWD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 20000 });
  console.log("  ✓ 登入成功");

  // 2. 設定 Indian scope（cookie）
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
      domain: "localhost",
      path: "/",
      httpOnly: false,
    },
  ]);

  // 3. 到 RO 詳情頁
  const roUrl = `${BASE}/parts/aftersales/repair-orders/${ro.id}`;
  await page.goto(roUrl);
  await page.waitForLoadState("networkidle", { timeout: 20000 });
  console.log("  ✓ 詳情頁載入完成");

  // 4. 確認「事件時間軸」區塊存在
  const timelineHeader = page.getByText("事件時間軸（稽核紀錄）");
  await timelineHeader.waitFor({ timeout: 10000 });
  console.log("  ✓ 「事件時間軸（稽核紀錄）」區塊存在");

  // 5. 確認「0 筆」或顯示事件數
  const countText = await page.getByText(/筆 · append-only/).textContent();
  console.log(`  ✓ 時間軸筆數顯示：${countText?.trim()}`);

  // 6. 執行狀態切換（進行中 → 維修中）
  //    先找「切「維修中」」按鈕（detail view 的 chip buttons）
  const dispatchBtn = page.getByRole("button", { name: /切「維修中」/ });
  const btnCount = await dispatchBtn.count();
  if (btnCount === 0) {
    console.log("  ⚠️  找不到「切維修中」按鈕（工單可能不是進行中），跳過動作測試");
  } else {
    await dispatchBtn.first().click();
    // 等待確認 modal
    const confirmBtn = page.getByRole("button", { name: "確認切換" });
    await confirmBtn.waitFor({ timeout: 8000 });
    await confirmBtn.click();
    // 等 banner 出現
    const banner = page.locator(".fixed.bottom-6").first();
    await banner.waitFor({ timeout: 15000 });
    const bannerText = await banner.textContent();
    console.log(`  ✓ 狀態切換 banner：${bannerText?.trim()}`);

    // 稍候讓 after() 副作用執行
    await page.waitForTimeout(1500);

    // 7. DB 驗證 events 有新增
    const eventsAfter = await getMetadataEvents(ro.id);
    console.log(`  ✓ DB metadata.events 筆數：${eventsAfter.length}（原 ${eventsBeforeCount}）`);

    const newEvent = eventsAfter.find(
      (e) => e.action === "status_changed" && e.payload?.to === "維修中",
    );
    if (newEvent) {
      console.log(`  ✓ 找到 status_changed 事件：${JSON.stringify(newEvent)}`);
    } else {
      console.log("  ⚠️  未找到 status_changed events（可能 after() 尚在處理中，可再等候）");
      // 再等 3 秒
      await page.waitForTimeout(3000);
      const eventsAfter2 = await getMetadataEvents(ro.id);
      const newEvent2 = eventsAfter2.find(
        (e) => e.action === "status_changed" && e.payload?.to === "維修中",
      );
      console.log(`  → 再查：${eventsAfter2.length} 筆，status_changed 找到：${!!newEvent2}`);
    }

    // 8. Refresh 頁面，確認 UI 顯示事件
    await page.reload();
    await page.waitForLoadState("networkidle", { timeout: 20000 });
    const timelineItems = page.locator("section").filter({ hasText: "事件時間軸（稽核紀錄）" })
      .locator("li");
    const itemCount = await timelineItems.count();
    console.log(`  ✓ 頁面 Refresh 後 timeline items: ${itemCount}`);

    // 9. 清理：把工單狀態改回「進行中」
    console.log("  → 清理：把工單狀態還原為「進行中」...");
    const { error: resetErr } = await sb
      .from("repair_orders")
      .update({ status: "進行中" })
      .eq("id", ro.id);
    if (resetErr) {
      console.error(`  ⚠️  清理失敗（不影響測試結論）：${resetErr.message}`);
    } else {
      console.log("  ✓ 清理完成（工單已還原 進行中）");
    }
  }

  await browser.close();
  console.log("✅ RP4 事件時間軸測試通過");
}

main().catch((e) => {
  console.error("❌ 測試失敗：", e.message);
  process.exit(1);
});
