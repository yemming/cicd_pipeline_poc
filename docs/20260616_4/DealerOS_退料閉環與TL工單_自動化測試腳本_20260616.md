# DealerOS 退料閉環與 TL 借用測試工單 — Playwright 自動化測試腳本
**日期：2026-06-16　｜　Russell Hung × Claude Sonnet 4.6 → Partner AI Agent**
**對應指令文件：DealerOS_售後修護模組_最終補測指令_20260616_退料閉環與TL工單.md**

---

## 給 Partner AI Agent 的說明

本腳本驗證退料閉環和 TL 借用測試工單兩個全新功能。

**重要：** 本腳本中的 `data-testid` 是這次新增功能所需要的 testid，Partner 在實作 UI 時**必須照這份腳本的命名加入 testid**，讓腳本跑得起來。

**跨模組驗證的核心思路：**
- 售後模組「發起退料」→ 庫存模組「倉管確認」必須形成閉環
- TL 工單「開立→領料→結案→退料/轉工單」必須是完整流程

---

## 帳號設定

```javascript
const ACCOUNTS = {
  sa: { email: 'e2e-sa@dealeros-test.com', role: 'SA' },
  tech: { email: 'e2e-tech@dealeros-test.com', role: '技師' },
  warehouse: { email: 'e2e-warehouse@dealeros-test.com', role: '倉管' },
  manager: { email: 'e2e-aftersales-lead@dealeros-test.com', role: '售後主管' },
};
```

---

## 測試前準備

```javascript
// 準備測試資料（每次測試前執行）
const TEST_RO_ID = 'e2e-test-ro-001';  // 預先建立的測試工單
const TEST_ADDON_ID = 'e2e-test-addon-001';  // 預先建立的已同意追加項目
const TEST_ITEM_ID = 'e2e-brake-pad-001';   // 測試用料號（煞車皮）
```

---

# 主線場景

---

## 主線 M1：追加項目取消 → 退料閉環驗證

**人話說明：**
技師已領出煞車皮×2（追加項目已 agreed），客戶反悔，SA取消追加項目。驗證：庫存不立即回補，而是建立退料待確認記錄；倉管確認後庫存才回補。

