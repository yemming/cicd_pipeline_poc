# 報告二：`work_orders` 完整使用盤點

**日期：2026-06-20　｜　Partner AI Agent → Russell Hung**
**對應：6/19 裁示 §二（重提 6/18 請求）**

> 本報告只回報事實，不提任何處理／重構方案。已逐一掃過 codebase 全部讀寫點 + DB 端引用（RPC / view / trigger / FK / RLS），求完整不遺漏。

---

## 摘要（三個問題的直接回答）

1. **work_orders 在系統裡有多少接點？** 跨 7 個模組共 30+ 處 codebase 讀寫點 + 2 個 DB 函數 + 2 個 trigger + 4 張表 FK 參照 + 4 條 RLS policy。詳見 §三、§二。
2. **除了已修的場景一，還有沒有 work_orders / repair_orders 誤用？** 有。**2 處已確認現存問題**（會計下拉 `wo_no` 欄名錯、補貨函數 `'open'` 狀態值對不到）、**3 處疑似待確認**。但都**不是**「id 空間用錯」那種等級的問題——id 空間誤用只有場景一那一處，已修。詳見 §五。
3. **work_orders 和 repair_orders 是否功能重複？** **不重複，各自不可替代。** `work_orders` 是「倉管領料體系」的驅動實體；`repair_orders` 是「售後業務流程」的驅動實體。兩套體系刻意分開，`work_orders.repair_order_id` 是接合鍵。詳見 §六。

---

## 一、兩表本質差異（先建立認知基準）

| 面向 | `work_orders` | `repair_orders` |
|------|--------------|-----------------|
| 資料量 | 68 筆 | 178 筆 |
| 單號 | `ro_no`（RO-YYYYMMDD-NNNNNN，code 自動產） | `ro_code`（P1-P2-YYYY-NNN，prefix 組合） |
| 狀態值 | **英文 enum**：draft/dispatched/in_progress/qc/done/closed/cancelled | **中文**：進行中／已關單… |
| 金額 | 自帶 `parts_amount`/`labor_amount`/`external_amount`/`discount_amount`/`total_amount` | `lines_subtotal`/`lines_total`（由 `repair_order_lines` 加總） |
| 明細表 | `work_order_items`（4 種 kind） | `repair_order_lines`（part/labor 2 種 kind） |
| 業務欄位 | 較精簡 | `prefix_p1/p2`、`pre_inspection_id`、`fee_allocation`、`warranty_status_snapshot`、`sa_id`、`priority` 等 |
| 接合鍵 | `repair_order_id`（FK→repair_orders，68 筆中僅 5 筆有值、63 筆 NULL） | — |

兩表 status 一個英文 enum、一個中文，是它們**來自不同體系**最直接的證據。

---

## 二、DB 端引用

### 2.1 哪些表 FK 指向 `work_orders`

| 參照表 | 欄位 | 說明 |
|--------|------|------|
| `inspection_records` | `work_order_id` | 巡檢記錄綁工單 |
| `service_appointments` | `work_order_id` | 預約回填工單 |
| `stock_issues` | `ro_id` | **領料單的工單欄位**（FK = `stock_issues_ro_id_fkey`，指 work_orders.id） |
| `work_order_items` | `work_order_id` | 工單明細行 |

### 2.2 `work_orders` 自身外鍵

`advisor_id`→employees、`lead_technician_id`→employees、`appointment_id`→service_appointments、`customer_id`→customers、`vehicle_id`→customer_vehicles、`subsidiary_id`→subsidiaries、**`repair_order_id`→repair_orders**。

### 2.3 DB 函數（RPC）

| 函數 | 如何用 work_orders |
|------|-------------------|
| `sync_gsi_work_order()` | INSERT/UPDATE/DELETE 時同步 `global_search_index`（entity_type='work_order'） |
| `calculate_replenishment()` | CTE JOIN `work_order_items` + `work_orders`，篩 `wo.status IN ('open','dispatched')` 算已分配量與需求 ← **見 §五 #4：'open' 不是合法狀態值** |

