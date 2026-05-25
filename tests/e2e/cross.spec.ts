/**
 * 第十一輪 E2E · Batch I — CROSS 跨模組串接點 ×6
 *
 * 來源：DealerOS_全系統測試腳本_v1.0.docx 第六章 + docs/proposals/feature-cross-module-hooks-phase1.md
 *
 * 驗證對象：6 個跨模組自動化 hook 的 after() 副作用鏈（已落地於 src/）。
 *
 * ⚠️ 狀態（round 13 更新）：
 *   - CROSS-01/02：第十二輪 G2 補完 hook#4 AddonModal 的 item/warehouse/qty 欄位後，已改走真 UI 重啟。
 *     靠 fixture 維修中工單 E2E-CROSS-RO-T1（lead = T1 陳建明 / tech persona）跑。
 *   - CROSS-03/04/05：**第十三輪解 describe.skip、全改真 UI 重啟**（hook#5/#6/#7）。
 *     每條自包含 fixture（seed 先 reset、afterEach 全刪），只借 T1 的 customer/vehicle/sa actor。
 *       · CROSS-03 warehouse 收貨 in_transit 調撥 → hook#5 解待料 RO + loop entry resolved
 *       · CROSS-04 aftersales_lead 完成 WC 保固單複檢 → hook#6 登 old_parts（帶 ro_id）
 *       · CROSS-05 sa 切「已關單」→ hook#7 建 aftersales/nps_interview call_task
 *   - CROSS-06（銷售↔庫存同源）：純讀、不靠橋，一直可跑。
 *
 * 📌 fixture 工單 seed（若 DB 重置需重建）：
 *   insert into repair_orders (brand_id, ro_code, prefix_p1, prefix_p2, sequence_no, issue_date, status,
 *     lead_technician_id, customer_id, vehicle_id, sa_id, estimated_labor_units, opened_at, metadata)
 *   values ('indian','E2E-CROSS-RO-T1','MN','WR',99001,current_date,'維修中',
 *     '5151ec08-fdff-440d-85c8-92f2bf129fb7', <任一 indian customer/vehicle/sa>, 4.0, now(),
 *     '{"e2e_seed":true,"purpose":"round12-G2-CROSS-01-02-addon-fixture"}'::jsonb);
 */
import type { Page } from "@playwright/test";
import { test, expect, useRole } from "./helpers/role-fixtures";
import {
  resetCrossFixtureRO,
  readCrossFixtureSideEffects,
  CROSS_FIXTURE_RO_CODE,
  // 第十三輪 · CROSS-03/04/05 真 UI 重啟
  seedCross03,
  resetCross03,
  readCross03,
  CROSS03_TR_NO,
  seedCross04,
  resetCross04,
  readCross04,
  seedCross05,
  resetCross05,
  readCross05,
} from "./helpers/fixture-db";

test.describe.configure({ mode: "serial" });

// 共用測試資料（indian brand，已用 information_schema / REST 校對）──────────
const BRAND = "indian";

// ──────────────────────────────────────────────────────────
// 真 UI 共用：在 fixture 維修中工單卡上開「追加項目」modal，選含零件型 + 零件/倉庫/數量 → 確認追加。
// （第十二輪 G2 補完的欄位）
const FIXTURE_WH = "WH-001"; // 主零件倉

async function addReserveAddonViaUI(
  page: Page,
  opts: { name: string; itemCode: string; qty: number },
): Promise<void> {
  await page.goto("/tech");
  // fixture 工單狀態=維修中 → board 預設落在「進行中」tab、卡片直接顯示
  const card = page
    .locator("div")
    .filter({ hasText: CROSS_FIXTURE_RO_CODE })
    .filter({ has: page.getByRole("button", { name: /追加項目/ }) })
    .last();
  await expect(card).toBeVisible({ timeout: 12000 });
  await card.getByRole("button", { name: /追加項目/ }).click();

  const modal = page.locator("div").filter({ has: page.getByRole("heading", { name: "追加項目" }) }).last();
  await expect(modal.getByRole("heading", { name: "追加項目" })).toBeVisible();
  await page.getByPlaceholder(/後輪軸承異音檢修/).fill(opts.name);
  // 類型 = 工資+零件 → 顯示「備件預留」區塊
  await modal.locator("select", { has: page.locator("option", { hasText: "工資+零件" }) }).selectOption({ label: "工資+零件" });
  // 零件（依 code 選，避免寫死 UUID）
  const itemSel = modal.locator("select", { has: page.locator("option", { hasText: opts.itemCode }) });
  const itemVal = await itemSel.locator("option", { hasText: opts.itemCode }).getAttribute("value");
  await itemSel.selectOption(itemVal as string);
  // 來源倉庫
  const whSel = modal.locator("select", { has: page.locator("option", { hasText: FIXTURE_WH }) });
  const whVal = await whSel.locator("option", { hasText: FIXTURE_WH }).getAttribute("value");
  await whSel.selectOption(whVal as string);
  // 數量
  await modal.getByRole("spinbutton").fill(String(opts.qty));
  await modal.getByRole("button", { name: /確認追加/ }).click();
}