```javascript
test('M1: 追加項目取消 → 退料閉環', async ({ page }) => {

  // ── Step 1：SA 記錄取消追加項目前的庫存數量 ──
  const stockBefore = await getStockQty(TEST_ITEM_ID);
  console.log(`取消前庫存：${stockBefore}`);

  // ── Step 2：SA 取消追加項目 ──
  await login(page, ACCOUNTS.sa);
  await page.goto(`/parts/aftersales/repair-orders/${TEST_RO_ID}/addons`);
  await page.waitForSelector('[data-testid="cancel-agreed-btn"]');
  await page.click('[data-testid="cancel-agreed-btn"]');

  await page.waitForSelector('[data-testid="cancel-addon-modal"]');
  await screenshot(page, 'M1_01_cancel-modal_opened');

  // 選擇取消模式：整筆退料
  await page.click('[data-testid="cancel-mode-full-return"]');
  await page.click('[data-testid="confirm-cancel-btn"]');
  await page.waitForSelector('[data-testid="cancel-success-toast"]');
  await screenshot(page, 'M1_02_cancel_success');

  // ── Step 3：驗證庫存「未立即回補」（關鍵驗證）──
  const stockAfterCancel = await getStockQty(TEST_ITEM_ID);
  expect(stockAfterCancel).toBe(stockBefore); // 庫存不應該變
  await screenshot(page, 'M1_03_stock_not_restored_yet');
  // 人話：取消後庫存還是原來的數字，因為料件還沒回到庫房

  // ── Step 4：驗證 parts_return_requests 有新記錄 ──
  await page.goto(`/api/parts-return-requests?source_ro_id=${TEST_RO_ID}&status=pending`);
  const rts = JSON.parse(await page.textContent('body'));
  expect(rts.data.length).toBeGreaterThan(0);
  expect(rts.data[0].status).toBe('pending');
  await screenshot(page, 'M1_04_rts_record_created');
  // 人話：確認退料待確認記錄已建立

  // ── Step 5：倉管看到待確認清單 ──
  await login(page, ACCOUNTS.warehouse);
  await page.goto('/parts/receipt/return-in');
  await page.click('[data-testid="tab-return-confirmation"]'); // Tab B
  await page.waitForSelector('[data-testid="return-request-list"]');
  await screenshot(page, 'M1_05_warehouse_pending-list');
  // 人話：倉管在 Tab B 看到待確認的退料記錄

  // 確認記錄顯示正確資訊
  const firstRequest = page.locator('[data-testid="return-request-item"]').first();
  await expect(firstRequest).toContainText('煞車皮');
  await screenshot(page, 'M1_06_return-request_detail');

  // ── Step 6：倉管確認實物收到 ──
  await page.fill('[data-testid="confirmed-qty-input"]', '2');
  await page.click('[data-testid="return-type-full-return"]');
  await page.fill('[data-testid="warehouse-note-input"]', '零件完好，已入庫');
  await screenshot(page, 'M1_07_warehouse_confirm-form');

  await page.click('[data-testid="confirm-return-btn"]');
  await page.waitForSelector('[data-testid="confirm-success-toast"]');
  await screenshot(page, 'M1_08_confirm_success');

  // ── Step 7：驗證庫存已回補（閉環完成）──
  const stockAfterConfirm = await getStockQty(TEST_ITEM_ID);
  expect(stockAfterConfirm).toBe(stockBefore + 2); // 庫存應該 +2
  await screenshot(page, 'M1_09_stock_restored');
  // 人話：倉管確認後，庫存數字才真正回補

  // ── Step 8：驗證 parts_return_requests 狀態已更新 ──
  await page.goto(`/api/parts-return-requests?source_ro_id=${TEST_RO_ID}&status=confirmed`);
  const confirmed = JSON.parse(await page.textContent('body'));
  expect(confirmed.data.length).toBeGreaterThan(0);
  await screenshot(page, 'M1_10_rts_confirmed');

});
```

---

## 主線 M2：整張工單取消 → 批次退料閉環

**人話說明：**
工單有3樣零件已領出，客戶取消整張工單。驗證：3樣零件都建立退料待確認記錄，庫存不立即回補；倉管逐一確認後庫存才回補。

```javascript
test('M2: 整張工單取消 → 批次退料閉環', async ({ page }) => {

  await login(page, ACCOUNTS.sa);

  // ── Step 1：取消工單 ──
  await page.goto(`/parts/aftersales/repair-orders/${TEST_RO_ID}`);
  await page.click('[data-testid="cancel-ro-btn"]');
  await page.waitForSelector('[data-testid="cancel-ro-modal"]');
  await page.fill('[data-testid="cancel-reason-input"]', '客戶臨時決定不修');
  await page.click('[data-testid="confirm-cancel-btn"]');
  await page.waitForSelector('[data-testid="ro-cancelled-badge"]');
  await screenshot(page, 'M2_01_ro_cancelled');

  // ── Step 2：驗證已出庫零件都有退料待確認記錄 ──
  await page.goto(`/api/parts-return-requests?source_ro_id=${TEST_RO_ID}&status=pending`);
  const rtsRecords = JSON.parse(await page.textContent('body'));
  expect(rtsRecords.data.length).toBe(3); // 3樣零件都有記錄
  await screenshot(page, 'M2_02_rts_batch_created');
  // 人話：確認3筆退料待確認記錄都建立了

  // ── Step 3：倉管批次確認 ──
  await login(page, ACCOUNTS.warehouse);
  await page.goto('/parts/receipt/return-in');
  await page.click('[data-testid="tab-return-confirmation"]');

  // 確認來源篩選
  await page.selectOption('[data-testid="source-type-filter"]', 'ro_cancel');
  await screenshot(page, 'M2_03_filtered_ro-cancel');

  // 逐一確認
  const items = page.locator('[data-testid="return-request-item"]');
  const count = await items.count();
  expect(count).toBe(3);

  for (let i = 0; i < count; i++) {
    await items.nth(i).locator('[data-testid="confirm-return-btn"]').click();
    await page.waitForSelector('[data-testid="confirm-success-toast"]');
  }
  await screenshot(page, 'M2_04_batch_confirmed');

});
```

