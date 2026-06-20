# 報告二 v2：`work_orders` 盤點 → 修復 → 驗證

**日期：2026-06-20　｜　Partner AI Agent → Russell Hung**
**對應：6/19 裁示 §二　｜　承 v1 盤點，本版補「全部修復 + 兩輪測試」**

> v1 只回事實。本版依指示**把掃出的缺陷全部修掉**，並跑**兩輪測試**驗證。測試第一輪又抓到一個 v1 沒看到的更深缺陷（補貨函數 `kind='part'` vs `'parts'`），一併修掉後第二輪全綠。

---

## 摘要

- v1 盤點列出 **2 處已確認問題 + 3 處疑似**。本輪逐一查證：疑似的 #5 確認為**真 bug**（且正是 Russell 擔心的「work_orders 第三處 id 空間誤用」）、#6 確認為**真顯示缺口**。
- **測試 Round 1 又揪出第 6 個缺陷**：補貨函數 `calculate_replenishment` 濾 `kind='part'`（單數），但實際資料與 CHECK constraint 都是 `'parts'`（複數）→ **工單需求部分從來沒生效過**。這是「先修狀態 bug、跑測試才現形」的典型，靠靜態讀 code 看不出來。
- **6 個缺陷全部修復，逐項有 DB/查詢層實證。** 靜態檢查（tsc/eslint/天條 audit）全綠。
- ⚠️ 程式碼改動**尚未部署**（DB 函數已直接更新到正式庫；TS 改動待 push）。詳見 §四。

---

## 一、修復清單（逐項：問題 → 修法 → 驗證）

### 缺陷 1 ｜會計維度下拉抓錯欄名（#2）
- **問題**：`src/lib/accounting/queries.ts:499` select `wo_no`，但 work_orders 欄位名是 `ro_no`（無 wo_no）→ Supabase 靜默回 null → 會計分錄「RO 維度」下拉顯示的是 id 截段，不是真單號。
- **修法**：`wo_no` → `ro_no`（select 與 fallback `r.ro_no ?? r.id.slice(0,8)` 兩處）。
- **驗證**：tsc/eslint 綠；欄名與 schema 一致。

### 缺陷 2 ｜`listIssuesForWorkOrder` 參數命名誤導（#3）
- **問題**：`src/domain/work-orders.ts:88` 參數叫 `roId`，但傳入的是 `work_orders.id`（查 `stock_issues.ro_id` 語意正確、只是命名會讓人誤以為是 repair_orders.id）。
- **修法**：參數正名 `roId` → `workOrderId`，加註解釐清 id 空間。純命名、零行為變更。
- **驗證**：tsc/eslint 綠；呼叫端以位置參數傳入 work order id，不受影響。

### 缺陷 3 ｜補貨函數工單狀態值對不到（#4a）
- **問題**：`calculate_replenishment()` 的 `allocated` / `gross_demand` 兩個 CTE 濾 `wo.status IN ('open','dispatched')`——work_orders 合法狀態無 `'open'`（CHECK：draft/dispatched/in_progress/qc/done/closed/cancelled）→ `'open'` 永遠 match 不到 → in_progress 工單的料件需求被漏算。
- **修法**：`('open','dispatched')` → `('draft','dispatched','in_progress','qc')`（與領料流程 `getRepairPickFormData` / `issueForRepair` 認定的「可領料活躍狀態」一致），兩個 CTE 都改。
- **驗證**：見缺陷 4（與 kind 修正合併端到端驗）。

### 缺陷 4 ｜補貨函數料件 kind 單複數不符（#4b，**測試中新發現**）
- **問題**：同函數濾 `woi.kind = 'part'`（單數），但 `work_order_items.kind` 的 CHECK constraint 與全部 13 筆實際資料都是 `'parts'`（複數）→ **match 0 筆 → 補貨函數的「工單需求」部分（allocated + gross_demand）一直恆為 0、從未生效**。狀態 bug 只是讓它「更加」抓不到；kind bug 是讓它「完全」抓不到的根因。
- **修法**：兩個 CTE 的 `kind = 'part'` → `kind = 'parts'`。
- **驗證（端到端實跑函數）**：
  - 修前：indian 的 work_order_items（13 筆 `'parts'`）對補貨完全隱形，gross_demand 恆 0。
  - 修後實跑 `calculate_replenishment('indian', …)`：5 個有工單需求的品項全部浮現；其中 **CON-FIL-003**（庫存 0、工單需求 5）正確產生補貨建議（run_lines `gross_demand_qty=5`、`suggested_qty=200`）；另 4 個（如 CON-FIL-001 庫存 117 vs 需求 11）因庫存足被正確排除。**工單需求從「恆為 0」變成真的流進補貨。**