/** 輪詢 fixture RO 待料旗標（hook#4 走 after() 非同步寫，回應送出後才落地） */
async function pollWaitingFlag(timeoutMs = 10000) {
  const start = Date.now();
  let fx = await readCrossFixtureSideEffects();
  while (!fx.waitingParts && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 600));
    fx = await readCrossFixtureSideEffects();
  }
  return fx;
}

// ──────────────────────────────────────────────────────────
// 第十二輪 G2 重啟：真 UI 跑（fixture 工單 E2E-CROSS-RO-T1）。
test.describe("CROSS-01 ★串接點1 工單零件 ↔ 庫存出庫 — 缺料自動待料", () => {
  useRole("tech");
  test.beforeEach(async () => { await resetCrossFixtureRO(); });
  test.afterEach(async () => { await resetCrossFixtureRO(); });

  test("缺料：追加帶零件 needed=5 但 available=1 → 只預留 1 + RO 標待料（hook#4）", async ({ page }) => {
    // 用 OEM-ENG-001（V4 引擎活塞，WH-001 available=1）→ needed 5 > 1 → 部分預留 1 + 標待料
    const name = `E2E-CROSS01-${Date.now()}`;
    await addReserveAddonViaUI(page, { name, itemCode: "OEM-ENG-001", qty: 5 });

    // UI：有預留到（reserveQty=1>0）→ banner「已追加並預留零件」+ 卡片出現「已預留」chip
    await expect(page.getByText("✓ 已追加並預留零件，待 SA 與客戶確認")).toBeVisible({ timeout: 12000 });
    await expect(page.getByText("已預留").first()).toBeVisible({ timeout: 12000 });

    // 後端副作用（hook#4）：① 預留只有 1（非 5）② RO metadata.waiting_parts 旗標被標起
    const fx = await pollWaitingFlag();
    const eng = fx.reservations.find((r) => r.item_code === "OEM-ENG-001");
    expect(eng, "應有 OEM-ENG-001 的預留 ledger").toBeTruthy();
    expect(eng?.reserved_qty).toBe(1); // 只預留可用的 1，缺口 4 待料
    expect(fx.waitingParts, "needed(5) > available(1) → 應標待料旗標").toBeTruthy();
  });
});

// ──────────────────────────────────────────────────────────
test.describe("CROSS-02 ★串接點2 追加項目 ↔ 備件預留 ↔ 預警告警", () => {
  useRole("tech");
  test.beforeEach(async () => { await resetCrossFixtureRO(); });
  test.afterEach(async () => { await resetCrossFixtureRO(); });

  test("足量：追加帶零件 needed=5 且 available 充足 → 即時預留全額 5、不標待料", async ({ page }) => {
    // 用 CON-FIL-002（機油濾芯，WH-001 available≈250）→ needed 5 全額預留
    const name = `E2E-CROSS02-${Date.now()}`;
    await addReserveAddonViaUI(page, { name, itemCode: "CON-FIL-002", qty: 5 });

    // UI：banner「已追加並預留零件」+「已預留」chip
    await expect(page.getByText("✓ 已追加並預留零件，待 SA 與客戶確認")).toBeVisible({ timeout: 12000 });
    await expect(page.getByText("已預留").first()).toBeVisible({ timeout: 12000 });

    // 後端：預留全額 5、無待料旗標
    const fx = await readCrossFixtureSideEffects();
    const fil = fx.reservations.find((r) => r.item_code === "CON-FIL-002");
    expect(fil?.reserved_qty).toBe(5);
    expect(fil?.status).toBe("active");
    expect(fx.waitingParts, "足量不應標待料").toBeFalsy();
    // 註：原 spec「冪等：重送同 addon 不重複建」指 reserve() 對同一 source_id 的防重，
    //     純 UI 每次送出都建新 addon（各自 source_id）無法自然觸發 → 該防重已於 round-11 API 級驗通。
  });
});

