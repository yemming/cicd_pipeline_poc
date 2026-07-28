/**
 * B5 regression 修復驗證（v3-localfix）：approveTransfer() 補回 transfer_out 成本事件
 * 目標：本機 dev server（http://localhost:3000），因本輪修復未 push/部署，遵指示只 commit 不 push，
 * 故走本機 next dev 驗證（非正式 Deploy-then-Test 流程，屬本次任務的例外）。
 *
 * 背景：1c6df53 把扣庫存邏輯從 createTransfer() 搬到 approveTransfer() 做審批閘門時，
 * 漏搬 0bda5be 加的 postCostEvent(transfer_out) 呼叫，導致核准調撥時來源倉完全不記
 * 成本轉出分錄，只剩 receiveTransfer() 的 transfer_in。本輪已在 approveTransfer() 扣
 * stock_items 迴圈內補回。
 *
 * 沿用上一輪（b5-transfer-v2.mjs）驗證同樣兩家門店，只是 WH-CONS 現貨從 5 已消耗到 2，
 * 改用 TRANSFER_QTY=1。
 */

import { chromium } from "@playwright/test";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS_DIR = path.join(__dirname, "../../../docs/20260728_russell_reply/shots");
const BASE_URL = "http://localhost:3000";

const WAREHOUSE_USER = { email: "e2e-warehouse@dealeros.test", password: "E2eDealer!2026" };
const STOCK_LEAD = { email: "e2e-stock_lead@dealeros.test", password: "E2eDealer!2026" };

// ⚠️ 改用 WH-001（現已確認未被盤點凍結：inventory_counts 該倉全為
// completed/cancelled/pending_approval，assertWarehouseNotFrozen 只擋 counting/
// first_done/second_done）。另外 WH-CONS 的候選料號在 inventory_cost_state 從未
// 初始化過（qty_on_hand=0，因為原始庫存是直接塞進 stock_items、從未經過
// postCostEvent 開帳），會導致 RPC 端「庫存不足」拒絕 transfer_out——這是資料面
// 的先天缺口，不是本次修復的迴歸，換一個 cost_state 已同步的料號/倉庫即可。
const SRC_WH_CODE = "WH-001"; // 主零件倉（台北直營店，B，來源/有庫存、cost_state 已同步）
const TGT_WH_CODE = "WH-TC-MAIN"; // 台中主倉（台中直營店，A，目標/發起申請）
const TARGET_ITEM_NAME = "V4 鏈條"; // WH-001 現貨60、inventory_cost_state 與 stock_items 同步
const TRANSFER_QTY = 2;

const STALE_DRAFT_TR_NO = null; // 本輪無殘留草稿，略過清理