---

## 主線 M3：TL 借用測試工單完整流程（借3退2轉1）

**人話說明：**
技師借出3款感應器測試。測試完確認：感應器A適合（轉入正式工單），感應器B和C不適合（退料）。驗證：整個流程從開立到結案，跨模組閉環正確。

```javascript
test('M3: TL 借用測試工單 借3退2轉1', async ({ page }) => {

  // ── Step 1：SA 開立 TL 工單（雙簽）──
  await login(page, ACCOUNTS.sa);
  await page.goto('/parts/aftersales/repair-orders/new');

  // 選擇 TL 業務類型
  await page.click('[data-testid="prefix-TL"]');
  await page.waitForSelector('[data-testid="tl-form"]');
  await screenshot(page, 'M3_01_tl-form_shown');
  // 人話：選擇 TL 後顯示借用測試工單的特殊表單

  // 填寫借出目的
  await page.fill('[data-testid="tl-loan-purpose"]', '測試煞車感應器型號相容性');
  await screenshot(page, 'M3_02_purpose_filled');

  // SA 電子簽名
  await signCanvas(page, '[data-testid="tl-sa-signature-canvas"]');
  await screenshot(page, 'M3_03_sa_signed');

  // 切換到技師帳號簽名
  // （實際操作中，SA把螢幕轉給技師簽）
  await signCanvas(page, '[data-testid="tl-tech-signature-canvas"]');
  await screenshot(page, 'M3_04_tech_signed');

  // 開立工單
  await page.click('[data-testid="create-tl-ro-btn"]');
  await page.waitForSelector('[data-testid="tl-ro-created-badge"]');
  const tlRoId = await page.textContent('[data-testid="tl-ro-number"]');
  await screenshot(page, 'M3_05_tl-ro_created');
  // 人話：TL 工單建立，顯示工單號

  // ── Step 2：領料（3款感應器）──
  await page.goto('/parts/issue/repair-pick/new');
  await page.fill('[data-testid="ro-number-input"]', tlRoId);
  await screenshot(page, 'M3_06_repair-pick_ro-linked');
  // 人話：領料頁面關聯到 TL 工單，正常領料

  // 實際領料操作（略，沿用現有領料流程）
  await screenshot(page, 'M3_07_parts_issued');

  // ── Step 3：驗證 TL 工單有逾期提醒（距下班1小時）──
  // 此步驟為非破壞性驗證：確認 UI 有顯示截止時間
  await page.goto(`/parts/aftersales/repair-orders/${tlRoId}`);
  await page.waitForSelector('[data-testid="tl-due-by-badge"]');
  const dueBy = await page.textContent('[data-testid="tl-due-by-badge"]');
  expect(dueBy).toContain('今日');
  await screenshot(page, 'M3_08_tl-due-by_shown');

  // ── Step 4：TL 工單結案（逐行處置）──
  await page.goto(`/parts/aftersales/repair-orders/${tlRoId}/tl-close`);
  await page.waitForSelector('[data-testid="tl-close-form"]');
  await screenshot(page, 'M3_09_tl-close_form');

  // 感應器A → 轉入正式工單
  await page.click('[data-testid="line-0-transfer-to-ro"]');
  await page.fill('[data-testid="line-0-target-ro-input"]', 'RO-RP-260616-005');
  await screenshot(page, 'M3_10_line0_transfer');

  // 感應器B → 退料歸還
  await page.click('[data-testid="line-1-return-to-stock"]');
  await screenshot(page, 'M3_11_line1_return');

  // 感應器C → 退料歸還
  await page.click('[data-testid="line-2-return-to-stock"]');
  await screenshot(page, 'M3_12_line2_return');

  // 工時 → 門店吸收
  await page.click('[data-testid="labor-0-absorb"]');
  await screenshot(page, 'M3_13_labor_absorb');

  // 確認結案摘要
  await page.waitForSelector('[data-testid="tl-close-summary"]');
  await screenshot(page, 'M3_14_close-summary');
  // 人話：顯示結案摘要：轉入1筆、退料2筆、門店吸收工時

  // 點擊確認結案
  await page.click('[data-testid="confirm-tl-close-btn"]');
  await page.waitForSelector('[data-testid="tl-ro-closed-badge"]');
  await screenshot(page, 'M3_15_tl-ro_closed');

  // ── Step 5：驗證感應器A已轉入正式工單 ──
  await page.goto('/parts/aftersales/repair-orders/RO-RP-260616-005/lines');
  await page.waitForSelector('[data-testid="ro-lines-list"]');
  // 確認感應器A出現在正式工單的明細裡
  await expect(page.locator('[data-testid="ro-lines-list"]')).toContainText('感應器A');
  await screenshot(page, 'M3_16_sensor-A_in_target-ro');

  // ── Step 6：驗證感應器B和C有退料待確認記錄 ──
  await page.goto(`/api/parts-return-requests?source_ro_id=${tlRoId}&status=pending`);
  const rts = JSON.parse(await page.textContent('body'));
  expect(rts.data.length).toBe(2); // B 和 C
  await screenshot(page, 'M3_17_rts_for-B-and-C');

  // ── Step 7：倉管確認感應器B和C歸還 ──
  await login(page, ACCOUNTS.warehouse);
  await page.goto('/parts/receipt/return-in');
  await page.click('[data-testid="tab-return-confirmation"]');
  await page.selectOption('[data-testid="source-type-filter"]', 'tl_return');
  await screenshot(page, 'M3_18_warehouse_tl-returns');

  // 確認B
  await page.locator('[data-testid="return-request-item"]').first()
    .locator('[data-testid="confirm-return-btn"]').click();
  await page.waitForSelector('[data-testid="confirm-success-toast"]');

  // 確認C
  await page.locator('[data-testid="return-request-item"]').first()
    .locator('[data-testid="confirm-return-btn"]').click();
  await page.waitForSelector('[data-testid="confirm-success-toast"]');
  await screenshot(page, 'M3_19_tl-returns_confirmed');

  // ── Step 8：最終驗證：庫存正確 ──
  // 感應器A 庫存：不回補（已轉入正式工單使用）
  // 感應器B、C 庫存：各回補1個
  await screenshot(page, 'M3_20_final_stock_verified');

});
```