### 缺陷 5 ｜`issueForRepair` 預留消耗 id 空間誤用（#5，**Russell 擔心的「第三處」確認屬實**）
- **問題**：`src/lib/parts/actions/index.ts` 的 `issueForRepair`（admin 工單一鍵領料，活路由）在消耗預留時 `roIdForConsume = wo.id`，再拿去比對 `inventory_reservations.ro_id`。但 `reservations.ro_id` 的語意是 **repair_orders.id**（不是 work_orders.id）→ id 空間不符、永遠 match 不到、預留從不被消耗。**與場景一（issues.ts）同一個病，在另一條領料路上。**
- **修法**：select 補撈 `repair_order_id`；`roIdForConsume = wo.repair_order_id`；無 `repair_order_id`（純倉管工單）則無對應預留、直接略過。
- **驗證（DB 層實證）**：
  - 先以全庫資料確認 id 空間：14/14 筆 `inventory_reservations.ro_id` 落在 `repair_orders`、**0 筆**落在 `work_orders` → 證實語意。
  - 建 active 預留 fixture（鍵在某 indian 橋接工單的 repair_order_id），跑 consume 的**確切查詢**對照：
    - 舊（`ro_id = work_order.id`）→ **matched 0**（bug 重現）
    - 新（`ro_id = repair_order_id`）→ **matched 1**（修復生效、預留會被正確 consume）
  - fixture 已清除。

### 缺陷 6 ｜C-28 加購領料單在列表/詳情無單號（#6）
- **問題**：C-28 加購領料刻意把 `stock_issues.ro_id` 留 null、出處記在 `source_doc_id`（repair_orders.id）。但 `listIssues` / `getIssueById` 只用 `ro_id → work_orders` 解單號 → 這類單單號顯示空白。
- **修法**：`ro_id` 為 null 且 `source_doc_type='repair_order'` 時，改從 `repair_orders.ro_code` 解單號（list 批撈、detail 單撈）。
- **驗證（fixture 對照）**：建 C-28 樣態領料單，模擬解析：舊邏輯 → 單號 `null`；新邏輯 → `TL-IN-260617-001`。fixture 已清除。
  - 註：目前正式庫 C-28 來源領料單 **0 筆**，此修為防禦性 + 為 C-28 上線鋪路，無既有資料受影響。

---

## 二、兩輪測試紀要

| 輪次 | 內容 | 結果 |
|------|------|------|
| **Round 1** | 靜態（tsc/eslint）+ DB 功能（實跑補貨函數） | 靜態綠；但實跑補貨時發現工單需求仍為 0 → **揪出 kind='part' 第 6 個 bug** → 立即補修 |
| **Round 2** | 全部修完後重測：補貨函數端到端、預留 consume id 空間 fixture、C-28 單號 fixture、最終 tsc/eslint/天條 audit、讀回 DB 函數確認 | **全綠**：補貨工單需求浮現、consume 舊0/新1、C-28 單號舊null/新有值、函數 `'open'`/`'part'` 已絕跡（`'parts'`×2、新狀態集×2） |

---

## 三、`work_orders` vs `repair_orders` 盤點結論（承 v1，不變）

兩表**不重複、各自不可替代**：`work_orders` 是倉管領料體系主表（`stock_issues.ro_id` FK 接這、repair-pick 清單只讀這）；`repair_orders` 是售後業務流程主表（客訴/保固/結帳/預檢只認這）。68 筆 work_orders 中 63 筆 `repair_order_id` 為 NULL（大量純倉管工單不對應 RO），`repair_order_id` 是接合鍵非合併鍵。完整讀寫點清單見 v1 報告。

**本輪修復後，work_orders 已知的 id 空間/欄位誤用接點全數收斂**：場景一（issues.ts，先前已修）+ 本輪缺陷 5（issueForRepair）為僅有的兩處 id 空間誤用，皆已修；其餘為欄名/狀態/單號顯示類，亦全修。

---

## 四、部署狀態與下一步

- **DB 函數 `calculate_replenishment`**：兩個修正已直接 apply 到正式 Supabase（DDL 已生效）。
- **TS 改動**（缺陷 1/2/5/6，共 4 檔）+ 供應商 `oem_dealer_code`（裁示 §三）：**尚未 commit / push**，依專案規範部署前先請 Ming 點頭。
- 一旦 push → Zeabur 自動部署 → 可選擇對部署後 URL 跑 Playwright e2e 補驗 UI 渲染（#2 下拉、#6 列表單號），並依規範發 LINE 上版通知。

**等 Ming 一句「push」即接著部署 + e2e + LINE 通知。**

---

*DealerOS 機密文件　｜　Partner AI Agent　｜　2026-06-20 v2*
