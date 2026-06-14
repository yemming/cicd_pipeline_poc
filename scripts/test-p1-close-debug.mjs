/**
 * P1 關單連鎖 debug 腳本
 * 目的：找出為何 Playwright 點「確認關單」後 RO status 沒有更新
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

const envRaw = readFileSync(resolve(process.cwd(), ".env.local"), "utf-8");
const env = Object.fromEntries(
  envRaw.split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const idx = l.indexOf("="); return [l.slice(0, idx).trim(), l.slice(idx+1).trim().replace(/^["']|["']$/g,"")]; })
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const BASE = "http://localhost:3100";
const EMAIL = "yemming.yu@gmail.com";
const PW = "yemming.yu@gmail.com";

const browser = await chromium.launch({ headless: false }); // headful for debug
const ctx = await browser.newContext();
const page = await ctx.newPage();

// 捕捉 console errors
page.on("console", msg => {
  if (msg.type() === "error") console.log(`[browser console error] ${msg.text()}`);
});
page.on("response", async res => {
  if (res.url().includes("_next/data") || res.url().includes("rpc") || res.status() >= 400) {
    console.log(`[network] ${res.status()} ${res.url().slice(0, 100)}`);
  }
});

// 1. 建測試 RO（待結帳）+ checkout（paid）
const { data: customer } = await sb.from("customers").select("id").eq("brand_id","indian").limit(1);
const cust = customer[0];

const ts = Date.now();
const { data: ro } = await sb.from("repair_orders").insert({
  brand_id: "indian", ro_code: `MN-CP-DEBUG-${ts}`,
  prefix_p1: "MN", prefix_p2: "CP",
  issue_date: new Date().toISOString().slice(0,10),
  sequence_no: ts % 99000, customer_id: cust.id,
  status: "待結帳", priority: "normal",
  opened_at: new Date().toISOString(), fee_allocation: "customer",
  metadata: { _test: true },
}).select("id, ro_code").single();
console.log(`建測試 RO：${ro.ro_code} (${ro.id})`);

const now = new Date().toISOString();
const { data: ck } = await sb.from("ro_checkouts").insert({
  brand_id: "indian", repair_order_id: ro.id,
  checkout_no: `CK-DEBUG-${ts}`, status: "paid",
  fee_summary: { payable: 0, lines: [], discount_pct: 0, customer_no_dispute: true },
  customer_signature: { signature_text: "test-sig", signed_at: now },
  payment: { method: "cash", paid_at: now, amount: 0 },
  invoice: { kind: "personal", invoice_no: "EI-DEBUG", issued_at: now },
  fees_confirmed_at: now,
}).select("id, checkout_no").single();
console.log(`建結帳單：${ck.checkout_no} (${ck.id})`);

try {
  // 2. 登入
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PW);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(parts|workspace|admin|feedback|dashboard)/, { timeout: 20000 });
  console.log(`登入成功，URL: ${page.url()}`);

  // 設 Indian scope
  await ctx.addCookies([{
    name: "dealeros_scope",
    value: JSON.stringify({ brand_id: "indian", store_id: null }),
    domain: "localhost", path: "/", httpOnly: false, secure: false,
  }]);
  console.log("設定 Indian scope cookie");

  // 3. 開結帳頁
  const url = `${BASE}/parts/aftersales/checkout/${ck.id}`;
  console.log(`導航到：${url}`);
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  await new Promise(r => setTimeout(r, 2000));

  // 4. 列出所有按鈕
  const btns = await page.locator("button").all();
  console.log(`\n頁面按鈕（共 ${btns.length} 個）：`);
  for (const btn of btns) {
    const text = await btn.innerText().catch(() => "");
    const disabled = await btn.isDisabled();
    const visible = await btn.isVisible();
    if (text.trim()) console.log(`  "${text.trim()}" disabled=${disabled} visible=${visible}`);
  }

  // 5. 找精確的「確認關單」按鈕
  const closeBtn = page.locator("button").filter({ hasText: /確認關單/ });
  const closeBtnCount = await closeBtn.count();
  console.log(`\n精確匹配「確認關單」按鈕：${closeBtnCount} 個`);

  if (closeBtnCount > 0) {
    const isDisabled = await closeBtn.first().isDisabled();
    console.log(`按鈕 disabled = ${isDisabled}`);

    if (!isDisabled) {
      console.log("點擊確認關單...");
      await closeBtn.first().click();
      await new Promise(r => setTimeout(r, 5000));

      // 看 banner 文字
      const bannerText = await page.evaluate(() => {
        const fixed = document.querySelectorAll('[class*="fixed"]');
        return Array.from(fixed).map(el => el.textContent?.trim()).filter(Boolean).join(" | ");
      });
      console.log(`Banner 文字：${bannerText || "(無)"}`);

      // 看頁面 URL（可能 redirect）
      console.log(`點後 URL：${page.url()}`);
    } else {
      console.log("按鈕被 disabled 了！查詢原因...");
      // 輸出 fenced 邏輯依據：data.status 與 canEdit
      const pageSource = await page.content();
      const hasCompleted = pageSource.includes("completed");
      const hasPaid = pageSource.includes('"paid"') || pageSource.includes("paid");
      console.log(`  頁面 HTML 含 "completed": ${hasCompleted}`);
      console.log(`  頁面 HTML 含 "paid": ${hasPaid}`);
    }
  }

  // 6. DB 最終驗證
  await new Promise(r => setTimeout(r, 3000));
  const { data: roFinal } = await sb.from("repair_orders").select("status, closed_at").eq("id", ro.id).single();
  const { data: ckFinal } = await sb.from("ro_checkouts").select("status").eq("id", ck.id).single();
  console.log(`\n最終 RO status：${roFinal?.status}`);
  console.log(`最終 checkout status：${ckFinal?.status}`);

} finally {
  await browser.close();
  // 清理
  await sb.from("ro_checkouts").delete().eq("id", ck.id);
  await sb.from("repair_orders").delete().eq("id", ro.id);
  console.log("清理完成");
}