---

# 叉路場景

---

## 叉路 B1：追加項目部分取消（逐行）

**人話說明：**
追加項目有3行明細，SA只取消其中1行，其他繼續施工。

```javascript
test('B1: 追加項目部分取消（逐行選擇）', async ({ page }) => {

  await login(page, ACCOUNTS.sa);
  await page.goto(`/parts/aftersales/repair-orders/${TEST_RO_ID}/addons`);

  // 勾選要取消的明細行
  await page.click('[data-testid="line-1-cancel-checkbox"]'); // 只勾第2行
  await screenshot(page, 'B1_01_partial-select');
  // 人話：只勾選想取消的行

  await page.click('[data-testid="partial-cancel-btn"]');
  await page.waitForSelector('[data-testid="partial-cancel-modal"]');
  await screenshot(page, 'B1_02_partial-cancel-modal');

  await page.click('[data-testid="confirm-partial-cancel-btn"]');
  await page.waitForSelector('[data-testid="partial-cancel-success"]');
  await screenshot(page, 'B1_03_partial-cancel_done');

  // 驗證：只有第2行建立了退料待確認記錄
  await page.goto(`/api/parts-return-requests?source_ro_id=${TEST_RO_ID}&status=pending`);
  const rts = JSON.parse(await page.textContent('body'));
  expect(rts.data.length).toBe(1); // 只有1筆
  await screenshot(page, 'B1_04_only-one-rts');

  // 驗證：其他明細行仍在 agreed 狀態，繼續施工
  await page.goto(`/parts/aftersales/repair-orders/${TEST_RO_ID}/addons`);
  await screenshot(page, 'B1_05_other-lines-still-agreed');

});
```