### 2.4 Trigger

`work_orders_set_updated_at`（維護 updated_at）、`work_orders_sync_gsi`（同步全站搜尋）。

### 2.5 View：**無**。RLS：4 條（core5_work_orders_person_{select,insert,update,delete}，按 brand + 本人 advisor/technician/created_by 隔離）。

---

## 三、Codebase 所有讀寫點（分模組，逐處列出）

### 3A. 後台工單 CRUD（主入口）
| 檔案:行 | 讀/寫 | 用途 |
|---|---|---|
| `src/lib/master-data/queries.ts:648` | 讀 | `listWorkOrders()` 列表（status/customer/vehicle 篩選 + 分頁） |
| `src/lib/master-data/queries.ts:674` | 讀 | `getWorkOrderById()` |
| `src/lib/master-data/workorder-actions.ts:175` | 寫 INSERT | `createWorkOrderAction()` |
| `src/lib/master-data/workorder-actions.ts:251` | 寫 UPDATE | `updateWorkOrderAction()`（items 全刪重建） |
| `src/lib/master-data/workorder-actions.ts:307` | 寫 DELETE | `deleteWorkOrderAction()` |
| `src/lib/master-data/workorder-actions.ts:215` | 寫 DELETE | create 失敗回滾刪主檔 |

### 3B. 領料（repair-pick）
| 檔案:行 | 讀/寫 | 用途 |
|---|---|---|
| `src/domain/issues.ts:590` | 讀 | `getRepairPickFormData()` 撈可領料工單清單（status in draft/dispatched/in_progress/qc） |
| `src/domain/issues.ts:703` | 讀 | `listPendingPartsWorkorders()` 待領料橫幅 |
| `src/domain/issues.ts:908` | 讀 | `previewRepairPick()` 讀 `repair_order_id`（識別對應 RO 以排除自己預留） |
| `src/domain/issues.ts:1173` | 讀 | `pickRepairOrder()` 確認出庫再讀 id/ro_no/customer_id/repair_order_id |
| `src/domain/issues.ts:1382–1413` | 寫 UPDATE | 場景二：出庫後回寫 `parts_amount` + `total_amount` |
| `src/lib/parts/actions/index.ts:80` | 讀 | `issueForRepair()`（舊版領料）讀工單 |
| `src/lib/parts/actions/index.ts:197` | 寫 INSERT | 舊版建 `stock_issues`（`ro_id=wo.id`，source_doc_type='work_order'） |

### 3C. TL（試乘／借用）橋接
| 檔案:行 | 讀/寫 | 用途 |
|---|---|---|
| `src/domain/work-orders.ts:68` | 讀 | `getWorkOrderWithRepairOrder()` JOIN repair_order |
| `src/domain/work-orders.ts:157` | 讀 | `syncTlWorkOrderBridge()` 依 repair_order_id 查是否已有橋接工單 |
| `src/domain/work-orders.ts:169` | 寫 INSERT | 建橋接工單（external_source='tl_bridge'、status='dispatched'、repair_order_id=TL RO） |
| `src/domain/work-orders.ts:396` | 讀 | `getTlOutstandingLoanStatusBatch()` 批讀橋接工單 |
| `src/lib/aftersales/repair-order-actions.ts:441` | 寫 UPDATE | 建 RO 後經 appointment_id 反查 work_order 回填 repair_order_id |
| `src/lib/aftersales/ro-handoff-actions.ts:161` | 寫 UPDATE | 接待轉維修移交時經 appointment_id 回填 repair_order_id |

### 3D. 售後客戶 / 回廠統計（全為讀）
| 檔案:行 | 用途 |
|---|---|
| `src/domain/aftersales-customer-base.ts:150` | 各客戶 work_orders 算回廠次數／最後回廠日 |
| `src/domain/aftersales-customer-base.ts:287` | 本月進廠數 KPI |
| `src/domain/aftersales-customer-base.ts:986` | 客戶詳情補撈工單（帶 SA 名） |
| `src/domain/aftersales-customer-base.ts:1215` | 售後電訪 call task 關聯工單 |
| `src/domain/crm-aftersales-dormant.ts:138` | 客戶最近工單 opened_at → 推 days_overdue |
| `src/domain/crm-aftersales-dormant-recalc.ts:108` | 重算流失狀態撈客戶所有工單 |
| `src/domain/customers.ts:114` | 客戶詳情頁撈工單 |
| `src/domain/store-overview.ts:263` | 門市 KPI：本月台次／均額／SA 排行 |

