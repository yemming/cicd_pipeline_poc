# E2E Demo 驗證測試計畫（第六輪 BDN）

**建立日期**：2026-05-17
**對象**：DealerOS Ducati Taiwan — 第五輪 CRUD/Schema/畫面全部落地後的端到端流程驗證
**輸出物**：5 條黃金路線的執行報告（pass / fail / gap）+ Playwright 錄影
**對應 Notion 卡**：🌙 第六輪 BDN — E2E Demo 驗證 + Playwright 錄影（待建）

---

## 1 · 為什麼這時候做 E2E

第五輪 BDN（Ming 拍板）的 scope 是「**1. 所有 CRUD 完整 / 2. 畫面落地 / 3. Table 落地**」，並明確預告：

> 下下輪才開始測流程（端到端 e2e）

第五輪已交付：5 張新表 + 6 個 detail page + 9 個 CRUD action group + 全站 188 個 file 改動。此時要回答的問題是：

- 各模組「**單頁能跑、跨頁能不能跑**」？
- 哪些流程已經能端到端、哪些卡在某環節？
- **gap 在哪裡** —— 是缺資料、缺串接、還是缺整段流程？

**Ming 的方法論（2026-05-17 對話拍板）**：「**先跑、再看哪些要補**」。Demo script 必須能明確標出「驗收點」，sub-agent 把 fail 寫回卡片給 Ming 拍板要不要補。失敗不阻斷下一條，所有資訊都回報。

---

## 2 · 5 條黃金路線總覽

| # | 路線 | 模組鏈 | 主要表 | 預期已知 gap |
|---|------|--------|--------|---------------|
| **G1** | 新車銷售：接待→交車→開票 | sales/reception/handcard → sales/leads → sales/testdrive → sales/orders → admin/approvals → sales/delivery wizard → einvoice/issue | sales_handcards / sales_leads / sales_orders / deliveries / new_car_inventory / einvoices | **訂單→開票無自動串接**（需手動切到 /einvoice/issue 重填）、簽核流程可能未完整綁定訂單 |
| **G2** | 售後維修：預約→工單→出料→結帳→CSI | service/appointments → service/pi (pre_inspections) → service/workorders → service/workshop 派工 → parts 出料 → service/inspection (final_inspections) → csi/surveys | appointments / repair_orders / work_orders / work_order_items / stock_issues / pre_inspections / final_inspections / survey_templates | **CSI 沒有 responses 表**（只有 survey_templates）、出料能否真的扣庫存待測 |
| **G3** | 進銷存閉環：採購→入庫→出庫→盤點→分錄 | parts/setup/items → parts 採購 → 入庫 stock_receipts → 出庫 stock_issues → 盤點 inventory_adjustments → journal_entries (ERP engine autoPost) | items / stock_items / stock_receipts / stock_issues / inventory_adjustments / journal_entries / stock_movements | ERP engine autoPost 是否真的寫 journal_entries、跨 subsidiary 軸是否正確分流 |
| **G4** | CRM 雙軌追蹤：銷售線索→沉睡客→售後回訪→店長報表 | crm/sales/leads → crm/sales/call-tasks → crm/sales/dormant-leads → crm/aftersales/call-tasks → crm/aftersales/survey-templates → crm/store-report | sales_leads / call_tasks / survey_templates | survey 是否能真正派發 + 收回（responses 表不存在）、店長報表的數據聚合是否到位 |
| **G5** | 中古車置換閉環：評估→簽核→上架→成交 | usedcar/evaluation → admin/approvals/tradein → usedcar/stock → sales/showroom/used-cars → sales/orders（中古車訂單） | used_car_inventory / sales_orders | **evaluations 表不存在**、approvals 機制可能未跨模組綁定、置換後與正車訂單 link 機制 |

**故意排除**：集團/COA/master-data 設定（無 E2E 流程感）、工具模組、POS（獨立 scope）。

---

## 3 · 執行架構

### 3.1 環境

