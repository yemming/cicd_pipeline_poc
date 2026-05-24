# 提案：7 個跨模組自動化 Hook（Phase 1 結構分析）

> 來源：第十一輪 Batch C1-C3，服務 E2E 測試腳本 CROSS-01 ~ CROSS-06 + 端到端鏈（建客戶→交車→保固→工單→舊件→CRM）
> 日期：2026-05-24
> 階段：Phase 1（結構分析 → 架構提案 → 拍板點）— **僅產 proposal，不 apply migration、不接 hook、不寫 src/ code**
> 適用 brand：售後 / 銷售現有慣例（主 Ducati）；CROSS fixture / demo 一律 `brand_id='indian'`（雙 brand RLS 一定做）
> 姊妹提案（強依賴）：
> - `docs/proposals/feature-inventory-reservations-phase1.md`（**B3 備件預留新表 — #4 / #5 直接依賴此表拍板**）
> - `docs/proposals/feature-aftersales-final-check-phase1.md`（竣工複檢 — #6 觸發來源）
> - `docs/proposals/feature-crm01b-aftersales-customer-base-phase1.md`（CRM 客戶基盤 — #7 同步目標）

---

## 0. 這批 hook 要解的業務問題

DealerOS 各模組目前是「孤島」：建客戶、交車、開工單、舊件登錄、CRM 統計各做各的，跨模組的副作用全靠人手動補。第十一輪的 CROSS 案例要把它們串成**自動化事件鏈**，讓「一個業務動作自動觸發下游動作」，這正是本 repo 「許願 → CI/CD pipeline」哲學在業務層的延伸：**事件驅動、`after()` 非阻塞、副作用集中在 domain helper**。

7 個 hook 都是同一個 pattern：**既有 server action 成功寫入後 → `after()` 非阻塞 → domain helper 做副作用（寫表 / dispatch 通知）**，範本就是 `src/lib/feedback-actions.ts` 的 `createTicket()`（insert 成功 → `after(() => notifications.dispatch(...))`）與 `src/domain/receipts.ts`（`after(() => instantiateTransaction(...))`）。

---

## 1. Phase 1 結構分析 — 7 hook 的觸發點與落點（grep / SQL 實證）

> 全部觸發點都已用 grep `src/` + `information_schema` 校對，**不憑命名猜**。

### 總表 — 觸發點 × 動作 × 落表

| # | 觸發事件 | 觸發 action（實證位置） | 副作用動作 | 寫 / 讀哪張表 | 服務案例 |
|---|---|---|---|---|---|
| **#1** | 建立客戶 | （**待補**）`lib/master-data/customer-actions.ts` / `lib/sales/customer-base-actions.ts`（grep 確認有 insert customers，但**未集中於單一 createCustomer helper**） | 自動產生**回訪任務** | 寫 `call_tasks`（`kind`='sales'\|'aftersales'） | CROSS-05 / 端到端鏈起點 |
| **#2** | 建工單 / 指派 SA | `lib/aftersales/repair-order-actions.ts` `confirmRepairOrderAction`（L82，**已有 `// TODO: after(...)` 預留註解**） | 鎖定該 SA / 防重複指派 | 讀 `repair_orders.sa_id`（uuid，FK→`employees`） | CROSS-01 |
| **#3** | 交車（訂單 fulfilled） | `src/domain/sales-orders.ts` `setSalesOrderStatus(id,'fulfilled')`（L468；**已內嵌中古車同步 hook，是現成的「狀態→多表副作用」範本**） | 啟動**保固**（保固起算 + 設保固到期） | 寫 `customer_vehicles.warranty_until`（date）/ 建車輛 | 端到端鏈（交車→保固→#6 舊件） |
| **#4** | 工單零件**庫存不足** | （**待 B3**）addon agreed 後 reserve 失敗 / 可用量 < 需求 | RO 標**待料** + 建預留 | 寫 `inventory_reservations`（**B3 新表**）+ RO 標待料（**status 無此值，見 delta**） | CROSS-02 |
| **#5** | 補貨 / 調撥到貨 | `src/domain/transfers.ts` `receiveTransfer`（L1184，status→`received`） | **解除待料** + 通知工單可施工 | 改 `inventory_reservations`（release）+ 接 `parts-alert-work-order-loop` | CROSS-03 |
| **#6** | 竣工複檢通過 | `lib/aftersales/final-inspection-actions.ts` `signAction`（L200，status→`passed`）/ `completeAction`（L283，status→`completed` + RO→待結帳） | **舊件登錄**（usedpart） | 呼叫既有 `registerOldPart`（`src/domain/warranty.ts` L608 → 寫 `old_parts`，接受 `ro_id`） | CROSS-04 |
| **#7** | 工單關閉 | `lib/aftersales/repair-order-actions.ts` `updateRepairOrderStatusAction`（L175，status→`已關單`）/ `final-inspection-actions.completeAction`（RO→待結帳→關單） | 同步 **CRM 客戶基盤**（進廠次數 / 上次入廠日 / 滿意度觸發） | 讀寫 `work_orders` + 觸發 NPS（`call_tasks` / `nps_responses`） | CROSS-06 |