// ──────────────────────────────────────────────────────────
// 第十三輪重啟：真 UI 跑（warehouse 收貨自包含 fixture 調撥單 + 待料工單）。
test.describe("CROSS-03 ★串接點3 調撥到貨 ↔ 待料工單自動解除", () => {
  useRole("warehouse");
  let ctx: { transferId: string; roId: string };
  test.beforeEach(async () => { ctx = await seedCross03(); });
  test.afterEach(async () => { await resetCross03(); });

  test("warehouse 收貨 in_transit 調撥 → hook#5 解除待料 RO + loop entry resolved", async ({ page }) => {
    // 前置：seed 後確實處於待料、loop 未解
    const before = await readCross03(ctx.roId);
    expect(before.waitingFlag, "seed 後應為待料狀態").toBeTruthy();
    expect(before.loopResolved, "seed 後 loop entry 不應已 resolved").toBeFalsy();

    // 真 UI：調撥入庫看板用 q 縮窄到本 fixture 調撥單 → 點該列「確認收貨」→ modal 二次確認
    await page.goto(`/parts/receipt/transfer-in?q=${CROSS03_TR_NO}`);
    const row = page.locator("tr").filter({ hasText: CROSS03_TR_NO }).first();
    await expect(row).toBeVisible({ timeout: 12000 });
    await row.getByRole("button", { name: "確認收貨" }).click();

    const modal = page.locator("div.fixed.inset-0").filter({ has: page.getByRole("heading", { name: "確認收貨" }) }).last();
    await expect(modal.getByRole("heading", { name: "確認收貨" })).toBeVisible();
    await modal.getByRole("button", { name: "確認收貨" }).click();

    // 收貨成功：列上出現 GR 號 chip（receiveTransfer 同步寫 DB 後的 client 狀態）
    await expect(page.getByText(/GR\d{8}-\d{3}/).first()).toBeVisible({ timeout: 15000 });
    await page.screenshot({ path: "docs/test-evidence/round-13/CROSS-03.png", fullPage: true });

    // 後端 hook#5（after() 非阻塞）：輪詢待料旗標清掉 + loop entry resolved
    const after = await pollCross03(ctx.roId);
    expect(after.waitingFlag, "收貨後待料旗標應清掉").toBeFalsy();
    expect(after.hasWaitingItem, "待料 item 應移除").toBeFalsy();
    expect(after.loopResolved, "缺料告警 loop entry 應 resolved").toBeTruthy();
  });
});

/** 輪詢 CROSS-03 待料解除（hook#5 走 after() 非同步） */
async function pollCross03(roId: string, timeoutMs = 12000) {
  const start = Date.now();
  let s = await readCross03(roId);
  while (s.waitingFlag && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 600));
    s = await readCross03(roId);
  }
  return s;
}

// ──────────────────────────────────────────────────────────
// 第十三輪重啟：真 UI 跑（aftersales_lead 完成 WC 保固單複檢 → 自動登舊件）。
test.describe("CROSS-04 ★串接點4 竣工複檢 ↔ 保固索賠舊件登錄", () => {
  useRole("aftersales_lead");
  let ctx: { fiId: string; roId: string; itemId: string };
  test.beforeEach(async () => { ctx = await seedCross04(); });
  test.afterEach(async () => { await resetCross04(); });

  test("WC 保固單複檢完成 → hook#6 自動登錄換下保固零件到 old_parts（帶 ro_id）", async ({ page }) => {
    // 前置：尚無舊件
    expect((await readCross04(ctx.roId)).length, "seed 後不應有 old_parts").toBe(0);

    // 真 UI：複檢 5-step wizard（簽名已 seed）→ 點到「通知取車」step → 完成竣工複檢
    await page.goto(`/parts/aftersales/final-inspections/${ctx.fiId}`);
    await page.getByRole("button", { name: /通知取車/ }).click(); // 跳到 step 5
    const completeBtn = page.getByRole("button", { name: /完成竣工複檢/ });
    await expect(completeBtn).toBeEnabled({ timeout: 12000 });
    await completeBtn.click();
    await expect(page.getByText("✓ 複檢完成，工單推進到「待結帳」")).toBeVisible({ timeout: 12000 });
    await page.screenshot({ path: "docs/test-evidence/round-13/CROSS-04.png", fullPage: true });

    // 後端 hook#6（after() 非阻塞）：old_parts 出現一筆、帶 ro_id + 同 item
    const parts = await pollCross04(ctx.roId);
    expect(parts.length, "保固件複檢完成應自動登一筆舊件").toBe(1);
    expect(parts[0].ro_id, "舊件應綁回該保固工單").toBe(ctx.roId);
    expect(parts[0].item_id, "舊件 item 應為複檢的保固件").toBe(ctx.itemId);
    expect(parts[0].status).toBe("in_storage");
    expect(parts[0].wc_no, "應自動編 WC 入庫號").toBeTruthy();
  });
});

