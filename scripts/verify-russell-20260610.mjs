#!/usr/bin/env node
/**
 * 手動驗證 — Russell 20260610 批次（B-19/B-21/B-22/B-23/B-24）
 * 本機 dev (localhost:3000，連正式 Supabase) + admin 測試帳號 + Indian scope。
 * 逐頁截圖到 /tmp/verify-russell/ 並印出每項檢查結果。
 */
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE = path.join(__dirname, ".pw-state.json");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const SHOT = "/tmp/verify-russell";
fs.mkdirSync(SHOT, { recursive: true });

const results = [];
const ok = (id, msg) => { results.push(`✅ ${id}  ${msg}`); console.log(`✅ ${id}  ${msg}`); };
const bad = (id, msg) => { results.push(`❌ ${id}  ${msg}`); console.log(`❌ ${id}  ${msg}`); };
const info = (id, msg) => { results.push(`ℹ️  ${id}  ${msg}`); console.log(`ℹ️  ${id}  ${msg}`); };

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ storageState: STATE });
// 設 Indian brand scope（dev 資料都在 indian）
await ctx.addCookies([{
  name: "dealeros_scope",
  value: encodeURIComponent(JSON.stringify({ brand_id: "indian" })),
  domain: "localhost", path: "/",
}]);
const p = await ctx.newPage();
const go = async (route) => {
  await p.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45000 });
  await p.waitForTimeout(1200);
};
const shot = (name) => p.screenshot({ path: path.join(SHOT, `${name}.png`), fullPage: true });

try {
  // ───── B-22：費率設定 Tab B，debug 文字應消失 ─────
  await go("/parts/aftersales/management/service-packages");
  // 點 Tab B（工時費率）
  const tabB = p.locator('button:has-text("工時費率"), button:has-text("費率")').first();
  if (await tabB.count()) { await tabB.click(); await p.waitForTimeout(600); }
  await shot("B22-rate-tabB");
  const body = await p.locator("body").innerText();
  if (body.includes("scope brand") || body.includes("雙品牌各一套")) bad("B-22", "debug 文字仍存在");
  else ok("B-22", "debug 文字已移除（無「scope brand / 雙品牌各一套」）");
  if (body.includes("均記錄於稽核日誌") || body.includes("稽核日誌")) ok("B-22", "保留稽核日誌說明文案");

  // ───── B-21：工單查詢 快篩 + walk-in ─────
  await go("/parts/aftersales/ro-search");
  await shot("B21-ro-search");
  const myBtn = p.locator('[data-testid=my-today-btn]');
  if (await myBtn.count()) ok("B-21", "「今日我的工單」快篩按鈕存在");
  else bad("B-21", "缺今日我的工單按鈕");
  if (await p.locator('button:has-text("進行中")').count()) ok("B-21", "「進行中」快篩存在");
  if (await p.locator('button:has-text("今日全部")').count()) ok("B-21", "「今日全部」快篩存在");
  const walkin = await p.locator('[data-testid=walkin-badge]').count();
  info("B-21", `walk-in 標籤目前畫面出現 ${walkin} 個（無臨時進廠工單則 0，屬正常）`);
  // 點今日我的工單，看 URL 有沒有帶 date + sa
  if (await myBtn.count() && await myBtn.isEnabled()) {
    await myBtn.click(); await p.waitForTimeout(1500);
    const u = p.url();
    if (/date_from=/.test(u)) ok("B-21", `今日我的工單→URL 帶日期區間：${u.replace(BASE, "")}`);
    else info("B-21", `點擊後 URL=${u.replace(BASE, "")}`);
    await shot("B21-my-today-applied");
  } else {
    info("B-21", "今日我的工單按鈕為 disabled（此帳號未對應 employees → 預期行為）");
  }

  // ───── B-19：派工看板 待派工橫幅 ─────
  await go("/parts/aftersales/management/dispatch");
  await shot("B19-dispatch");
  const banner = await p.locator('[data-testid=pending-dispatch-banner]').count();
  if (banner) {
    const t = await p.locator('[data-testid=pending-dispatch-banner]').innerText();
    ok("B-19", `待派工通知橫幅出現：「${t.split("\n")[0].trim()}」`);
  } else {
    info("B-19", "目前無 status=進行中 的待派工工單 → 橫幅不顯示（屬正常，需有新工單才出現）");
  }

  // ───── B-24：增項閉環 Tab3 圓餅圖 + SA 轉化率 ─────
  await go("/parts/aftersales/followups");
  const statsTab = p.locator('button:has-text("整店統計")').first();
  if (await statsTab.count()) { await statsTab.click(); await p.waitForTimeout(900); }
  await shot("B24-followups-stats");
  const pie = await p.locator('[data-testid=rejection-pie-chart]').count();
  const pieEmpty = (await p.locator("body").innerText()).includes("尚無拒絕原因資料");
  if (pie) ok("B-24", "拒絕原因圓餅圖已渲染（有資料）");
  else if (pieEmpty) ok("B-24", "拒絕原因區塊存在（目前無結構化拒絕資料 → 顯示空狀態，正常）");
  else bad("B-24", "找不到拒絕原因圓餅圖區塊");
  const conv = await p.locator('[data-testid=sa-conversion-table]').count();
  if (conv) ok("B-24", "SA 個人增項轉化率看板存在");
  else bad("B-24", "缺 SA 轉化率看板");

  // ───── B-23：增項拒絕原因 Modal ─────
  await go("/parts/aftersales/addons");
  await shot("B23-addons-list");
  const decideBtn = p.locator('button:has-text("決策")').first();
  if (await decideBtn.count()) {
    await decideBtn.click(); await p.waitForTimeout(800);
    // 選「拒絕」
    const rejectRadio = p.locator('button:has-text("拒絕")').first();
    if (await rejectRadio.count()) { await rejectRadio.click(); await p.waitForTimeout(500); }
    await shot("B23-reject-modal");
    const modal = await p.locator('[data-testid=rejection-modal]').count();
    if (modal) ok("B-23", "選「拒絕」後出現結構化原因區塊");
    else bad("B-23", "選拒絕後沒有原因區塊");
    const reasons = await p.locator('[data-testid^=reason-]').count();
    if (reasons === 5) ok("B-23", "五個固定拒絕原因標籤齊全");
    else bad("B-23", `拒絕原因標籤數量=${reasons}（應為 5）`);
    const confirm = p.locator('[data-testid=confirm-reject-btn]');
    const disabledBefore = await confirm.isDisabled();
    if (disabledBefore) ok("B-23", "未選原因時送出鈕為 disabled（必填擋住）");
    else bad("B-23", "未選原因送出鈕竟可點");
    // 選一個原因 → 應變可點
    await p.locator('[data-testid=reason-price]').click(); await p.waitForTimeout(300);
    const disabledAfter = await confirm.isDisabled();
    if (!disabledAfter) ok("B-23", "選原因後送出鈕啟用");
    else bad("B-23", "選原因後送出鈕仍 disabled");
    await shot("B23-reason-picked");
  } else {
    info("B-23", "目前 Indian 無『待確認』增項可開決策 Modal → 無法跑互動驗證（需有 pending addon）");
  }
} catch (e) {
  bad("FATAL", e.message);
  await shot("FATAL");
} finally {
  console.log("\n===== 驗證總結 =====");
  for (const r of results) console.log(r);
  console.log(`\n截圖目錄：${SHOT}`);
  await b.close();
}