### 3E. 庫存 / RAG / 全站搜尋 / 會計
| 檔案:行 | 讀/寫 | 用途 |
|---|---|---|
| `src/lib/ai/rag-serialize.ts:724` | 讀 | RAG 序列化（含 customer/vehicle JOIN） |
| `src/lib/ai/rag-registry.server.ts:35` | 設定 | RAG registry entity 定義 |
| `src/lib/search/global-search-registry.ts:254` | 設定 | 全站搜尋 entity 定義 |
| `src/lib/accounting/queries.ts:499` | 讀 | 會計下拉撈工單 ← **見 §五 #2：select `wo_no` 欄名錯** |

### 3F. 料件 / CRM
| 檔案:行 | 讀/寫 | 用途 |
|---|---|---|
| `src/domain/items.ts:538` | 讀 | 料件詳情「領料歷史」tab（stock_issue_lines JOIN work_orders via stock_issues.ro_id） |
| `src/domain/sales-call-tasks.ts:439` | 讀 | 售後 call task 附加進廠資訊條 |

---

## 四、`inventory_reservations` 對接事實（場景一根因確認）

- `inventory_reservations.ro_id` 的**語意是 `repair_orders.id`，不是 `work_orders.id`**。DB 層沒有 FK 約束，靠程式碼紀律維持。
- 場景一 bug（已修，`issues.ts:1425–1426` 有明確註解）：此前 consume 用 `work_order.id` 比對 `ro_id` → id 空間不符、永遠 match 不到 → 預留從不被扣抵。
- 修正後：consume（`issues.ts:1427–1444`）與排除自己預留（`issues.ts:990–991`）都改用 `repairOrderId`（= `work_orders.repair_order_id` → repair_orders.id）比對，**空間一致、正確**。

---

## 五、誤用風險清單

### 已確認誤用 — 已修
| # | 位置 | 說明 | 狀態 |
|---|---|---|---|
| 1 | `issues.ts`（修正前） | 預留 consume 用 work_orders.id 比對 reservations.ro_id（實為 repair_orders.id），永遠 match 不到 | **已修**（場景一） |

### 已確認問題 — 現存（非 id 空間誤用，但是 work_orders 接點的真實 bug）
| # | 位置 | 說明 |
|---|---|---|
| 2 | `src/lib/accounting/queries.ts:499` | select `wo_no`，但表欄位名是 **`ro_no`**（沒有 wo_no）。Supabase 對不存在欄位靜默回 null → 會計下拉的工單號全 null。所幸 `queries.ts:568` 有 fallback `r.wo_no ?? r.id.slice(0,8)`，症狀被遮住，但顯示的是 id 截段而非真單號 |
| 3 | `src/domain/work-orders.ts:88`（`listIssuesForWorkOrder`）| 參數命名 `roId` 但傳入的其實是 `work_orders.id`；內部 `.eq("ro_id", roId)` 查 stock_issues **語意正確**（stock_issues.ro_id FK 指 work_orders.id），只是**命名 `roId` 會誤導**讀者以為是 repair_orders.id ← 認知不一致的命名雷，非執行 bug |