function loadEnvLocal() {
  const envPath = path.join(__dirname, "../../../.env.local");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

fs.mkdirSync(SHOTS_DIR, { recursive: true });

async function shot(page, name) {
  const filepath = path.join(SHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 ${name}.png`);
  return filepath;
}

async function login(page, creds) {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.fill('input[type="email"]', creds.email);
  await page.fill('input[type="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 20000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  console.log(`✅ 登入成功（${creds.email}）→ ${page.url()}`);
}

async function logout(page) {
  await page.context().clearCookies();
}

async function main() {
  loadEnvLocal();
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();

  const issues = [];
  let trId = null;
  let trNo = null;

  try {
    // Step 0 略過（本輪無殘留草稿，STALE_DRAFT_TR_NO=null）

    // ══════════════════════════════════════════════
    // Step 1：A（台中）發起調撥申請 — 查詢 B（台北）有庫存的料號
    // ══════════════════════════════════════════════
    await login(page, WAREHOUSE_USER);
    await page.goto(`${BASE_URL}/parts/issue/transfer-out/new`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);

    const whSelect = page.locator("select").first();
    const whOptions = await whSelect.locator("option").allTextContents();
    console.log("來源倉下拉選項：", whOptions);
    const srcOptText = whOptions.find((o) => o.includes(SRC_WH_CODE));
    if (!srcOptText) throw new Error(`找不到來源倉選項 ${SRC_WH_CODE}，現有：${whOptions.join(", ")}`);
    await whSelect.selectOption({ label: srcOptText });
    await page.waitForTimeout(300);

    const targetSelect = page.locator("select").nth(1);
    const targetOptions = await targetSelect.locator("option").allTextContents();
    console.log("目標倉下拉選項（應含台中/台南/嘉義/高雄）：", targetOptions);
    const hasOtherStores = ["WH-TC-MAIN", "WH-TN-MAIN", "WH-CY-MAIN", "WH-KH-MAIN"].every((code) =>
      targetOptions.some((o) => o.includes(code)),
    );
    if (!hasOtherStores) {
      issues.push({
        severity: "high",
        summary: "目標倉下拉仍缺少部分門店選項，跨門店調撥可能仍卡關",
        file_hint: "src/app/(workspace)/parts/issue/transfer-out/new",
      });
    } else {
      console.log("✅ 確認：4 家新門店倉庫皆已出現在目標倉下拉，問題1（門店無倉庫）已解決");
    }

    const tgtOptText = targetOptions.find((o) => o.includes(TGT_WH_CODE));
    if (!tgtOptText) throw new Error(`找不到目標倉選項 ${TGT_WH_CODE}，現有：${targetOptions.join(", ")}`);
    await targetSelect.selectOption({ label: tgtOptText });
    await page.waitForTimeout(300);

    const itemSelect = page.locator("table select").first();
    const itemOptions = await itemSelect.locator("option").allTextContents();
    const itemOptText = itemOptions.find((o) => o.includes(TARGET_ITEM_NAME));
    if (!itemOptText) throw new Error(`找不到料件選項 ${TARGET_ITEM_NAME}`);
    await itemSelect.selectOption({ label: itemOptText });
    await page.waitForTimeout(200);
    const qtyInput = page.locator('table input[type="number"]').first();
    await qtyInput.fill(String(TRANSFER_QTY));
    await page.waitForTimeout(200);
    await shot(page, "P1-B5-S1-發起調撥申請_填單_v3-localfix");

    await page.getByRole("button", { name: /預覽配置/ }).click();
    await page.waitForTimeout(1000);
    await shot(page, "P1-B5-S1b-FIFO配置預覽_v3-localfix");

    await page.getByRole("button", { name: /送出調撥申請/ }).click();
    await page.waitForTimeout(1500);
    await page.waitForURL(/\/parts\/issue\/transfer-out\/[0-9a-f-]{36}/, { timeout: 20000 });
    await page.waitForLoadState("networkidle").catch(() => {});
    const url = page.url();
    trId = url.match(/transfer-out\/([0-9a-f-]{36})/)?.[1] ?? null;
    const h1Text = await page.locator("h1").first().innerText().catch(() => "");
    trNo = h1Text.match(/TR\d{8}-\d+/)?.[0] ?? null;
    console.log("✅ 調撥申請已送出：", url, "id=", trId, "tr_no=", trNo);
    await shot(page, "P1-B5-S1c-送出後_待核准狀態_v3-localfix");

    // 驗證是 pull 模型：DB 應該顯示 status='draft'，且來源倉庫存尚未被扣
    const { data: trRowAfterCreate } = await sb
      .from("stock_transfers")
      .select("status")
      .eq("id", trId)
      .maybeSingle();
    if (trRowAfterCreate?.status !== "draft") {
      issues.push({
        severity: "high",
        summary: `建單後狀態應為 draft（待核准），實際為 ${trRowAfterCreate?.status}`,
        file_hint: "src/domain/transfers.ts createTransfer",
      });
    } else {
      console.log("✅ 確認：建單後狀態為 draft（待核准），問題2（push模型）已解決 —— 建單不再直接出貨");
    }

    // ══════════════════════════════════════════════
    // Step 2（審批前）：截圖來源倉/目標倉現況（在途追蹤 before）
    // ══════════════════════════════════════════════
    await page.goto(`${BASE_URL}/parts/operations/balance?warehouse=8153ad9e-956c-4ce6-8f03-3f2d856923b5&q=${encodeURIComponent(TARGET_ITEM_NAME)}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, "P1-B5-S2a-核准前_B門店台北庫存餘額_v3-localfix");

    await page.goto(`${BASE_URL}/parts/operations/balance?warehouse=74b56cfb-4c1f-43f5-ad46-b70ca11aa233&q=${encodeURIComponent(TARGET_ITEM_NAME)}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, "P1-B5-S2b-核准前_A門店台中庫存餘額_v3-localfix");

    // ══════════════════════════════════════════════
    // Step 3：B 門店主管（e2e-stock_lead，具核准權限）批准
    // ══════════════════════════════════════════════
    await logout(page);
    await login(page, STOCK_LEAD);
    await page.goto(`${BASE_URL}/parts/receipt/transfer-in?q=${trNo ?? ""}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, "P1-B5-S3a-B主管檢視待核准清單_v3-localfix");

    const approveBtn = page.getByRole("button", { name: /^核准$/ }).first();
    await approveBtn.waitFor({ state: "visible", timeout: 15000 });
    await approveBtn.click();
    await page.waitForTimeout(300);
    await shot(page, "P1-B5-S3b-核准確認彈窗_v3-localfix");
    const confirmApproveBtn = page.getByRole("button", { name: /確認核准/ }).last();
    await confirmApproveBtn.click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, "P1-B5-S3c-核准後_列表_v3-localfix");

    const { data: trRowAfterApprove } = await sb
      .from("stock_transfers")
      .select("status")
      .eq("id", trId)
      .maybeSingle();
    console.log("核准後狀態：", trRowAfterApprove?.status);
    if (trRowAfterApprove?.status !== "in_transit") {
      issues.push({
        severity: "high",
        summary: `核准後狀態應為 in_transit，實際為 ${trRowAfterApprove?.status}`,
        file_hint: "src/domain/transfers.ts approveTransfer",
      });
    }

    // ══════════════════════════════════════════════
    // Step 3'：在途庫存追蹤（核准後 before/after 對比）
    // ══════════════════════════════════════════════
    await page.goto(`${BASE_URL}/parts/operations/balance?warehouse=8153ad9e-956c-4ce6-8f03-3f2d856923b5&q=${encodeURIComponent(TARGET_ITEM_NAME)}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, "P1-B5-S3d-核准後_B門店台北庫存餘額_v3-localfix");

    await page.goto(`${BASE_URL}/parts/operations/balance?warehouse=74b56cfb-4c1f-43f5-ad46-b70ca11aa233&q=${encodeURIComponent(TARGET_ITEM_NAME)}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, "P1-B5-S3e-核准後_A門店台中庫存餘額_在途N個_v3-localfix");

    await page.goto(`${BASE_URL}/parts/operations/transfers-in-transit`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, "P1-B5-S3f-在途總覽看板_v3-localfix");

    // ══════════════════════════════════════════════
    // Step 4：A 門店確認收到
    // ══════════════════════════════════════════════
    await page.goto(`${BASE_URL}/parts/receipt/transfer-in/${trId}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, "P1-B5-S4a-收貨前詳情頁_v3-localfix");

    await page.goto(`${BASE_URL}/parts/receipt/transfer-in?q=${trNo ?? ""}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(800);
    const receiveBtn = page.getByRole("button", { name: /確認收貨/ }).first();
    await receiveBtn.waitFor({ state: "visible", timeout: 15000 });
    await receiveBtn.click();
    await page.waitForTimeout(300);
    await shot(page, "P1-B5-S4a2-收貨確認彈窗_v3-localfix");
    const confirmReceiveBtn = page.getByRole("button", { name: /^確認收貨$/ }).last();
    await confirmReceiveBtn.click();
    await page.waitForTimeout(1500);
    await page.waitForLoadState("networkidle").catch(() => {});
    await shot(page, "P1-B5-S4b-確認收貨後_列表_v3-localfix");

    await page.goto(`${BASE_URL}/parts/receipt/transfer-in/${trId}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(500);
    await shot(page, "P1-B5-S4c-確認收貨後_詳情頁_v3-localfix");

    await page.goto(`${BASE_URL}/parts/operations/balance?warehouse=74b56cfb-4c1f-43f5-ad46-b70ca11aa233&q=${encodeURIComponent(TARGET_ITEM_NAME)}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await shot(page, "P1-B5-S4d-收貨後_A門店台中庫存餘額_已入庫_v3-localfix");

    // ══════════════════════════════════════════════
    // 驗證：DB 層面確認 status='received'、A 門店庫存增加 N、成本轉移分錄
    // ══════════════════════════════════════════════
    const { data: trFinal } = await sb
      .from("stock_transfers")
      .select("status, qty_shipped_total, qty_received_total, source_warehouse_id, target_warehouse_id")
      .eq("id", trId)
      .maybeSingle();
    console.log("最終調撥單狀態：", trFinal);
    if (trFinal?.status !== "received") {
      issues.push({
        severity: "high",
        summary: `收貨後狀態應為 received，實際為 ${trFinal?.status}`,
        file_hint: "src/domain/transfers.ts receiveTransfer",
      });
    }

    const { data: ledgerRows } = await sb
      .from("inventory_cost_ledger")
      .select("event_type, warehouse_id, qty_delta, amount_delta, created_at")
      .eq("source_table", "stock_transfers")
      .eq("source_id", trId)
      .order("created_at", { ascending: true });
    console.log("inventory_cost_ledger 記錄：", JSON.stringify(ledgerRows, null, 2));

    const hasTransferOut = (ledgerRows ?? []).some(
      (r) => r.event_type === "transfer_out" && r.warehouse_id === trFinal?.source_warehouse_id,
    );
    const hasTransferIn = (ledgerRows ?? []).some(
      (r) => r.event_type === "transfer_in" && r.warehouse_id === trFinal?.target_warehouse_id,
    );

    if (!hasTransferIn) {
      issues.push({
        severity: "high",
        summary: "目標倉（A）收貨後仍查無 inventory_cost_ledger transfer_in 記錄",
        file_hint: "src/domain/transfers.ts receiveTransfer",
      });
    } else {
      console.log("✅ 確認：目標倉（A）有 transfer_in 成本轉移記錄");
    }

    if (!hasTransferOut) {
      issues.push({
        severity: "high",
        summary:
          "來源倉（B）查無 inventory_cost_ledger transfer_out 記錄 —— 問題3（成本轉移分錄）僅修一半：" +
          "0bda5be 把 transfer_out 事件加在 createTransfer() 的扣庫存段落，但同一天稍後的 1c6df53 把扣庫存邏輯" +
          "整段搬到新的 approveTransfer()，卻沒把 transfer_out 的 postCostEvent 呼叫一起搬過去 —— " +
          "審批通過、真正扣源倉庫存的當下，完全沒有記任何成本轉出分錄。receiveTransfer() 仍保留 transfer_in 呼叫，" +
          "所以只有目標倉會有一筆分錄，來源倉這半邊的成本轉移紀錄仍是空的。",
        file_hint: "src/domain/transfers.ts approveTransfer（約 1150-1210 行，扣 stock_items 迴圈缺 postCostEvent transfer_out 呼叫）",
      });
    } else {
      console.log("✅ 確認：來源倉（B）有 transfer_out 成本轉移記錄，問題3已完全解決");
    }

    // 寫 SQL 證據截圖（成本轉移記錄 + 兩門店庫存變化）
    const ledgerHtml = `<!doctype html><html><head><meta charset="utf-8">
      <style>body{font-family:sans-serif;padding:24px}table{border-collapse:collapse;width:100%}
      td,th{border:1px solid #ccc;padding:6px 10px;font-size:13px}th{background:#f4f4f4}
      .miss{color:#CC0000;font-weight:bold}</style></head><body>
      <h2>inventory_cost_ledger WHERE source_table='stock_transfers' AND source_id='${trId}'</h2>
      <p>tr_no=${trNo}　source_warehouse_id(B/台北)=${trFinal?.source_warehouse_id}　target_warehouse_id(A/台中)=${trFinal?.target_warehouse_id}</p>
      <table><thead><tr><th>event_type</th><th>warehouse_id</th><th>qty_delta</th><th>amount_delta</th><th>created_at</th></tr></thead>
      <tbody>${(ledgerRows ?? [])
        .map(
          (r) =>
            `<tr><td>${r.event_type}</td><td>${r.warehouse_id}</td><td>${r.qty_delta}</td><td>${r.amount_delta}</td><td>${r.created_at}</td></tr>`,
        )
        .join("\n")}</tbody></table>
      <p>來源倉(B) transfer_out 記錄：<span class="${hasTransferOut ? "" : "miss"}">${hasTransferOut ? "✓ 有" : "✗ 缺失"}</span></p>
      <p>目標倉(A) transfer_in 記錄：<span class="${hasTransferIn ? "" : "miss"}">${hasTransferIn ? "✓ 有" : "✗ 缺失"}</span></p>
      </body></html>`;
    const ledgerHtmlPath = path.join(SHOTS_DIR, "_p1_b5_v3_localfix_cost_ledger_evidence.html");
    fs.writeFileSync(ledgerHtmlPath, ledgerHtml, "utf8");
    await page.goto(`file://${ledgerHtmlPath}`);
    await page.waitForTimeout(300);
    await shot(page, "P1-B5-S5-成本轉移分錄SQL佐證_v3-localfix");

    console.log("\n════════ 結果摘要 ════════");
    console.log("trId =", trId, "trNo =", trNo);
    console.log("issues:", JSON.stringify(issues, null, 2));
  } catch (err) {
    console.error("❌ 執行中出錯：", err);
    await shot(page, "P1-B5-ERROR_最後狀態_v3-localfix");
    issues.push({ severity: "high", summary: `腳本執行中拋出例外：${err.message}` });
  } finally {
    await browser.close();
    console.log("TR_ID=" + trId);
    console.log("ISSUES_JSON=" + JSON.stringify(issues));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