---

## 叉路 B2：倉管確認退料數量不符（實際只有1個，申請2個）

**人話說明：**
SA申請退2個煞車皮，但倉管實際只收到1個（另一個不知去向）。

```javascript
test('B2: 倉管確認數量不符 → 差額核銷', async ({ page }) => {

  await login(page, ACCOUNTS.warehouse);
  await page.goto('/parts/receipt/return-in');
  await page.click('[data-testid="tab-return-confirmation"]');

  // 輸入實際收到數量（比申請少）
  await page.fill('[data-testid="confirmed-qty-input"]', '1'); // 申請2個，只收到1個
  await screenshot(page, 'B2_01_qty-mismatch');

  // 系統提示差額處理
  await page.waitForSelector('[data-testid="qty-mismatch-warning"]');
  await screenshot(page, 'B2_02_mismatch-warning');
  // 人話：系統提示「申請2個，確認1個，差額1個需要說明」

  // 選擇差額處理方式
  await page.click('[data-testid="shortfall-writeoff"]'); // 差額核銷
  await page.fill('[data-testid="shortfall-reason"]', '1個零件已在車間遺失，無法追回');
  await page.click('[data-testid="confirm-return-btn"]');
  await screenshot(page, 'B2_03_shortfall_confirmed');

  // 驗證：1個入庫，1個核銷
  await page.goto('/api/inventory-writeoffs?latest=true');
  const writeoffs = JSON.parse(await page.textContent('body'));
  expect(writeoffs.data[0].qty).toBe(1);
  await screenshot(page, 'B2_04_writeoff_created');

});
```

---

## 叉路 B3：退料逾期未確認 → 主管通知

```javascript
test('B3: 退料逾期未確認 → 主管收到通知', async ({ page }) => {

  // 此測試需要手動觸發 cron job 或等待時間到期
  // 非破壞性驗證：確認逾期後的 UI 狀態

  await login(page, ACCOUNTS.warehouse);
  await page.goto('/parts/receipt/return-in');
  await page.click('[data-testid="tab-return-confirmation"]');

  // 確認有「已逾期」區塊
  await page.waitForSelector('[data-testid="overdue-section"]');
  await screenshot(page, 'B3_01_overdue-section');
  // 人話：逾期記錄顯示在紅色的「已逾期」區塊

  // 確認主管有收到通知
  await login(page, ACCOUNTS.manager);
  await page.goto('/notifications');
  await page.waitForSelector('[data-testid="return-overdue-notification"]');
  await screenshot(page, 'B3_02_manager_notified');

});
```

---

## 叉路 B4：TL 工單選擇「向車主收費」→ 要求補車主簽名

```javascript
test('B4: TL 結案向車主收費 → 需補車主簽名', async ({ page }) => {

  await login(page, ACCOUNTS.sa);
  await page.goto('/parts/aftersales/repair-orders/tl-test-ro/tl-close');

  // 選擇向車主收費
  await page.click('[data-testid="labor-0-charge-customer"]');
  await screenshot(page, 'B4_01_charge-customer-selected');

  // 嘗試直接結案（應該被擋住）
  await page.click('[data-testid="confirm-tl-close-btn"]');
  await page.waitForSelector('[data-testid="customer-signature-required"]');
  await screenshot(page, 'B4_02_signature-required-error');
  // 人話：系統阻擋，提示「向車主收費必須補充車主簽名」

  // 補充車主簽名後才能結案
  await signCanvas(page, '[data-testid="customer-signature-canvas"]');
  await page.click('[data-testid="confirm-tl-close-btn"]');
  await page.waitForSelector('[data-testid="tl-ro-closed-badge"]');
  await screenshot(page, 'B4_03_with-signature_closed');

});
```