- **Host**：dev server `http://localhost:3001`（Ming 主機、worktree 不另起）
- **Brand**：`indian`（CLAUDE.md MANDATORY、Ming 的 dev session scope）
- **Auth**：Ming 的測試帳號（dev session cookie；過期走 `dev-test-credentials` skill）
- **資料庫**：Supabase Cloud（project: `bykvtcptbirpxyqkfwfl`、本輪不開 branch）

### 3.2 工具選擇

- **Playwright CLI**（不用 MCP）— 用 CLI 才能 headless 跑、錄影、跑完寫報告
  - 為什麼不用 MCP：MCP 適合互動探索；CLI 適合「跑完一條腳本拿結果」
  - 入口腳本：`scripts/e2e-round-6/run-route.mjs` <route-id>（下方 §6 出規格、sub-agent 之一負責建）
- **Sub-agent**：每條路線 1 個 `general-purpose` agent 並行
  - 不用 `Explore`（read-only）、要寫腳本 + 跑
  - 5 個 agent 同時跑、各自獨立 worktree（避免 dev server 衝突 → 共用一個 dev:3000，每 agent 用獨立 browser context）

### 3.3 產出規格（已砍錄影、2026-05-17 Ming 拍板）

每條路線跑完產出：

```
/tmp/e2e-round-6/<route-id>/
  ├── screenshots/          # 只在 fail / gap 步驟拍（pass 步驟不拍、減噪音）
  │   ├── G1-S08-no-invoice-button.png
  │   └── ...
  ├── report.json           # 結構化結果：pass/fail/gap 每個 step（main agent 整合用）
  └── report.md             # 人讀版報告（main agent 整合進 Notion 卡）
```

> Ming 拍板：「**不用錄影、Playwright 確定東西對不對 + 拿資料回來修改就好**」 — 砍掉 recording.webm + trace.zip + 全步驟 screenshot。

`report.json` schema：

```json
{
  "route_id": "G1",
  "route_name": "新車銷售：接待→交車→開票",
  "started_at": "2026-05-17T14:00:00+08:00",
  "finished_at": "2026-05-17T14:08:32+08:00",
  "overall": "partial",  // "pass" | "partial" | "fail"
  "steps": [
    {
      "id": "G1-S01",
      "name": "建立接待手卡",
      "url": "/sales/reception/handcard/new",
      "result": "pass",
      "duration_ms": 4200,
      "screenshot": "screenshots/01-handcard-new.png",
      "notes": "建立 ID xxx、status=open"
    },
    {
      "id": "G1-S08",
      "name": "從訂單觸發開票",
      "result": "gap",
      "gap_type": "missing_integration",
      "gap_description": "訂單詳情頁無『開立發票』按鈕；需手動切到 /einvoice/issue 重填",
      "screenshot": "screenshots/08-order-detail-no-invoice-btn.png"
    }
  ],
  "known_gaps_confirmed": ["訂單→開票無串接"],
  "new_gaps_found": ["..."],
  "needs_fix": [
    { "priority": "P1", "description": "在 sales/orders/[id] 加開票按鈕、預填 ManualIssueInput" }
  ]
}
```

### 3.4 失敗處理

- **步驟 fail（element not found / timeout / server 500）** → 記錄 + screenshot + **繼續下一步**（不 abort）
- **整條路線 fail（dev server 掛 / login 過期）** → abort + 詳細 log + 通知主 agent
- **找不到 selector** → 記為 `selector_drift` gap（不是 bug、是 demo script 與實作 drift）
- **資料缺**（如 G3 需要 items 有 stock 才能走 → 沒 stock）→ 記為 `data_missing` gap、agent 自己 seed 補 Indian brand fixture

---

## 4 · Demo Script — 五條路線

> 以下每條 step 都是 sub-agent 能直接 implement 的指令。Selector hint 是建議起點、agent 看到 DOM 不符可 detective 找對應元素、不要硬撞。

### G1 · 新車銷售：接待→交車→開票

**目標**：模擬一位 Indian 機車展示客從入店到拿到發票的全流程，跨 6 個模組。