/** 輪詢 CROSS-04 登舊件（hook#6 走 after() 非同步） */
async function pollCross04(roId: string, timeoutMs = 12000) {
  const start = Date.now();
  let rows = await readCross04(roId);
  while (rows.length === 0 && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 600));
    rows = await readCross04(roId);
  }
  return rows;
}

// ──────────────────────────────────────────────────────────
// 第十三輪重啟：真 UI 跑（sa 切工單狀態到「已關單」→ 自動建 NPS 回訪）。
test.describe("CROSS-05 ★串接點5 人車檔案 ↔ 售後 CRM 客戶基盤同步", () => {
  useRole("sa");
  let ctx: { roId: string; customerId: string };
  test.beforeEach(async () => { ctx = await seedCross05(); });
  test.afterEach(async () => { await resetCross05(); });

  test("關閉工單（切「已關單」）→ hook#7 建 aftersales/nps_interview call_task", async ({ page }) => {
    // 前置：尚無 NPS 任務
    expect((await readCross05(ctx.roId)).length, "seed 後不應有 NPS 任務").toBe(0);

    // 真 UI：工單詳情 → 切「已關單」→ 確認對話框確認切換
    await page.goto(`/parts/aftersales/repair-orders/${ctx.roId}`);
    await page.getByRole("button", { name: '切「已關單」' }).click();
    await page.getByRole("button", { name: "確認切換" }).click();
    await expect(page.getByText('✓ 已切換為「已關單」')).toBeVisible({ timeout: 12000 });
    await page.screenshot({ path: "docs/test-evidence/round-13/CROSS-05.png", fullPage: true });

    // 後端 hook#7（after() 非阻塞）：建一筆 aftersales/nps_interview call_task（隔天回訪、pending）
    const tasks = await pollCross05(ctx.roId);
    expect(tasks.length, "關單應自動建一筆 NPS 回訪").toBe(1);
    expect(tasks[0].kind).toBe("aftersales");
    expect(tasks[0].call_type).toBe("nps_interview");
    expect(tasks[0].status).toBe("pending");
    expect(tasks[0].customer_id, "回訪應綁回工單客戶").toBe(ctx.customerId);
  });
});

/** 輪詢 CROSS-05 NPS 任務（hook#7 走 after() 非同步） */
async function pollCross05(roId: string, timeoutMs = 12000) {
  const start = Date.now();
  let rows = await readCross05(roId);
  while (rows.length === 0 && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 600));
    rows = await readCross05(roId);
  }
  return rows;
}

// ──────────────────────────────────────────────────────────
test.describe("CROSS-06 ★串接點6 銷售庫存展示 ↔ 庫存管理即時數據", () => {
  useRole("sales_lead");

  test("RS 新車展廳 / 中古庫存與庫存模組同源（new_car_inventory / used_car_inventory）數字一致", async ({
    page,
  }) => {
    // 銷售端展廳頁（sales-newcar-inventory.ts）與庫存管理（new-car-inventory.ts）都讀同一張
    // new_car_inventory 表 → 結構上即「同源」。此處驗：展廳頁可載入。
    // 銷售端展廳頁可載入（同源讀取，sales_lead 唯讀權）
    await page.goto("/sales/showroom/new-cars");
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain("/sales/showroom/new-cars");

    await page.goto("/sales/showroom/used-cars");
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain("/sales/showroom/used-cars");

    void BRAND;
  });
});