### 1.1 關鍵實證發現（探查校正 — 避免後續落地踩雷）

1. **#1 沒有單一 `createCustomer` domain helper**：客戶 insert 散在 `lib/master-data/customer-actions.ts`、`lib/sales/customer-base-actions.ts`、`domain/ai-business-cards.ts`（名片 OCR 建客）、`domain/crm-sync.ts`（外部同步）。`src/domain/customers.ts` 只有 `listCustomersForAdmin` / `getCustomerDetail`（純讀）。→ **要接 #1，得先決定「在哪一個建客入口接 hook」或新增集中的 `customers.createCustomer()` facade**（見拍板點 1）。

2. **#3 保固落點 = `customer_vehicles.warranty_until`（date），不是 `warranty_claims`**：
   - `warranty_claims` / `warranty_claim_lines` 是**保固索賠單**（向原廠 OEM 求償，含 `applied_amount` / `approved_amount` / `oem_reference_no`），是售後維修階段才開，**不是交車起算的保固紀錄**。
   - `customer_vehicles` 才是車輛主檔，已有 `warranty_until`（date）+ `purchase_date` + `vin` + `model_id`。交車啟動保固 = **建 / 更新該客戶的 customer_vehicles，設 `warranty_until = 交車日 + 保固期`**。
   - ⚠️ 沒有 `vehicle_warranties` 表（task 假設的表名不存在）；保固期長度沒有現成欄位（`vehicle_models` 沒查到保固月數欄位 → 見拍板點 2）。

3. **#4 RO 沒有「待料」status 值**：`repair_orders.status` 只 5 種中文（`進行中` / `維修中` / `待結帳` / `已關單` / `已取消`，見 `repair-orders.constants.ts` `RO_STATUS_OPTIONS`）。**「待料」是新狀態** → 要嘛 (a) 加進 `RO_STATUS_OPTIONS` + CHECK，要嘛 (b) 用 `metadata.waiting_parts = true` flag 不動 status enum（見拍板點 3）。

4. **#4 / #5 完全依賴 B3 `inventory_reservations` 新表**：可用量扣減 / 解除 / 待料判斷的 ledger 在 B3 提案，**本提案的 #4 / #5 不能先於 B3 拍板落地**。CROSS-03 解除後的「通知工單可施工」B3 已指定接既有 `src/domain/parts-alert-work-order-loop.ts`，本提案沿用。

5. **#6 `registerOldPart` 已現成、且接受 `ro_id`**：`src/domain/warranty.ts` 的 `registerOldPart(input)` 寫 `old_parts`（status=`in_storage`、自動算 `expiry_date`、需 `USEDPART_OPS` 權限）。`final_inspections` 有 `repair_order_id` 連回 RO。→ #6 = 竣工通過後帶 `ro_id` + 該 RO 的保固索賠零件呼叫 `registerOldPart`。**幾乎零新 code**，只缺「複檢通過 → 自動觸發」這條線。