**前置 fixture**（agent 跑前確認 / 自 seed）：
- Indian 至少 1 台 `new_car_inventory.status = 'displayed'`
- Indian 至少 1 個有 active 員工（顧問）
- 一張可用測試客戶基本資料（手機 / 姓名 / 身分證）

| Step | 動作 | URL | 預期 | 驗收 |
|------|------|-----|------|------|
| S01 | 建立接待手卡 | `/sales/reception/handcard/new` | form 顯示 / 填客戶資訊 + 意向車款 + HABC=A | `sales_handcards` 新一 row、status='open' |
| S02 | 從手卡轉成 lead | `/sales/reception/handcard/[id]` | 詳情頁有「轉成線索」action | `sales_leads` 新一 row、`source='handcard'` |
| S03 | 線索安排試駕 | `/sales/leads` 或 `/sales/testdrive` | 線索列表可進、試駕排程可建 | 試駕記錄存在（具體表名 sub-agent 摸：可能在 sales_leads metadata 或獨立表） |
| S04 | 建訂單（從線索） | `/sales/orders/new` | wizard 走完、總金額正確 | `sales_orders` 新 row、status='draft'、quote_snapshot 完整 |
| S05 | 訂單送簽 | `/sales/orders/[id]` 點「送簽」 | 跳到簽核中心或顯示 pending | 簽核流是否啟動（觀察 `admin/approvals/order` 列表是否多一筆）|
| S06 | 訂單簽核通過 | `/admin/approvals/order` | 可看到上一步的訂單、點 approve | `sales_orders.status` 推進到 `signed` |
| S07 | 建交車單 + 走 wizard 6 step | `/sales/delivery/new` → `/delivery/ceremony` 等 | wizard 6 子頁、每步存 DB | `deliveries.status` 從 scheduled → pdi_in_progress → ... → delivered；step_completion 6 個 step 都 true |
| S08 | **從訂單觸發開票** | `/sales/orders/[id]` | **預期 gap：無開票按鈕** | 記為 `missing_integration` gap、繼續 S09 |
| S09 | 手動到 einvoice/issue 開立 | `/einvoice/issue` | ManualIssueForm、選 b2c_carrier、填 `/ABC1234`、加品項 | banner「✓ 已開立發票」、`einvoices` 新 row、`invoice_no` 非空、`qr_code` 非空 |
| S10 | einvoice 列表確認 | `/einvoice` | 新發票顯示 status='issued' | 列表 + detail page 都顯正確 |

**整條路線預期**：8/10 pass、S08 確定為 gap、S03 若試駕表不存在則另一 gap。

---

### G2 · 售後維修：預約→工單→出料→結帳→CSI

**目標**：模擬車主回廠保養、技師接修、出料、結帳、CSI 回訪全鏈。

**前置 fixture**：
- Indian 至少 1 台 `customer_vehicles`（有 license_plate + customer_id + model_id）
- Indian 至少 1 個技師（aftersales_technicians 有 active 一筆）
- Indian items 表有「機油」「機油芯」可出庫的 SKU

| Step | 動作 | URL | 預期 | 驗收 |
|------|------|-----|------|------|
| S01 | 建預約 | `/service/appointments/new` | form 顯、選車輛 + 預約日期 + 服務類型 | `appointments` 新 row、status='scheduled' |
| S02 | 預檢（PI） | `/service/pi` 或 `/parts/aftersales/pre-inspections` | 接 appointment_id、填項目 checklist | `pre_inspections` 新 row、link 到 appointment |
| S03 | 開維修工單（RO） | `/service/workorders` | 從預檢結果展開 RO、填維修項目 | `repair_orders` 新 row、`work_orders` 對應一筆、`work_order_items` 數筆 |
| S04 | 技師派工 | `/service/workshop` | 派給某技師、status 切 in_progress | RO assignee_id 寫入、技師看板有單 |
| S05 | 領料出庫（修護領料） | `/parts/operations/*` 出庫流程 | 走 repair-pick、選機油 + 機油芯 | `stock_issues` 新 row + `stock_issue_lines` 2 筆、`stock_movements` 對應出庫紀錄、`stock_items` 庫存扣減 |
| S06 | 竣工複檢 | `/service/inspection` | RO 完工、填最終檢驗 | `final_inspections` 新 row、RO status='completed' |
| S07 | RO 結帳 | RO 詳情頁「結帳」 | 計算金額 + 收款方式 | （可能 gap：是否真寫 invoice / 是否拋 ERP engine）|
| S08 | CSI 問卷派發 | `/csi/surveys` 或 `/crm/aftersales` | 預期 gap：survey_responses 表不存在 | 記為 `missing_table` gap |
| S09 | CSI 回填 | 同上 | 預期 gap | 確認是否只是 demo 設計、還是真要補表 |

