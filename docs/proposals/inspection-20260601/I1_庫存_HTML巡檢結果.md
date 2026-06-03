# I-1 · 庫存 8 支 HTML 巡檢結果（6/1 異動規格 vs 現有 React）

**產出**：2026-06-02，3 agent 並行巡檢（告警採購水位 / 入出庫增項鏈 / 盤點暫存倉供應商）
**方法**：逐項讀 6/1 異動說明 → 對照既有 parts/* 路由 + domain helper → grep 驗證 → 輸出可施工差異
**輸入**：`docs/20260601/08_庫存管理模組_HTML異動檔案包/`（6 替換 + 1 新頁 + 供應商）

> 一句話：庫存骨架極成熟（採購/入庫/領料/盤點/暫存倉/供應商/水位/work-order-loop 都有真 React + domain）。**唯一真缺頁是 10B 告警儀表板（WP-A，老闆點名首頁）**；多數異動是「在既有 board 加區塊」或「補事件串接斷點」。**DDL 集中在 W4(驗收差異表) 與 W7(舊件 bin_id)**，且 W1-Tab3 / W7 有 2 個業務卡點需 Ming 拍板。

## 逐項差異摘要

| 異動 | 對應 WP | 現役路由 | 規模 | DDL | 核心缺口 |
|---|---|---|---|---|---|
| W1 10B 告警儀表板(新) | **WP-A** | 無（建 parts/alerts/dashboard） | **L** | 🟡Tab3 | 4 KPI + 5 Tab 組裝既有 helper；批號到期 Tab 缺 expiry 來源 |
| W2 再訂購點計算器 | **WP-D** | parts/alerts/thresholds | S–M | ❌/🟡 | header 加計算輔助器(日均×前置+安全)+一鍵套用；可用庫存說明卡 |
| W3 PDC 截單倒計時+緊急送單 | **WP-H** | parts/purchase/orders | S | ❌ | 倒計時元件 + createUrgentPurchaseOrder(reuse，標 purchase_type='urgent') |
| W4 驗收差異三入口 | **WP-C** | parts/receipt/po-grn | **L** | ✅**新表** | 短收/拒收 Modal+拍照+CSV 比對；差異記錄=供應商績效資料源 |
| W5 待備料橫幅+工單掃描 | **WP-F** | parts/issue/repair-pick | M | ❌ | 建單表單已自動帶料；缺 list 橫幅 + 掃描槍 Enter 帶入 |
| WP-I 增項閉環事件鏈 | **WP-I** | parts-waiting.ts #4/#5 | M | ❌ | 骨架已在；**斷點：PO 入庫沒接 releaseWaitingForItem + 解待料不通知 SA** |
| W6 相機條碼掃描 | **WP-G** | parts/count/sessions/[id] | M | ❌ | 盤點 modal 加 ZXing(已裝)相機掃描，降級鍵盤 |
| W7 暫存倉庫位+RO舊件入庫 | **WP-E** | parts/warranty/staging-warehouse | **L** | ✅bin_id | 儲位 CRUD(zones/bins 表已在)+舊件 bin 級數量+RO 觸發入庫 |
| W8 供應商績效看板 | **WP-B** | parts/setup/suppliers | M | ❌ | list header 插六指標看板(準時/前置/短收/退貨/評分/建議)，可從 PO+GRN+退貨 lines 算 |

## 關鍵發現
1. **唯一真缺頁 = W1 10B 告警儀表板**：底層資料多已在（`parts-balance.getInventoryBalanceWithAlerts`、`parts-thresholds`、`parts-alert-work-order-loop`、`orders` overdue），是「聚合組裝頁」非從零造資料。
2. **WP-I 鏈條已大半實作**：`parts-waiting.ts` #4(`markWaitingParts`)/#5(`releaseWaitingForItem`)存在且運作；但 **#5 只被調撥入庫(transfers)呼叫、PO 採購入庫(receipts)沒接** → 採購到貨不自動解待料；且**解待料後無 LINE 通知 SA**。補這 2 斷點即打通，非從零造。
3. **多數零 DDL**：W2(metadata)/W3(purchase_type='urgent' 現成欄)/W5/W6/W8(PO+GRN+退貨 lines 全可算) 都不需動 schema。
4. **DDL 集中 2 處**：W4 需新表 `receiving_discrepancies`（供應商績效資料源）；W7 舊件位置目前塞 `metadata.warehouse_id`、要到 bin 級需加 `bin_id`。

## ⚠️ 待 Ming 拍板的 2 個業務卡點（落地前必解）
- **B1（W1 Tab3 批號到期）**：batch 層只有 `batch_no`，**無 `expiry_date`/`warranty_end` 欄**。批號 30 天到期 Tab 無資料來源 → 建議本輪此 Tab 標「Phase 2 / 先假資料」，或加 batch 層 expiry 欄。
- **B2（W7 RO 觸發舊件入庫）**：`repair_orders.status` 實際值是中文（進行中/維修中/待結帳/已關單），**無「竣工複檢通過」狀態**。「待確認儲位的工單」來源無對應 → 需定義（加 status 值 / metadata flag / 用 used-parts `status='awaiting'` 當待入庫池）。

## I-1 DDL 提案（待簽核才 apply，比照 G-1）
| # | 變更 | 用途 | 替代方案 |
|---|---|---|---|
| D1 | 新表 `receiving_discrepancies`(brand_id, gr_id/po_id, item_id, kind short\|damage, qty_diff, reason, photo_urls jsonb, supplier_id, status, metadata) | W4 驗收差異記錄 + W8 績效資料源 | 無（這是新資料） |
| D2 | `parts_warranty_used_parts_items` 加 `bin_id uuid`（FK warehouse_bins） | W7 舊件庫位級即時數量 | 先用 `metadata.bin_id` 慣例免 DDL |
| D3(選) | `stock_thresholds` 加 `avg_daily_consumption numeric` / `lead_time_days int` | W2 存計算參數供 Phase2 自動建議 | 先塞 `metadata` 免 DDL（建議） |
| — | storage bucket（W4 損壞拍照） | 沿用既有 ItemImageUploader 上傳 pattern | — |

**零 DDL 可立即做**：W3(WP-H) / W2(WP-D，走 metadata) / W5(WP-F) / W6(WP-G) / W8(WP-B，mock-first) / WP-I（接 #5 + 通知）。
**需簽核才做**：W4(WP-C，要 D1 新表) / W7(WP-E，要 D2 + B2 拍板) / W1-Tab3（B1 拍板）。
