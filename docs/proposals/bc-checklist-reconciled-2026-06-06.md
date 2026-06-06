# v3.0 §九 B/C 清單 — 對現況校準地圖（2026-06-06）

> 來源：workflow reconcile（13 investigator，查實際 code + DB，要求端到端證據）。
> 對齊基準：`docs/20260605/DealerOS_目錄結構規範_v3.0.docx` §九。
> **核心發現：v3.0 文件系統性「低估」現況** — 3 項標 ❌/⚠️ 其實已 done、5 項其實是 partial（有骨架+關鍵接線、缺最後一哩），真正全沒動的只有 4 項。

## 總表

| 項 | 標題 | 文件標 | **實際** | 信心 | 一句話 |
|---|---|---|---|---|---|
| B-01 | 組織架構設定寫後端 | 🔴 待補 | ✅ **done** | high | 早就 await setOrgModeAction 寫 system_settings.org_mode |
| B-02/03/04/06 | RLS/角色矩陣/8帳號/PDI/示範 | ✅ | ✅ **done** | high | 複查無過度宣稱，全端到端 |
| B-05 | 告警儀表板真數字 / 工單建立 POST | ⚠️ | ✅ **done** | high | 儀表板真撈 v_stock_balances、confirmRepairOrderAction 真 insert repair_orders |
| **B-07** | PDF 匯出 Zeabur 實測（GRP05 季報） | ⚠️ | ✅ **done** | high | **2026-06-06 已認證實測**：admin Playwright 登正式站打 `/api/pdf/group-quarterly-report/2026-Q1` 回 200 + `application/pdf` 504.9KB + `%PDF-`；sips 轉 PNG 目視中文**零豆腐**（Noto Sans TC 載成功）。Zeabur chromium 三連修生效 |
| C-21 | 手卡→查無客戶→自動建檔 | ❌ | ❌ **not_done** | high | createHandcard 只寫 sales_handcards、不碰 customers；查客戶 helper 是死碼 |
| C-22 | 關單→D+3/D+7 電訪 | ❌ | 🟡 **partial** | high | 有關單 after() hook，但建 D+1 NPS / D+150 保養、**不是 D+3/D+7**；DB 零真實資料 |
| C-23 | 交車→售後客戶檔 | ❌ | ❌ **not_done** | high | completeDelivery 只更新狀態，無 after()/trigger 建檔 |
| C-24 | 休眠自動降級 cron | ❌ | ❌ **not_done** | high | pg_cron 未裝、無 edge function、純手動 markLost；分級全 seed/runtime 衍生 |
| C-25 | LINE 真實推播 | ❌ | 🟡 **partial** | high | commit 26812e5 只推「摘要」到開發群組，**非逐客戶推**（customers 無 line_user_id）|
| C-26 | 車牌+維修履歷+Desmo到期 | ⚠️ | 🟡 **partial** | high | 維修履歷有、**Desmo 汽門保養到期完全沒做**（無欄位/推算/顯示）|
| C-27 | 客戶標籤 is_locked 主管鎖定 | ⚠️ | ❌ **not_done** | high | **is_locked 欄位根本不存在**，schema/helper/UI/權限四層全無骨架 |
| C-28 | 增項→備料→出庫閉環 | ❌ | 🟡 **partial** | high | 各段都有、**最後一哩沒接**（出庫讀 work_orders、增項寫 repair_orders 兩套表無橋接；reservations.consume() 無呼叫端）|
| C-29 | 採購入庫→待料工單自動解除 | ❌ | ✅ **done** | high | receiveStock→after()→releaseWaitingForItem 全鏈打通（commit b18b94e）|

統計（B-07 驗證後）：**done 5**（B-01, B-02/03/04/06, B-05, B-07, C-29）· **partial 4**（C-22, C-25, C-26, C-28）· **not_done 4**（C-21, C-23, C-24, C-27）。

> **🎉 B 類（測試前必須）全部 done**：B-01 ✅ / B-05 ✅ / B-07 ✅（2026-06-06 認證實測通過）/ B-02·03·04·06 ✅。**B 型真人測試前置門檻已完全清空。** 剩餘全在 C 類（跨模組自動觸發鏈，非致命，決定 B 型品質）。

## 對「B 型真人測試」的關鍵結論

B 類是 v3.0 標的「測試前必須」門檻。校準後：**B-01 ✅、B-05 ✅、B-07 程式+部署到位只缺一次認證後實測**。→ **B 型測試前置實質已清，唯一動作是跑一次 B-07 的認證 PDF 驗證**（whereToStart：admin 帳號 Playwright 登入正式站產 storageState → 打 `/api/pdf/group-quarterly-report/2026-Q1` 確認回 200 + Content-Type pdf + 中文非豆腐）。

## 起手點（partial / not_done 各項，給排優先序用）

- **B-07（partial，最該先收）**：Playwright 認證 probe 打 PDF endpoint 驗 200+中文。檔：`src/app/api/pdf/[slug]/[id]/route.ts`、`src/lib/pdf/render.ts`、`Dockerfile`、`print.css`。
- **C-29 已 done**：但 repair_orders 目前 0 筆 waiting_parts flag → 建議跑一次「標待料→入庫→解除」demo 留端到端紀錄。
- **C-22（partial）**：改 `src/lib/aftersales/repair-order-actions.ts:273` 關單 after()，把單筆改連建 D+3(`aftersales_d3`)+D+7（需在 `sales-call-tasks.constants.ts` 加 `aftersales_d7`），dedupeKey 用 source_ro+call_type。
- **C-28（partial）**：`src/domain/issues.ts` 出庫來源增掃 `inventory_reservations status='active' source_type='repair_order_addon'`，接 `reservations.consume()`。
- **C-25（partial）**：customers 加 `line_user_id` + OA 綁定 webhook；`sendCampaignAction` 改 query 受眾逐人/multicast。
- **C-26（partial）**：`src/domain/license-plate.ts` + customer_vehicles 加 Desmo typed 欄位（上次汽門保養日/里程）+ 依車型推算到期 + UI 顯示。
- **C-21（not_done）**：`src/domain/sales-handcards.ts:251` createHandcard 內查 customers（phone+name，同 brand），查無則 insert + 回填 customer_id。參考 crm-sync.ts:80-110 查詢、把 :112 demo 分支改真 insert。
- **C-23（not_done）**：`src/lib/delivery/delivery-actions.ts` completeDeliveryAction 成功後 after() 呼叫新 helper upsert customers + customer_vehicles。
- **C-24（not_done）**：裝 pg_cron（或 Next API route + 外部 cron）算 work_orders.opened_at 距今天數 UPDATE customers.aftersales_dormancy_status。邏輯參考 `src/domain/crm-aftersales-dormant.ts`。
- **C-27（not_done）**：ALTER customer_tags/customer_personal_tags ADD is_locked → `src/domain/customer-tags.ts` 加型別+鎖定 action+被鎖拒改 gate → 主管/RS 兩端 UI。需先補主管 vs RS 的 RBAC 判定。

## 後續維護建議

文件（v3.0 docx 是 binary）與現況脫節嚴重 → 建議把本校準表當「§九 的真實狀態」單一事實來源；docx 下次更新時據此修正 B-01/B-05/C-29 為 ✅、C-22/25/26/28 標 partial。