**整條路線預期**：6/9 pass、S08-S09 CSI 段確定 gap、S07 結帳實作未知。

---

### G3 · 進銷存閉環：採購→入庫→出庫→盤點→分錄

**目標**：完整跑一次「叫貨進來 → 賣出去 → 盤點調整 → 看 journal_entries 真的有寫」。

**前置 fixture**：
- Indian 至少 1 個 supplier
- Indian 至少 1 個 warehouse + 1 個 bin
- 1 個 item code（可以新建）

| Step | 動作 | URL | 預期 | 驗收 |
|------|------|-----|------|------|
| S01 | 建料號 | `/parts/setup/items` 新增 modal | code/name/control_grade 都填 | `items` 新 row、type='spare_part' |
| S02 | 建採購單 | `/parts/operations/*` 採購入口 | 選 supplier + item + qty + 單價 | `purchase_orders` 新 row 或對應表（sub-agent 摸具體實作） |
| S03 | GRN 入庫 | 採購單詳情 → 收貨 | 走 stock_receipts 流程 | `stock_receipts` + `stock_receipt_lines`、`stock_items` 庫存 +N、`stock_movements` 入庫紀錄、**`journal_entries` 自動拋 PARTS_PURCHASE 分錄** |
| S04 | 出庫（門店零售或修護領料） | `/parts/operations/*` 出庫 | 選 item + qty | `stock_issues`、`stock_movements` 出庫、**`journal_entries` 自動拋 PARTS_RETAIL_SALE 或 PARTS_REPAIR_PICK** |
| S05 | 盤點調整 | `/parts/operations/*` 盤點 | 故意盤盈或盤虧、approve | `inventory_adjustments`、**`journal_entries` 自動拋 STOCK_ADJUSTMENT_GAIN/LOSS** |
| S06 | 庫存平衡查詢 | `/parts/operations/balance` 或 `v_stock_balances` | 餘額 = 入庫 - 出庫 ± 調整 | view query 結果一致 |
| S07 | 對分錄 | `journal_entries` 直接 SQL 查 | 上述 3 個 engine 都有 row、journal_entry_lines 借貸平衡 | borrow_total == credit_total |

**整條路線預期**：5-7/7 pass（已有大量先行工作）、journal 自動拋分錄是否每個 engine 都串到位是觀察點。

---

### G4 · CRM 雙軌追蹤：銷售線索→沉睡客→售後回訪→店長報表

**目標**：第四輪 CRM v2 13 頁的回歸測試、跨 sales + aftersales 模組互通。

**前置 fixture**：
- Indian sales_leads 有不同 status / 不同停留日數的 demo 線索（用第四輪已 seed 的）
- Indian aftersales 有不同回廠日期的客戶（用第五輪售後 seed）