6. **#7 CRM 客戶基盤讀 `work_orders`（不是 `repair_orders`）**：`src/domain/aftersales-customer-base.ts` 的 `visit_count` / `last_visit_at` 是**即時 count `work_orders`**（`COUNT` + `MAX(opened_at)`），**沒有 stored 統計欄位**。→ #7「同步進廠次數」有兩種解讀：(a) 既然是即時算的，工單關閉根本不用「同步」（下次讀自然更新）；(b) 真正要 hook 的是「關單 → 觸發滿意度 NPS 任務」這個副作用。**`work_orders` 與 `repair_orders` 是兩套並存的表**（customer-base 讀 work_orders、售後維修流程寫 repair_orders）→ 見拍板點 6 的資料源對齊問題。

### 1.2 既有 `after()` + dispatch + instantiateTransaction 範本（直接抄）

```ts
// src/domain/receipts.ts（既有，會計事件範本）
after(async () => {
  try {
    const res = await instantiateTransaction(TX_TYPES.XXX, ctx, { autoPost: true });
    // ...
  } catch (e) { console.error("[receipts] tx 失敗（不影響主流程）", e); }
});

// src/lib/feedback-actions.ts（既有，通知範本）
after(async () => {
  try {
    await notifications.dispatch({ code: "feedback_ticket.created", payload: {...} });
  } catch (e) { console.error("[feedback] dispatch 失敗（不影響本次建單）", e); }
});
```

→ 7 個 hook 全部照這個 `after(async () => { try { ... } catch { console.error } })` 模板，**副作用失敗不可炸主流程**。

---

## 2. Phase 2 架構提案

> 共通原則：**UI / action / component 禁止直連 supabase（天條）**；副作用一律走 `@/domain/*` helper；hook 用 `after()` 非阻塞 + try/catch。下面每個 hook 的「helper 拆分」都是這個原則的落地。

### Hook #1 — 建客戶 → 自動產生回訪任務

**事件圖**
```
建客 action（customer-actions / customer-base-actions / ai-business-cards）
   │ insert customers 成功
   ▼ after()
@/domain/sales-call-tasks.ts → createFollowUpTask({ customer_id, kind, due_date })
   ▼
INSERT call_tasks (kind='sales'|'aftersales', status='pending', customer_id, due_date)
```

**helper 拆分**
- 新增 `createFollowUpTask(input)` 到 `src/domain/sales-call-tasks.ts`（既有檔，目前只有 `get*` 讀取函式 + 寫 `call_tasks`）。內部直連 supabase insert `call_tasks`（單表寫入，Day 1 直連 OK）。
- **#1 的前置**：建客入口太分散 → **建議新增 `src/domain/customers.ts` 的 `createCustomer()` facade**，把散落的 insert 收編成單一入口，hook 只接這一處（見拍板點 1）。

**business_rules**：回訪規則（建客後幾天回訪、哪種 kind、是否啟用）→ **走 `business_rules`，rule_kind='customer_followup'**：
```jsonc
{ "rule_kind": "customer_followup",
  "config": { "enabled": true, "first_followup_days": 7, "task_kind": "sales", "assign_to": "creator" } }
```
理由：「幾天回訪」是量化參數、未來會調，符合架構 §3「量化規則 → business_rules」。POC 可先寫死 7 天，promote 成本低（拍板點 4）。

**冪等 / 防重**：同一 `customer_id` 已有 `status='pending'` 的同 kind 回訪任務 → 不重複建（`createFollowUpTask` 先 `SELECT ... WHERE customer_id AND kind AND status='pending'`，有就 skip）。防「建客 action 被重送兩次」。

---

### Hook #2 — 建工單 / 指派 SA → 鎖定 SA / 防重複指派

**事件圖**
```
confirmRepairOrderAction（lib/aftersales/repair-order-actions.ts L82）
   │ insert repair_orders 成功（已有 TODO after 註解）
   ▼ （同步守門，非 after()——這是「防重」要在寫入前擋）
檢查：該 sa_id 是否已有 active RO 超過上限 / 同車同客已有 open RO
```