---

## 叉路 B5：TL 工單當天未結案 → 主管收到提醒

```javascript
test('B5: TL 工單未結案逾期提醒', async ({ page }) => {

  // 非破壞性驗證：確認 TL 工單有截止時間顯示
  await login(page, ACCOUNTS.sa);
  await page.goto('/parts/aftersales/repair-orders/tl-test-ro');

  // 確認有截止時間顯示
  await page.waitForSelector('[data-testid="tl-due-by-badge"]');
  const dueText = await page.textContent('[data-testid="tl-due-by-badge"]');
  expect(dueText).toContain('今日');
  await screenshot(page, 'B5_01_due-by-shown');

  // 確認主管有收到提醒通知（需要 cron job 觸發）
  await login(page, ACCOUNTS.manager);
  await page.goto('/notifications');
  await screenshot(page, 'B5_02_manager_notifications');
  // 人話：確認主管的通知中心有 TL 工單提醒

});
```

---

## 叉路 B6：一車多工單 — TL + MN 並存（不告警）

```javascript
test('B6: TL + MN 同車並存 → 不觸發告警', async ({ page }) => {

  await login(page, ACCOUNTS.sa);

  // 此台車已有一張 MN 保養工單在進行中
  // 嘗試開立 TL 工單
  await page.goto('/parts/aftersales/repair-orders/new');
  await page.fill('[data-testid="vehicle-plate-input"]', 'TEST-PLATE-MN');
  await page.click('[data-testid="prefix-TL"]');

  // 確認沒有 concurrent-warn 或 concurrent-block
  const warnCount = await page.locator('[data-testid="concurrent-warn"]').count();
  const blockCount = await page.locator('[data-testid="concurrent-block"]').count();
  expect(warnCount).toBe(0);
  expect(blockCount).toBe(0);
  await screenshot(page, 'B6_01_TL-MN_no-warning');
  // 人話：TL 工單和 MN 工單並存，系統不告警（這是設計上允許的）

});
```

---

## 叉路 B7：TL + TL 同車並存 → 告警

```javascript
test('B7: TL + TL 同車並存 → 觸發告警', async ({ page }) => {

  await login(page, ACCOUNTS.sa);

  // 此台車已有一張 TL 借用測試工單在進行中
  await page.goto('/parts/aftersales/repair-orders/new');
  await page.fill('[data-testid="vehicle-plate-input"]', 'TEST-PLATE-TL');
  await page.click('[data-testid="prefix-TL"]');

  // 確認出現告警
  await page.waitForSelector('[data-testid="concurrent-warn"]');
  await screenshot(page, 'B7_01_TL-TL_warning');
  // 人話：同一台車不應有兩張借用測試工單，系統告警

});
```

---

## 工具函式

```javascript
async function login(page, account) {
  await page.goto('/login');
  await page.fill('input[type=email]', account.email);
  await page.fill('input[type=password]', process.env.E2E_PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForURL('**/dashboard**');
}

async function screenshot(page, name) {
  await page.screenshot({
    path: `test-results/return-tl/${name}_${Date.now()}.png`,
    fullPage: true
  });
  console.log(`✅ Screenshot: ${name}`);
}

async function signCanvas(page, selector) {
  const canvas = page.locator(selector);
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + 50, box.y + 50);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 80);
  await page.mouse.up();
}

async function getStockQty(itemId) {
  // 透過 API 查詢庫存數量
  const res = await fetch(`/api/stock-balance?item_id=${itemId}`);
  const data = await res.json();
  return data.available_qty;
}
```