| Step | 動作 | URL | 預期 | 驗收 |
|------|------|-----|------|------|
| S01 | 銷售線索看板 | `/crm/sales/leads` | 列表 + filter 跑通、KPI chip 顯數字 | 與第四輪 seed 對得上 |
| S02 | 新增 call task（銷售） | `/crm/sales/call-tasks/new` | reuse CallTaskDetailView、create mode | `call_tasks` 新 row |
| S03 | 沉睡客撈回 | `/crm/sales/dormant-leads` | 篩出 >X 天無接觸線索、可一鍵建任務 | 任務生成、列表有 |
| S04 | 售後 call task | `/crm/aftersales/call-tasks` | 列表跑通、新建頁面跑通 | 同 S02 但 aftersales 視角 |
| S05 | 問卷模板瀏覽 | `/crm/sales/survey-templates` + `/crm/aftersales/survey-templates` | 兩邊都顯模板列表 | `survey_templates` 有 row |
| S06 | 派發問卷 | 問卷模板「派發」 | **預期 gap：responses 表不存在、無法真派**| 記為 `missing_table` |
| S07 | 店長綜合報表 | `/crm/store-report` | dashboard 顯數據、跨銷售/售後聚合 | 數字非全 0、跟 lead/task/問卷數對得上 |

**整條路線預期**：5/7 pass、S06 派發確定 gap、S07 數據聚合是觀察點。

---

### G5 · 中古車置換閉環：評估→簽核→上架→成交

**目標**：客戶用中古車置換新車的完整流程、串到簽核 + 中古庫存 + 訂單。

**前置 fixture**：
- Indian 至少 1 個有「售車意願」的客戶（可從 sales_leads 借）
- Indian 至少 1 個收車員（員工）

| Step | 動作 | URL | 預期 | 驗收 |
|------|------|-----|------|------|
| S01 | 進入置換評估 | `/usedcar/evaluation` | form 顯、填 VIN / 里程 / 配備 / 估價 | **預期 gap：evaluations 表可能不存在**、需 sub-agent 確認實際寫到哪個表（可能 used_car_inventory metadata） |
| S02 | 收車送簽 | `/admin/approvals/tradein` | 簽核中心有 pending、可 approve | 預期 gap：是否真有 tradein 簽核流定義 |
| S03 | 上架到中古庫存 | `/usedcar/stock` 或 `/sales/showroom/used-cars` | 上一步 approve 後自動 insert | `used_car_inventory` 新 row、status='available' |
| S04 | 中古車展廳銷售 | `/sales/showroom/used-cars` | 列表看到、可進詳情 | 詳情頁顯 condition / 毛利率 / 在庫天數 |
| S05 | 為中古車建訂單 | `/sales/orders/new` | 選擇「中古車訂單」、車輛 picker 帶出剛上架的 | `sales_orders` 新 row、metadata 標 used_car_id |
| S06 | 訂單成交 → 中古庫存狀態切 sold | 訂單 mark fulfilled | used_car_inventory.status='sold'、無孤兒 | 兩表 status 一致 |

**整條路線預期**：3-4/6 pass、S01-S02 確定有 gap、S06 自動串接機制是觀察點。

---

## 5 · Sub-agent 派工方式

### 5.1 主流程

```
main agent (Ming session)
  ├── 1) 把 docs/proposals/e2e-demo-test-plan-2026-05-17.md 給 sub-agent 看
  ├── 2) 並行啟動 5 個 sub-agent（general-purpose）— 每個跑一條路線
  ├── 3) 每個 sub-agent 跑完寫 report.json + report.md + 錄影 + screenshots
  ├── 4) main agent 蒐集 5 份 report → 寫進第六輪 Notion 卡（一次 update_page）
  └── 5) Ming review 看哪些 gap 要補 → 決定第七輪 scope
```

### 5.2 Sub-agent prompt 模板

每個 sub-agent prompt 結構：