⚠️ **#2 與其他 6 個不同：它是「寫入前的守門 / 防重」，不是「寫入後的副作用」**，所以**不該用 `after()`**（after 是寫完才跑，擋不住重複）。應在 `confirmRepairOrderAction` insert **之前**或用 DB 約束擋。

**helper 拆分 + 防重做法（三選一，拍板點 5）**
- (a) **DB partial unique index**（最穩，照 `sales_orders_used_vehicle_active_uniq` 慣例）：`CREATE UNIQUE INDEX ... ON repair_orders (vehicle_id) WHERE status IN ('進行中','維修中')` → 同車不能有兩張 open RO，撞 23505 翻人話。
- (b) **helper 層先查再寫**：`confirmRepairOrderAction` insert 前 `SELECT ... WHERE vehicle_id AND status IN (open)`，有就回 `{ ok:false, error:'此車已有進行中工單' }`。
- (c) **SA 負載鎖**：查該 sa_id active RO 數 > 業務規則上限就擋（規則走 business_rules `rule_kind='sa_workload_limit'`）。

**business_rules**：SA 同時可接工單上限 → `rule_kind='sa_workload_limit'` config `{ max_active_ro_per_sa: 10 }`（拍板點 5 決定要不要做負載鎖）。

**冪等**：DB unique index 是最強冪等保證（重送 insert 直接被擋）。

---

### Hook #3 — 交車（sales_orders fulfilled）→ 啟動保固

**事件圖**
```
setSalesOrderStatus(id, 'fulfilled')（src/domain/sales-orders.ts L468）
   │ update sales_orders status='fulfilled', fulfilled_at=now() 成功
   │ （既有：used_vehicle_id 存在時同步 used_car_inventory.status='sold'）
   ▼ after()  ← 新增這段
@/domain/customers.ts → startVehicleWarranty({ sales_order_id, customer_id, model_id, vin, delivered_at })
   ▼
UPSERT customer_vehicles（建車輛 or 更新）+ 設 warranty_until = delivered_at + 保固期
```

**helper 拆分**
- 新增 `startVehicleWarranty(input)`（放 `src/domain/customers.ts` 或新 `src/domain/vehicle-warranty.ts`）。內部：依 `sales_orders` 帶出的車輛資訊 upsert `customer_vehicles`、計算並寫 `warranty_until`。跨「讀 sales_order 明細 + upsert customer_vehicles」→ 內部可走 RPC 或單純兩段 await（POC 可後者）。
- 接點：`setSalesOrderStatus` 的 `if (status === 'fulfilled')` 分支結尾 `after(() => startVehicleWarranty(...))`。**這個函式本來就是「狀態→多表副作用」範本**（中古車同步已內嵌），保固 hook 完美貼合。

**business_rules**：保固期長度（不同車型不同保固月數）→ 候選 `rule_kind='vehicle_warranty_term'` config `{ default_months: 24, by_model: {...} }`；**但保固期更可能是 `vehicle_models` 的主檔欄位**（穩定、報表會用 → 該 typed column，不是 business_rules）。見拍板點 2：保固期來源是 (a) vehicle_models 新增 `warranty_months` typed 欄位 /(b) business_rules /(c) 銷售合約 metadata。

**冪等 / 防重**：保固**不可重複啟動**。`startVehicleWarranty` 先查該 `sales_order_id` 是否已啟動過（`customer_vehicles.metadata->>'warranty_source_order' = sales_order_id` 或一張 `vehicle_warranties` 對照），已啟動就 skip。防「fulfilled 被切兩次」或「取消後重新 fulfilled」重複起算。

**會計事件分析**：交車本身的收入認列 / COGS 由既有銷售交車流程處理（不在本 hook）。**保固啟動無會計事件**（保固是負債揭露 / 純資料，不立即動帳；保固維修發生時才在 #6 / warranty_claims 動帳）。

---

### Hook #4 — 工單零件庫存不足 → RO 標待料 + 建預留

> ⚠️ **強依賴 B3 `inventory_reservations`。本 hook 不可先於 B3 拍板落地。**