### 疑似誤用 — 待確認
| # | 位置 | 說明 | 待確認點 |
|---|---|---|---|
| 4 | `calculate_replenishment()` DB 函數 | CTE `wo.status IN ('open','dispatched')` —— work_orders 的合法 status **沒有 'open'**（只有 draft/dispatched/…），'open' 永遠 match 不到 → draft 狀態工單的料件不被算進補貨需求（allocated / gross_demand 偏低） | 'open' 是舊版遺留還是打算對應 draft？ |
| 5 | `src/lib/parts/actions/index.ts:80–197`（`issueForRepair` 舊版領料）| 建 stock_issues 時 `ro_id=wo.id`（正確），但**沒有**抓 repair_order_id 去 consume inventory_reservations → 走這條路預留不會被扣 | `issueForRepair` 是否已被 `pickRepairOrder`（issues.ts 版）完全取代？若仍有呼叫方，預留扣抵仍是舊 bug |
| 6 | `src/domain/issues.ts:184`（`listIssues`）| `from("work_orders").select("id, ro_no").in("id", woIds)`，woIds 來自 stock_issues.ro_id（正確）；但 C-28 路徑（`pickForRepairOrderAddon`）建的 stock_issues 是 `ro_id=null` + `source_doc_id=repair_orders.id`，這些單在 listIssues 時 ro_no 會是 null | C-28 出庫的單在出庫列表顯示是否正常？ |

### 確認正確（佐證 id 空間誤用只剩場景一那一處）
`issues.ts:990–991`（排除預留）、`issues.ts:1427–1444`（consume）、`work-orders.ts:157–161`（TL 橋接查詢）、`repair-order-actions.ts:441–445`（橋接回填）、`parts/actions/index.ts:197`（舊版建 stock_issues）、`work-orders.ts:98`（listIssuesForWorkOrder 查詢）—— 以上 6 處 id 空間皆比對正確。

---

## 六、功能重複性評估：不重複，各自不可替代

**資料分布**：work_orders 68 筆（closed 41 / dispatched 16 / in_progress 11），其中**僅 5 筆**有 repair_order_id（TL 橋接）、**63 筆無**（純 work_orders 工單）；repair_orders 178 筆。

| 面向 | `work_orders` | `repair_orders` |
|---|---|---|
| 建立入口 | 後台 `/admin/master-data/work-orders` 手動建；TL 橋接自動建 | 售後流程 `/parts/aftersales`，須先建 pre_inspection 再 handoff |
| 倉管出庫驅動 | **是**（`stock_issues.ro_id` FK 直接接 work_orders.id；repair-pick 清單只讀 work_orders + work_order_items） | 否（C-28 addon 出庫 ro_id=null、source_doc_id=repair_orders.id） |
| 預留消耗 | 間接（經 repair_order_id 找到 RO 再 consume） | 直接（reservations.ro_id = repair_orders.id） |
| 下游 | global_search_index 同步、inspection_records 綁定、補貨需求計算 | pre_inspections → ro_checkouts → final_inspections → pickup_notifications → ro_handoffs → complaints → damage_disputes → warranty_claims |
| 生命週期 | 獨立或橋接 RO | 完整售後業務流程 |

**根本原因**：
- `work_orders` = **倉管領料體系的驅動實體**。所有領料／出庫（`stock_issues.ro_id` 的 FK）接這裡；TL 借料必須先有 work_orders 才會進倉管領料清單。
- `repair_orders` = **售後業務流程的驅動實體**。所有售後 domain（客訴、保固、結帳、技師工作站、預檢）只認 repair_orders。
- `work_orders.repair_order_id` 是讓兩套體系互相對應的**接合點**，不是用來合併的——它 63/68 為 NULL，正說明大量 work_orders 是純倉管工單、根本不對應任何 RO。

**結論**：兩表不是冗餘，是兩個不同子系統各自的主表，靠一個 nullable 接合鍵橋接。要合併會同時打斷「倉管領料 FK 鏈」與「售後業務流程鏈」，不是 drop 一張表能解的。

---

## 七、本報告邊界

以上為事實盤點。§五 列出的 #2/#4（已確認問題）與 #5/#6（疑似待確認）是順手掃出的 work_orders 接點瑕疵，**本報告不含修法**；若要處理，另開工項。場景一的 id 空間誤用已修且為唯一一處該等級問題。

---

*DealerOS 機密文件　｜　Partner AI Agent　｜　2026-06-20*