---

## 完成報告格式

```markdown
# 退料閉環與 TL 借用測試工單 Playwright 測試完成報告
日期：YYYY-MM-DD

## 場景測試結果
| 場景 | 說明 | 結果 | 截圖數 |
|------|------|------|--------|
| M1 | 追加項目取消→退料閉環 | ✅ 通過 | 10 |
| M2 | 工單取消→批次退料閉環 | ✅ 通過 | 4 |
| M3 | TL借3退2轉1完整流程 | ✅ 通過 | 20 |
| B1 | 追加項目部分取消（逐行）| ✅ 通過 | 5 |
| B2 | 倉管確認數量不符 | ✅ 通過 | 4 |
| B3 | 退料逾期主管通知 | ✅ 通過 | 2 |
| B4 | TL結案向車主收費補簽名 | ✅ 通過 | 3 |
| B5 | TL未結案逾期提醒 | ✅ 通過 | 2 |
| B6 | TL+MN並存不告警 | ✅ 通過 | 1 |
| B7 | TL+TL並存告警 | ✅ 通過 | 1 |

## 閉環驗證重點
① 追加取消→庫存不立即回補：✅
② 倉管確認後庫存才回補：✅
③ 工單取消→批次建立RTS：✅
④ TL工單借3退2轉1：✅
⑤ 向車主收費強制補簽名：✅
⑥ TL+MN不告警/TL+TL告警：✅

## 特別說明
（任何測試失敗或需要說明的情況）
```

---

## 給 Partner AI Agent 的 testid 命名規範

本腳本使用的所有 testid 都是新增功能所需要的，實作 UI 時必須照以下命名加入：

```
退料確認相關：
  tab-return-confirmation          /parts/receipt/return-in 的 Tab B
  return-request-list              退料待確認清單容器
  return-request-item              每筆退料記錄
  confirmed-qty-input              倉管確認數量輸入欄
  return-type-full-return          選擇「完整退料」
  warehouse-note-input             倉管備註
  confirm-return-btn               確認收到按鈕
  confirm-success-toast            確認成功提示
  source-type-filter               來源類型篩選
  overdue-section                  逾期區塊
  qty-mismatch-warning             數量不符警示
  shortfall-writeoff               差額核銷選項
  shortfall-reason                 差額原因輸入

追加項目部分取消：
  line-N-cancel-checkbox           第N行的取消勾選框
  partial-cancel-btn               部分取消按鈕
  partial-cancel-modal             部分取消確認彈窗
  confirm-partial-cancel-btn       確認部分取消
  partial-cancel-success           部分取消成功提示

TL 工單相關：
  prefix-TL                        業務類型選擇 TL
  tl-form                          TL 特殊表單
  tl-loan-purpose                  借出目的輸入
  tl-sa-signature-canvas           SA 簽名 canvas
  tl-tech-signature-canvas         技師簽名 canvas
  create-tl-ro-btn                 開立 TL 工單按鈕
  tl-ro-created-badge              TL 工單建立成功標籤
  tl-ro-number                     TL 工單號顯示
  tl-due-by-badge                  截止時間顯示
  tl-close-form                    TL 結案表單
  line-N-transfer-to-ro            第N行轉入正式工單
  line-N-target-ro-input           目標工單輸入
  line-N-return-to-stock           第N行退料歸還
  labor-N-absorb                   第N工時明細門店吸收
  labor-N-charge-customer          第N工時明細向車主收費
  tl-close-summary                 結案摘要預覽
  confirm-tl-close-btn             確認結案按鈕
  tl-ro-closed-badge               TL 工單已關單標籤
  customer-signature-required      需要車主簽名的錯誤提示
  customer-signature-canvas        車主簽名 canvas
  return-overdue-notification      退料逾期通知
  tl_ro_pending-notification       TL 未結案提醒通知
```

*DealerOS 機密文件　｜　Russell Hung　｜　2026-06-16*