**事件圖**
```
addon agreed（repair_order_addon customer_decision='agreed' 含 parts）
   │ 呼叫 B3 inventory-reservations.reserve(...)
   ├─ 可用量足 → reserve active，正常
   └─ 可用量 < 需求 → ① 仍建 active 預留（負可用量 / 待補）
                        ② after() → RO 標待料 + 進 work-order loop（缺料告警）
   ▼
@/domain/repair-orders.ts → markWaitingParts(roId, { reason, shortage_items })
```

**helper 拆分**
- 預留動作走 B3 的 `src/domain/inventory-reservations.ts` `reserve()`（B3 已定義）。
- 新增 `markWaitingParts(roId, ctx)` 到 `src/domain/repair-orders.ts`：標記 RO 待料 + 寫缺料明細到 `parts-alert-work-order-loop`（既有缺料工單回圈）。

**「待料」狀態落點（拍板點 3）**：
- (a) 加 `'待料'` 進 `RO_STATUS_OPTIONS` + DB CHECK（語意清楚、看板能篩，但動 enum + 既有 status 機）。
- (b) `repair_orders.metadata.waiting_parts = { since, shortage_items }`（不動 enum，但看板要另外判 metadata）。
- **傾向 (b)**：待料是「附加標記」不是主狀態（RO 可能「維修中 + 部分待料」），用 metadata flag 更貼合，且不破壞既有 5 狀態機。

**business_rules**：是否自動標待料 / 缺料告警階層 → 沿用 B3 的 `rule_kind='inventory_reservation_alert'`，本 hook 不另開。

**冪等**：`reserve()` 由 B3 保證不重複建（B3 拍板點）。`markWaitingParts` 對同 RO 同 item 已標待料 → 更新而非新增 loop entry。

---

### Hook #5 — 補貨 / 調撥到貨 → 解除待料 + 通知工單可施工

> ⚠️ **強依賴 B3 `inventory_reservations`。**

**事件圖**
```
receiveTransfer（src/domain/transfers.ts L1184，status→'received'）
   │ 入庫成功、qty_received 入帳
   ▼ after()
@/domain/inventory-reservations.ts → listActiveReservationsAwaiting(item_id, warehouse_id)（B3）
   │ 找出在等這個零件的 active 待料預留
   ▼
release(reservationId, 'transfer_arrival')（B3）→ 可用量回補
   ▼
@/domain/parts-alert-work-order-loop.ts → 通知該工單可施工（既有 loop，resolveWorkorderLoopEntryAction）
   ＋（可選）notifications.dispatch 推 LINE 給 SA / 技師
```

**helper 拆分**
- 入庫接點：`receiveTransfer` 結尾 `after(() => releaseWaitingForItem(item_id, warehouse_id))`。**補貨入庫**也有對應 action（`replenishment` / 進貨 GRN）→ 同樣接 after()（拍板點 7：補貨入庫的 action 路徑要確認，本輪先盤 transfer 收貨）。
- 解除 + 通知邏輯封裝成 B3 helper（`release()` 內部副作用接 work-order loop），本 hook 只負責「入庫 → 呼叫 release」。

**business_rules**：`auto_release_on_restock` / `notify_work_order_loop` → 沿用 B3 `rule_kind='inventory_reservation_alert'` config。

**冪等**：一筆 reservation release 後 status='released'，重入查 active 時自然查不到（不會重複 release / 重複通知）。

---

### Hook #6 — 竣工複檢通過 → 舊件登錄

**事件圖**
```
signAction（lib/aftersales/final-inspection-actions.ts L200，status→'passed'）
   或 completeAction（L283，status→'completed'，RO→待結帳）
   │ 複檢通過成功
   ▼ after()
@/domain/warranty.ts → registerOldPart({ ro_id, item_id, oem_directive, entry_date, ... })（既有）
   ▼
INSERT old_parts（status='in_storage'，自動算 expiry_date）
```

