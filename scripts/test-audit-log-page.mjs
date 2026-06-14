/**
 * E2E 驗證：售後稽核日誌頁面 DataGrid 顯示 audit_logs 測試資料
 *
 * 使用方式：node scripts/test-audit-log-page.mjs
 */

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dir = dirname(fileURLToPath(import.meta.url));
// 手動讀取 .env.local
const envPath = join(__dir, "../.env.local");
for (const line of readFileSync(envPath, "utf-8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const BASE_URL = "http://localhost:3100";
const EMAIL = "yemming.yu@gmail.com";
const PASSWORD = "yemming.yu@gmail.com";

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function main() {
  console.log("[verify] 連線 Supabase 確認測試資料...");
  const { data: rows, error } = await svc
    .from("audit_logs")
    .select("id, table_name, action, brand_id, created_at")
    .eq("brand_id", "indian")
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("[verify] ❌ audit_logs 查詢失敗:", error.message);
    process.exit(1);
  }

  console.log(`[verify] audit_logs 筆數（indian）: ${rows.length}`);
  if (rows.length === 0) {
    console.error("[verify] ❌ 沒有測試資料（應先 INSERT 一筆）");
    process.exit(1);
  }
  console.log("[verify] 最新一筆:", rows[0]);

  console.log("[verify] 啟動 Playwright 登入...");
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // 登入
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 15000 });
  console.log("[verify] 登入成功");

  // 設定 scope cookie (indian)
  await ctx.addCookies([{
    name: "dealeros_scope",
    value: JSON.stringify({ brand_id: "indian", store_id: null }),
    domain: "localhost",
    path: "/",
  }]);

  // 前往售後稽核日誌頁，等待不再是登入頁
  await page.goto(`${BASE_URL}/parts/aftersales/audit-log`);
  // 等頁面穩定（允許服務端重定向或渲染）
  try {
    await page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 10000 });
  } catch {
    // 可能已直接在目標頁，繼續
  }
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  const currentUrl = page.url();
  console.log(`[verify] 目前 URL: ${currentUrl}`);

  // 截圖保存（full page）
  await page.screenshot({ path: "/tmp/audit-log-verify.png", fullPage: true });
  console.log("[verify] 截圖: /tmp/audit-log-verify.png");

  const pageContent = await page.content();

  // 確認頁面有 "售後稽核日誌" 文字
  const hasTitle = pageContent.includes("售後稽核日誌");
  const hasAuditRow = pageContent.includes("discount_applied");
  console.log(`[verify] 頁面含「售後稽核日誌」: ${hasTitle}`);
  console.log(`[verify] 頁面含 discount_applied: ${hasAuditRow}`);

  await browser.close();

  if (!hasTitle) {
    console.error("[verify] ❌ 頁面未找到「售後稽核日誌」標題");
    // 顯示 body 內容幫助診斷
    console.log("[verify] 頁面 body:", pageContent.substring(0, 500));
    process.exit(1);
  }

  if (!hasAuditRow) {
    console.error("[verify] ❌ 頁面未顯示 discount_applied 稽核記錄");
    process.exit(1);
  }

  console.log("[verify] ✅ 售後稽核日誌頁面正常渲染，audit_log 資料已顯示");

  // 清除測試資料
  console.log("[verify] 清除測試 audit_log 資料...");
  await svc.from("audit_logs").delete().eq("id", rows[0].id);
  console.log("[verify] ✅ 測試資料已清除");
  process.exit(0);
}

main().catch((e) => {
  console.error("[verify] 例外:", e);
  process.exit(1);
});