```
# 你的任務
跑 E2E 測試路線 <route-id>「<route-name>」、用 Playwright CLI 錄影 + screenshot、
產出 /tmp/e2e-round-6/<route-id>/report.{json,md} + recording.webm。

# 環境
- Host: http://localhost:3001
- Auth: Ming 的 dev session（cookie 已有；過期走 dev-test-credentials skill）
- Brand: indian（所有 fixture 必 brand_id='indian'）

# 你會用到的東西
- 完整測試計畫：docs/proposals/e2e-demo-test-plan-2026-05-17.md
  → 找到你的路線 §4-G<n>、step by step 跑
- Playwright CLI（直接寫 .mjs 腳本、不用 MCP）
- screenshot 命名：01-<step>.png ... NN-<step>.png
- report.json schema 見 §3.3
- 失敗處理見 §3.4

# 規則
- selector drift → 不硬撞、detective 找 + 記 gap
- 找不到資料 → 自己 seed Indian brand fixture（記成 data_missing gap）
- 整段步驟失敗 → 截圖 + 寫進 report、不 abort、繼續下一個 step
- 跑完一定要產出 report.json + report.md（缺一就失敗）

# 完工標準
1. report.json 存在且 schema 正確
2. report.md 可貼進 Notion（人讀版、含 fail/gap 整理）
3. recording.webm 存在
4. screenshots/ 至少 5 張
5. console log + browser error 都印在 report.md 末段
```

### 5.3 Sub-agent 並行 vs 順序

- **並行**（推薦）：5 條同時跑、~10 分鐘完成、共用 dev:3000（每 agent 獨立 browser context）
- **順序**：怕 dev server load 過重時切回順序、~50 分鐘
- **混合**：先跑 G3（最重後台）+ G2（資料寫多）；再跑 G1 + G4 + G5

預設並行、main agent 看 dev:3000 表現決定是否中途切順序。

---

## 6 · 預期 gap 清單（測前已知）

以下是「**還沒測就大概率會撞到**」的 gap、寫成清單後 sub-agent 撞到時直接打勾、不用每次都當新發現：

| Gap ID | 描述 | 影響路線 | 補的成本 |
|--------|------|---------|---------|
| GAP-01 | 訂單→開票無自動串接（無「開立發票」按鈕）| G1 | S — 在 sales/orders/[id] 加 button + 預填 ManualIssueInput |
| GAP-02 | CSI survey_responses 表不存在（只有 templates）| G2 / G4 | M — 新表 + 派發 action + 回填頁面 |
| GAP-03 | sales_test_drives 獨立表可能不存在（試駕記錄落腳處未確認）| G1 | S/M — 看是否藏在 sales_leads metadata、或要建新表 |
| GAP-04 | used_car_evaluations 表不存在（評估記錄落腳處未確認）| G5 | S/M — 看是否塞 used_car_inventory metadata、或要建新表 |
| GAP-05 | tradein 簽核流可能未定義 | G5 | M — admin/approvals/tradein 是否真有對應流程 |
| GAP-06 | RO 結帳是否真寫發票 / 拋 ERP engine | G2 | 觀察點 |
| GAP-07 | 中古車成交後是否自動切 used_car_inventory.status | G5 | 觀察點 |
| GAP-08 | 店長報表跨模組數據是否聚合到位 | G4 | 觀察點 |

**新發現 gap** 由 sub-agent 自由補在 report.json 的 `new_gaps_found`。

---

## 7 · 完工驗收（main agent 收尾）

跑完 5 條後 main agent 做：

1. 蒐集 `/tmp/e2e-round-6/G{1..5}/report.{json,md}` 共 10 個檔
2. 整理成第六輪 Notion 卡 update：每條路線 1 個區塊、整體 gap 清單 1 個區塊
3. 跑 commit cleanup：scripts/e2e-round-6/run-route.mjs 與 fixture seed 若有寫入要列 file 清單給 Ming
4. 列「**建議第七輪 scope**」（P1 補哪些 gap、P2 觀察點）
5. Ming review → 拍板第七輪

---

## 8 · 不做的事（明確排除）

- ❌ 不修 bug（測完才看哪些要補）
- ❌ 不寫 E2E 自動化測試框架（這次是 ad-hoc demo 驗證、不是 regression suite）
- ❌ 不跑 Ducati brand（按 [[feedback-demo-data-indian-brand]] 規矩）
- ❌ 不開 supabase branch（直接打 prod cloud、只讀為主、寫入是 demo 流程的自然副作用）
- ❌ 不跑 staging / prod（dev:3000 ready）
- ❌ 不 commit demo 過程產生的資料（reverse 不易、留著當下一輪 audit 證據）