**helper 拆分**
- **零新 helper** — `registerOldPart` 已存在（`src/domain/warranty.ts` L608）且接受 `ro_id`。只需在 `signAction` / `completeAction` 結尾 `after()` 呼叫。
- 缺的是「哪些零件要登錄」的判斷：複檢通過的 RO 若是保固索賠（prefix `WC`）、且有換下的舊件 → 該登錄。需從 RO lines / addon 帶出 `item_id` + 原廠處置指示 `oem_directive`。**這段「RO → 待登錄舊件清單」可能要新 helper `listOldPartCandidatesByRo(roId)`**（拍板點：自動全登 vs 人工挑）。

**business_rules**：哪些 RO prefix / 零件類型要強制舊件登錄 → 候選 `rule_kind='old_part_registration'`；但 POC 可先「保固索賠 RO（WC 開頭）才觸發」寫死。

**冪等 / 防重**：`old_parts` 對 `(ro_id, item_id, serial_no)` 應有 unique 或 `registerOldPart` 先查重（同 RO 同件已登錄就 skip），防複檢被簽兩次 / sign→clearSign→sign 重複登錄。`registerOldPart` 目前靠 `wc_no` 23505 擋，但 wc_no 是自動產生的流水號 → **要另加「同 ro_id + item_id 已登錄」檢查**（落地補）。

**會計事件分析**：舊件登錄本身**無會計事件**（舊件入庫是資產分類調整 / 待原廠處置，不立即動帳）；真正動帳是 warranty_claims 向原廠求償收款時。

---

### Hook #7 — 工單關閉 → 同步 CRM 客戶基盤（進廠 / 滿意度）

**事件圖**
```
updateRepairOrderStatusAction(roId, '已關單')（lib/aftersales/repair-order-actions.ts L175）
   或 completeAction → RO 待結帳 → 後續結帳關單
   │ 關單成功
   ▼ after()
@/domain/crm-sync.ts → onWorkOrderClosed({ customer_id, ro_id, closed_at })
   ├─ 進廠次數 / 上次入廠日：customer-base 是即時 count work_orders（見 §1.1.6）
   │    → 若維持即時算：不需同步（下次讀自然更新）；若要 stored：寫 customers.metadata 統計
   └─ 滿意度觸發：建 NPS 回訪任務（call_tasks kind='aftersales'）或推 NPS 問卷
   ▼
INSERT call_tasks（NPS）/ 或 notifications.dispatch（NPS 問卷連結）
```

**helper 拆分**
- 新增 `onWorkOrderClosed(input)` 到 `src/domain/crm-sync.ts`（既有檔，處理外部 CRM 同步）或 `src/domain/aftersales-customer-base.ts`。
- 滿意度觸發 reuse `createFollowUpTask`（#1 同一個 helper，kind='aftersales' + survey_template）。

**business_rules**：關單後幾天觸發 NPS、哪種工單觸發、滿意度門檻 → `rule_kind='aftersales_nps_trigger'` config `{ enabled, days_after_close: 1, ro_prefix_filter: [...], send_nps_link: false }`。

**冪等**：同 ro_id 已觸發過 NPS → 不重複（查 `call_tasks WHERE metadata->>'source_ro' = roId AND kind='aftersales'`）。防關單被切兩次。

**即時 vs 批次（拍板點 6）**：進廠統計目前即時算 → 不需 after()；要 hook 的只有「NPS 觸發」這個真副作用。但若日後 customer-base 改 stored 統計（效能），就需要 after() 同步。**`work_orders` vs `repair_orders` 雙表並存**是更根本的對齊問題 — #7 關的是 `repair_orders`（售後流程主表），但 CRM 進廠數讀 `work_orders` → **若兩表不同步，關 repair_order 不會讓 work_orders count 變動**（拍板點 6）。

**會計事件分析**：關單→結帳的收入認列由既有結帳流程（`ro-checkouts`）處理，**不在本 hook**；CRM 同步 / NPS 無會計事件。

---

## 3. 依賴關係與落地批次建議

### 3.1 依賴 B3 vs 可獨立

| Hook | 依賴 B3（inventory_reservations）？ | 可獨立落地？ | 新表需求 |
|---|---|---|---|
| #1 建客→回訪 | ❌ 不依賴 | ✅ 可獨立 | 無（用既有 call_tasks） |
| #2 SA 鎖定/防重 | ❌ 不依賴 | ✅ 可獨立 | 可選 1 個 partial unique index |
| #3 交車→保固 | ❌ 不依賴 | ✅ 可獨立 | 無（用既有 customer_vehicles）；保固期來源待拍板 |
| #4 缺料→待料+預留 | ✅ **強依賴** | ❌ 需 B3 先拍板 | B3 表 + RO 待料標記 |
| #5 到貨→解除待料 | ✅ **強依賴** | ❌ 需 B3 先拍板 | 無新表（用 B3） |
| #6 複檢→舊件 | ❌ 不依賴 | ✅ 可獨立 | 無（registerOldPart + old_parts 都現成） |
| #7 關單→CRM/NPS | ❌ 不依賴 | ✅ 可獨立 | 無（call_tasks）；work_orders/repair_orders 對齊待拍板 |

### 3.2 建議落地順序（最小可驗優先）

1. **第一波（零新表、CROSS 能綠）**：#6（幾乎現成）、#3（保固，貼合既有 setStatus 範本）、#1（回訪，單表）、#7-NPS-only。
2. **第二波（接 B3）**：B3 拍板落地後 → #4 → #5（CROSS-02/03 串起來）。
3. **守門類**：#2（DB index 防重）可隨時做，與其他無依賴。

---

## 4. business_rules 用在哪幾個 hook（彙總）

| Hook | rule_kind | config 主要參數 | POC 可先寫死？ |
|---|---|---|---|
| #1 | `customer_followup` | `first_followup_days`, `task_kind`, `enabled` | ✅ 先寫死 7 天 |
| #2 | `sa_workload_limit` | `max_active_ro_per_sa` | ⚠️ 視是否做負載鎖（拍板點 5） |
| #3 | `vehicle_warranty_term`（**或主檔欄位**） | `default_months`, `by_model` | 傾向走 vehicle_models 主檔欄位（拍板點 2） |
| #4/#5 | `inventory_reservation_alert`（**B3 已定義，沿用**） | `auto_release_on_restock`, `notify_work_order_loop`, `deduct_from_available` | 走 B3 |
| #6 | `old_part_registration` | `trigger_ro_prefix`（WC...） | ✅ 先寫死「WC 開頭才觸發」 |
| #7 | `aftersales_nps_trigger` | `days_after_close`, `send_nps_link`, `enabled` | ✅ 先寫死 |

→ 全走既有 `business_rules` 一張表 + `src/domain/rules.ts` 的 `getApplicableRule(rule_kind, scope)`，**不為任何 hook 新開規則表**（架構天條）。

---

## 5. 失敗處理共通規範（落地必守）

- 7 hook 全部 `after(async () => { try { ... } catch (e) { console.error("[hook-name] 副作用失敗（不影響主流程）", e); } })`。
- `notifications.dispatch` 自帶 retry（Notification Hub），自寫的寫表副作用要自己 try/catch。
- **副作用失敗絕不 rollback 主流程**（交車成功了不能因為保固沒起算就回滾交車）；失敗只記 log，留待人工補 / 之後重跑。
- #2 是例外（守門類）：它是寫入**前**的擋，失敗就直接回 `{ ok:false, error }` 給 UI，不是 after()。

---

## 6. 落地後驗證（Phase 5 用，僅規劃）

1. **CROSS-01（#2）**：對某 SA 連開兩張同車 open RO → 第二張被擋（23505 翻人話）。
2. **CROSS-02（#4）**：addon agreed 但可用量不足 → RO 出現待料標記 + 缺料告警進 work-order loop（需 B3）。
3. **CROSS-03（#5）**：對缺料 item 收貨入庫 → 待料預留 release → work-order loop 通知該工單可施工（需 B3）。
4. **CROSS-04（#6）**：某 WC 工單複檢 sign passed → `old_parts` 自動多一筆（status=in_storage，帶 ro_id）。
5. **CROSS-05 / 端到端鏈（#1 #3）**：建 Indian 客戶 → call_tasks 多一筆回訪；該客戶交車（order fulfilled）→ customer_vehicles 出現 warranty_until。
6. **CROSS-06（#7）**：關某工單 → NPS 回訪任務出現（不重複）。
7. **冪等**：每個 hook 觸發兩次只產一次副作用（重送 / 狀態來回切）。
8. **雙 brand RLS**：Ducati 看不到 Indian 的 call_tasks / customer_vehicles / old_parts。
9. **天條**：新 helper 接點對應 UI / action `grep -rn "@/lib/supabase" src/app/(workspace) src/components` 0 hit。
10. `npx tsc --noEmit` / `npx eslint <touched>` 0 errors。

---

## ⚠️ 等待 Ming 拍板

1. **#1 建客入口收編** — 建客 insert 散在 ≥4 處（master-data / sales / 名片 OCR / crm-sync）。是 (a) **新增 `src/domain/customers.createCustomer()` facade 收編所有入口、hook 只接一處**（乾淨但要改既有 4 處 import）；(b) 只在「主要建客入口」（哪個？sales customer-base？）接 hook，其他入口暫不觸發回訪？**傾向 (a)，但要確認改動範圍可接受。**

2. **#3 保固期長度來源** — 交車後 `warranty_until = 交車日 + ?`。來源是 (a) **`vehicle_models` 新增 `warranty_months` typed 欄位**（穩定、報表用、推薦）；(b) `business_rules` rule_kind='vehicle_warranty_term'；(c) 銷售合約 `sales_orders.metadata`？保固期**目前 DB 沒有任何現成欄位** → 要新增。傾向 (a)。

3. **#4「待料」狀態落點** — (a) 加 `'待料'` 進 `RO_STATUS_OPTIONS` enum + CHECK；(b) `repair_orders.metadata.waiting_parts` flag 不動 enum。**傾向 (b)**（待料是附加標記、RO 可「維修中+部分待料」），請拍板。

4. **回訪 / NPS 規則放 business_rules 還是先寫死** — #1（7 天回訪）、#6（WC 才登舊件）、#7（關單 NPS）的參數，POC 階段是先在 helper 寫死、之後 promote 到 `business_rules`，還是現在就開 business_rules row？**傾向先寫死、留 TODO promote**（POC 簡單為先）。

5. **#2 防重做法 + 要不要做 SA 負載鎖** — 防重用 (a) DB partial unique index（同車 1 張 open RO，最穩）/(b) helper 先查再寫 /(c) SA 負載上限鎖？CROSS-01 的「防重複指派」具體指**同車重複開單**還是**SA 接單超量**？需確認案例語意。**傾向 (a) DB index 防同車重複 open**，SA 負載鎖看 CROSS-01 是否要求。

6. **#7 `work_orders` vs `repair_orders` 對齊** — CRM 客戶基盤進廠數讀 `work_orders`，售後維修流程寫 `repair_orders`，**兩表並存**。關 repair_order 不會自動讓 work_orders count 變。是 (a) #7 只做「NPS 觸發」（進廠數維持即時算、不碰）；(b) 補一條 repair_orders ↔ work_orders 同步？**這是更根本的資料源對齊問題**，#7 本輪建議只做 NPS 觸發、進廠數對齊另案處理。請拍板 #7 範圍。

7. **#5 補貨入庫的 action 路徑** — 本輪已實證 `receiveTransfer`（調撥到貨）。**「補貨入庫」（GRN / 進貨收料）的對應 action 路徑**（`replenishment` 轉 PR → 進貨 GRN？）本輪未深挖 → 落地時要補接同樣的 after()。是否本輪先只做 transfer 到貨、GRN 補貨另波？

8. **哪些 hook 本輪先「最小可驗」（CROSS 綠）哪些先 stub** — 建議第一波 #6 / #3 / #1 / #7-NPS（零新表）；#4 / #5 等 B3 拍板。#2 守門類隨時可做。是否同意此分波？
