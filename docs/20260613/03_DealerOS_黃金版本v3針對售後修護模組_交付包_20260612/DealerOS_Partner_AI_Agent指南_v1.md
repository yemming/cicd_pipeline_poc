# DealerOS — Partner AI Agent 置換與調整指南 v1
**日期：2026-06-12　｜　Russell Hung × Claude Sonnet 4.6 → Partner AI Agent**

---

## 閱讀本文件前的前提

本指南每一頁說明的格式：
1. **這頁是什麼** — 功能定位
2. **黃金版本做了什麼** — HTML 層面的改動（UI/假資料/邏輯）
3. **React 需要實作什麼** — 對應的真實後端串接
4. **關鍵 data-testid** — 供 Playwright 驗收使用
5. **不能做的事** — 常見錯誤提醒

---

## 頁面 1：`04_預檢單_合併版_v1.html`

### 這頁是什麼
SA 接待車輛的第一頁。原本分成 a）SA環檢 和 b）RO串接 兩頁，現在合併為一頁，透過視角切換區分 SA 和技師的操作範圍。

### HTML 做了什麼
- 頂部「Walk-in 臨時進廠」按鈕，點擊後 header badge 由藍色「預約進廠」變橘色「臨時進廠」
- Tab 1 車牌欄位：onBlur/Enter 時顯示查詢結果（帶入車主姓名、保固狀態、特殊標籤）
- 右上角視角切換：SA 視角下 Tab 1/2/4/5 可編輯；技師視角下僅 Tab 3 可編輯，其他唯讀
- Tab 3 SA 視角顯示「等待技師檢查中」；技師視角顯示可填寫的深入檢查項目
- 右側「待處理項目」側欄：預填歷史待辦（來源標注），支援 SA 手動新增
- 損傷異議記錄區塊（不可修改/刪除）
- Tab 5「確認轉入 RO →」按鈕：模擬 POST API + 跳轉至 `02_正式工單RO_v2.html?pi_id={id}`

### React 需要實作
```
// Walk-in 接待
POST /api/pre-inspections { appointment_id: null }  ← Walk-in 不需要 appointment_id

// 車牌查詢
GET /api/vehicles?plate={plate}
→ 帶入：車主姓名、車型、保固狀態、保固到期日、上次服務里程、客戶標籤
→ 查無車牌時顯示「立即建立人車檔案」引導

// Tab 3 儲存（技師填寫）
PATCH /api/pre-inspections/{id}  ← 分欄位儲存 SA 和技師部分

// Tab 5 確認
POST /api/pre-inspections  ← 儲存完整 PI 記錄
→ 成功後 navigate('/aftersales/work-order-ro?pi_id={id}')
→ 失敗時留在頁面，顯示錯誤訊息，不跳轉

// 視角權限
角色由 Supabase auth.role 控制，RLS 確保 SA 無法修改技師欄位
```

### 關鍵 data-testid
- `[data-testid=walkin-btn]` — Walk-in 觸發按鈕
- `[data-testid=walkin-badge]` — 橘色 Walk-in 標籤
- `[data-testid=plate-input]` — 車牌輸入框
- `[data-testid=owner-name]` — 車主姓名自動帶入欄
- `[data-testid=view-sa]` / `[data-testid=view-tech]` — 視角切換按鈕
- `[data-testid=confirm-to-ro-btn]` — Tab 5 確認跳轉按鈕

### 不能做的事
- ❌ Tab 5 確認後只顯示 Toast 就結束 — 必須真正 POST API 並跳轉
- ❌ 技師視角下 Tab 1 仍可編輯 — 必須 disabled
- ❌ Walk-in 要求一定要有 appointment_id — appointment_id 可為 null

---

## 頁面 2：`02_正式工單RO_v2.html`

### 這頁是什麼
SA 在預檢完成後開立正式維修工單（RO）。由預檢單跳轉過來，URL 帶 `?pi_id={id}`。

### HTML 做了什麼
- 頁面頂部「來自預檢單 PI-XXXXXXX」藍色資料預填橫幅（自動帶入車主/車型/車牌/日期/環檢摘要）
- 業務類型：補回第 6 種 **PD 整備**（原版只有5種）
- 付款性質：補回第 4 種 **IN 內部結算**（選 PD 時自動觸發，SA 不可直接選）
- 完整 10 狀態機（進度 Timeline）
- 取消申請 Modal（需主管授權）
- `confirmRO()` 呼叫 `POST /api/workorders` + 顯示成功橫幅 + 提供「查看今日工單」連結
- title 改為「DealerOS 售後 — 正式工單 RO 確認」

### React 需要實作
```
// 資料預填
GET /api/pre-inspections/{pi_id}
→ 帶入：車主姓名、車型、車牌、進廠日期、環檢摘要前兩項

// PD 業務類型邏輯（純前端）
if(p1 === 'PD'){
  selP2('IN');
  disableP2Selector();
  showNote('費用計入整車成本，非客戶帳單');
}

// 確認開立工單
POST /api/workorders
→ 回傳：{ ro_id, ro_number, status:'pending_dispatch' }
→ 成功：顯示「✅ 工單 {RO號} 已開立，已推送至派工看板」
→ 失敗：顯示錯誤訊息，不關閉頁面

// 取消申請（主管授權）
POST /api/workorders/{id}/cancel-request
PATCH /api/workorders/{id}/cancel-approve  ← 主管操作
```

### 關鍵 data-testid
- `.prefix-box:has-text("PD")` — PD 業務類型選項
- `.prefix-box:has-text("IN")` — IN 付款性質選項
- `#confirm-btn` — 確認開立工單按鈕

### 不能做的事
- ❌ confirmRO() 只顯示 Toast — 必須真正 POST API
- ❌ 讓 SA 直接選 IN — IN 只能由選 PD 自動觸發
- ❌ title 繼續寫 DUCATI — 必須是 DealerOS

---

## 頁面 3：`07_售後管理模組_v3.html`

### 這頁是什麼
售後主管/管理員的派工看板，負責將新工單指派給技師。

### HTML 做了什麼
- 頂部橘色通知橫幅（`data-testid=pending-dispatch-banner`）：顯示「有 N 張新工單待派工」
- 點擊橫幅滾動至待派工列表
- 「指派工單→」按鈕：點擊後開啟派工 Modal
- 派工 Modal（`data-testid=dispatch-modal`）：
  - 顯示工單詳細資料
  - 技師選擇卡片（含工作量）
  - 工位選擇（含空閒/使用中狀態）
  - 「確認派工」按鈕（`data-testid=confirm-dispatch-btn`）

### React 需要實作
```
// 新工單通知（每30秒 Polling 或 Supabase Realtime）
GET /api/workorders?status=pending_dispatch&store_id={store_id}
→ 有資料時顯示橫幅，更新計數

// 工單列表
GET /api/workorders?status=pending_dispatch&store_id={store_id}
→ 顯示：工單號、車主、車型、業務類型、開單時間、SA姓名

// 確認派工
PATCH /api/workorders/{id}
{ status:'in_progress', technician_id, bay_id }
→ 成功：工單從待派工清單消失；工位看板更新；技師工作台出現新任務（T07通知）
```

### 關鍵 data-testid
- `[data-testid=pending-dispatch-banner]` — 橘色通知橫幅
- `[data-testid=dispatch-btn]` — 派工按鈕
- `[data-testid=dispatch-modal]` — 派工 Modal
- `[data-testid=confirm-dispatch-btn]` — Modal 內確認按鈕

### 不能做的事
- ❌ 派工按鈕仍是 `showToast(...)` — 必須開啟 Modal + 真正 PATCH API
- ❌ 工單列表繼續顯示靜態假資料 — 必須從 API 讀取

---

## 頁面 4：`10_工單查詢_v1.html`

### 這頁是什麼
SA 監控今日所有工單（含 Walk-in）的查詢頁面。

### HTML 做了什麼
- 頂部三個快速篩選按鈕：「📋 今日我的工單」、「🔴 進行中」、「🕐 今日全部」
- 期間篩選器由 `type='month'` 改為 `type='date'`（開始/結束日期）
- Walk-in 工單顯示橘色「🚶 臨時進廠」標籤（`data-testid=walkin-badge`）
- 假資料改為 Indian 車款（Scout/Chief/FTR）
- title 改為「DealerOS 售後 — 工單查詢」

### React 需要實作
```
// 今日我的工單（快速篩選）
GET /api/workorders?date={today}&sa_id={current_user_id}

// 進行中工單
GET /api/workorders?status=in_progress&store_id={store_id}

// 今日全部工單
GET /api/workorders?date={today}&store_id={store_id}

// 一般查詢
GET /api/workorders?date_from={from}&date_to={to}&...其他篩選條件

// 每30秒自動更新
setInterval(fetchWorkorders, 30000)

// Walk-in 識別
appointment_id === null → 顯示「臨時進廠」標籤
```

### 關鍵 data-testid
- `[data-testid=my-today-btn]` — 今日我的工單按鈕
- `[data-testid=walkin-badge]` — 臨時進廠標籤
- `[data-testid=workorder-row]` — 工單列表每一列

---

## 頁面 5：`07B_服務套餐與費率設定_v2.html`

### 這頁是什麼
售後主管設定各業務類型工時費率的設定頁（L-001 教訓的修正）。

### HTML 做了什麼（Tab B 費率設定）
- 費率欄位由純文字顯示改為 `<input type="number" class="rate-editable">` 可編輯
- 任何費率變更後，表格上方顯示橘色 Dirty State 橫幅（`data-testid=dirty-banner`）
- 新增「💾 儲存費率」按鈕，呼叫 `PUT /api/labor-rates`
- 告警橫幅移除 debug 說明，改為正式說明文字
- 注意：此頁色票與其他頁不同（使用 `--teal` 系列），這是原始設計，不需修改

### React 需要實作
```
// 讀取現有費率
GET /api/labor-rates?brand_id={current_brand}

// 儲存費率
PUT /api/labor-rates
{ brand_id: 'indian', rates: { MN: 1200, RP: 1350, WC: 1200, AC: 1100, PD: 1000 } }
→ 成功：Dirty State 橫幅消失，Tab C 新增稽核記錄
→ 失敗：保留 Dirty State，顯示錯誤訊息

// Dirty State（純前端）
input.onchange → markDirty(el) → 顯示 Dirty Banner
```

### 關鍵 data-testid
- `input.rate-editable` — 費率輸入框（可編輯）
- `[data-testid=dirty-banner]` — 未儲存提示橫幅
- `button:has-text("儲存費率")` — 儲存按鈕

### 不能做的事
- ❌ L-001 再犯：React 化後費率欄位變唯讀 — 必須保留 `<input>` 可編輯
- ❌ 儲存按鈕消失 — 必須存在且可點擊

---

## 頁面 6：`04_追加項目記錄_v2.html`

### 這頁是什麼
記錄技師發現的額外問題（追加項目），讓 SA 聯繫車主確認。

### HTML 做了什麼
- 「❌ 拒絕→增項閉環」按鈕：不再直接 showToast，改為開啟拒絕原因 Modal
- Modal 內容：五選一固定標籤（Radio Button）+ 自由文字補充（最多50字）
- 未選原因時「確認拒絕」按鈕灰化不可點（`disabled`）
- 確認後：PATCH API + 跳轉至 `05_增項閉環_完整子模組_v2.html`

### React 需要實作
```
// 確認拒絕（寫入原因）
PATCH /api/repair-order-addons/{id}
{
  status: 'rejected',
  rejection_reason: 'price' | 'time' | 'unnecessary' | 'consider' | 'other',
  rejection_note: '選填補充說明'
}

// DB Schema 新增欄位（Partner 必須 migrate）
ALTER TABLE repair_order_addons
  ADD COLUMN rejection_reason TEXT,
  ADD COLUMN rejection_note TEXT;
```

### 關鍵 data-testid
- `[data-testid=reject-btn]` — 拒絕按鈕
- `[data-testid=rejection-modal]` — 原因 Modal
- `[data-testid=reason-price]` — 「價格超出預算」Radio
- `[data-testid=reason-time]` — 「時間不夠」Radio
- `[data-testid=confirm-reject-btn]` — 確認拒絕按鈕
- `[data-testid=rejection-note]` — 補充說明文字框

---

## 頁面 7：`05_增項閉環_完整子模組_v2.html`

### 這頁是什麼
追蹤所有被拒絕/暫緩的追加項目，供主管分析並管理 SA 輔導。

### HTML 做了什麼（Tab 3 整店統計新增）
- 新增拒絕原因分布 SVG 圓餅圖（`data-testid=rejection-pie-chart`）
  - 四個扇形（💰價格43%、⏰時間31%、❓不認為必要16%、🤔需考慮10%）
  - 圖右側顯示各原因的件數和金額
- 新增 SA 個人增項轉化率看板（`data-testid=sa-conversion-table`）
  - 每位 SA 一列：提案件數、接受件數、接受率、主要拒絕原因
  - 顏色標示：≥35% 🟢、20-34% 🟡、<20% 🔴

### React 需要實作
```
// 拒絕原因統計（圓餅圖資料）
GET /api/workorders/addon-rejection-stats?store_id={}&month={YYYYMM}
→ 回傳：[{ reason, count, amount }]

// SA 個人轉化率
GET /api/workorders/sa-addon-conversion?store_id={}&month={YYYYMM}
→ 回傳：[{ sa_id, sa_name, total, accepted, rate, top_reason }]

// 圓餅圖技術
建議用 D3.js 或 SVG，與系統其他圖表一致
```

### 關鍵 data-testid
- `[data-testid=rejection-pie-chart]` — 圓餅圖容器
- `[data-testid=pie-slice]` — 每個扇形（應有5個）
- `[data-testid=sa-conversion-table]` — SA 轉化率表格
- `[data-testid=sa-row-low]` — 低轉化率 SA 列（有 `.red` class）

---

## 頁面 8：`06_竣工複檢_v2.html`

### 這頁是什麼
技師施工完成後由「另一位」技師或售後主管執行的品質複檢。

### HTML 做了什麼
- 步驟 1 新增退回重工流程：填寫退回原因後按鈕，複檢次數記錄器自動 +1
- 第 2 次以上不通過自動觸發「需主管授權」機制
- 步驟 4 加入：施工 Tech 不得自複檢的規則警告橫幅（標注 API 403 邏輯）
- 複檢次數計數器（`id=qc-count`，`id=qc-count-bar`）
- completeRO() 補上工單關閉連鎖動作說明

### React 需要實作
```
// 不可自複檢驗證（後端）
PATCH /api/workorders/{id}/qc-sign
→ 若 inspector_id === technician_id → 拒絕，回傳 403

// 退回重工
PATCH /api/workorders/{id}/status
{ status:'rework', rework_reason:'...', qc_inspector:'...' }
→ 觸發施工技師通知（T07）
→ 複檢次數計數 qc_count++

// 第 2 次以上退回需主管授權
POST /api/workorders/{id}/supervisor-auth-request
{ reason:'複檢退回超過2次' }

// 竣工複檢完成
POST /api/workorders/{id}/close
（連鎖：人車檔案更新 + CRM更新 + D+3電訪任務建立）
```

---

## 頁面 9：`08_結帳收款_v2.html`

### 這頁是什麼
SA 與車主完成結帳的最終流程（4個步驟）。

### HTML 做了什麼
- Step 1 費用明細：加入「由工單自動帶入」標注（M-10）
- Step 2 車主第二次簽名：canvas 簽名完成後自動執行 `lockFeeAfterSign()`
  - 折扣選單 disabled
  - 費用金額鎖定
- Step 4 完成畫面：新增取車後投訴記錄入口（B19-01）

### React 需要實作
```
// 費用自動帶入（M-10）
GET /api/workorders/{id}/billing
→ 自動帶入所有費用明細，非手動輸入

// 第二次簽名後鎖定費用（B14-03）
POST /api/workorders/{id}/sign-checkout
{ type:'customer_second', locked_amount: xxxx }
→ 簽名後費用不可再修改

// 取車後投訴（B19-01）
POST /api/complaints
{ workorder_id:'...', type:'post_delivery' }
→ 工單關閉後仍可補記

// 結帳完成（連鎖）
POST /api/workorders/{id}/close
```

---

## 頁面 10：`06_出庫管理_維修領料_v2.html`

### 這頁是什麼
維修過程中的零件領料管理，新增退料入庫的反向流程。

### HTML 做了什麼
- 在「維修領料出庫」的基礎上新增第二個 Tab「↩️ 退料入庫」
- 退料類型三選一：完整退料 / 損耗核銷 / 工單取消退料
- 損耗核銷需要主管授權

### React 需要實作
```
// 完整退料
POST /api/stock-returns
{ item_id, qty, type:'full', workorder_id }

// 損耗核銷（需主管授權）
POST /api/stock-writeoffs
{ item_id, qty, reason, workorder_id }
→ 需 supervisor_auth_id
→ 記錄稽核日誌

// 批次退料
POST /api/stock-returns/batch
```

---

## 頁面 11：`09_人車檔案_v2.html`

### 這頁是什麼
查詢並管理客戶的完整人車資料，含歷史紀錄和待處理追蹤。

### HTML 做了什麼（五區塊架構）
- ① 車輛資料（原有，Indian 假資料）
- ② 到期提醒（新增，保固/保養/大保養/強制險，系統自動計算，唯讀）
- ③ 維修履歷（原有）
- ④ 待處理項目（新增，四個來源：追加拒絕/追加暫緩/Quick Quote拒絕/SA手動）
- ⑤ 投訴歷史（新增，含「取車後補記」入口）

### React 需要實作
```
// 待處理項目（來自多個來源自動匯入）
GET /api/vehicles/{id}/pending-items
→ 包含：source（追加拒絕/暫緩/Quick Quote/手動）、safety_level、created_at

// SA 手動新增待辦
POST /api/vehicles/{id}/pending-items
{ source:'manual', content:'...' }

// 投訴歷史
GET /api/complaints?vehicle_id={id}

// 到期提醒（系統計算）
依 warranty_expiry、last_service_date、last_major_service_date 自動計算
顯示：距到期天數
```

---

## 頁面 12：`01_預約管理看板_v2.html`

### 這頁是什麼
SA 管理今日預約的看板，新增 Walk-in 即時插單功能。

### HTML 做了什麼
- Header 下方新增 Walk-in 插單橫幅（輸入車牌 + 建立臨時進廠按鈕）
- 查無車牌時引導建立人車檔案

### React 需要實作
```
// Walk-in 插單
GET /api/vehicles?plate={plate}  ← 查車牌
→ 找到：帶入資料，直接建立 PI
→ 查無：引導開啟快速建立人車檔案 Modal

POST /api/pre-inspections
{ plate, type:'walkin', appointment_id: null }
→ 成功後跳轉至 04_預檢單_合併版_v1.html（Walk-in 模式）
```

---

## 頁面 13：`售後稽核日誌_v1.html`

### 這頁是什麼
售後業務層面的稽核記錄，供售後主管/店長查閱。

### React 需要實作
```
// 事件查詢
GET /api/audit-logs?scope=aftersales&store_id={}&date_from={}&date_to={}
→ 回傳：工單事件時間軸、主管授權記錄、損耗核銷記錄

// 可見角色
roles: ['aftersales_lead', 'store_manager']
```

---

## 頁面 14：`庫存稽核日誌_v1.html`

### React 需要實作
```
GET /api/audit-logs?scope=inventory&store_id={}
→ 可見角色：['warehouse_manager', 'store_manager']
```

---

## 頁面 15：`集團稽核日誌_v1.html`

### React 需要實作
```
GET /api/audit-logs?scope=group&org_id={}
→ 可見角色：['brand_director', 'channel_manager']
→ 跨門店彙總；異常警示自動觸發
```

---

## 頁面 16：`Tech_工作台_v1.html`

### 這頁是什麼
技師的專屬工作介面（深綠色主題），包含接單、施工、追加標記、工時記錄。

### HTML 做了什麼
- 今日工單列表（待接單 / 施工中 / 已完成）
- 施工模式：逐項勾選清單 + 深入檢查結果 + 施工備註
- 追加標記：填寫問題描述/安全等級/費用，送出通知 SA
- 工時記錄：今日工時明細表（標準 LU vs 實際 LU，效率計算）
- 接單時自動開始計時，完成施工時自動停止

### React 需要實作
```
// 取得今日工單
GET /api/tech/workorders?tech_id={current_user}&date={today}

// 接單開工（自動開始計時）
PATCH /api/workorders/{id}/status
{ status:'in_progress', technician_id:'...', start_time:'now' }

// 施工清單更新
PATCH /api/workorders/{id}/work-items
{ items: [{ id, done: true }] }

// 追加項目
POST /api/repair-order-addons
{ workorder_id, name, safety_level, estimated_fee, tech_note }

// 完成施工
PATCH /api/workorders/{id}/status
{ status:'qc_pending' }
→ 通知複檢員（不可指派施工 Tech 自複檢）
→ SA 收到「施工完成，等待複檢」通知（T07）

// 工時計時
PATCH /api/workorders/{id}/time-log
{ action:'start' | 'pause' | 'stop' }
```

### 注意事項
- ⚠️ 完成施工後，系統必須確認複檢員不是同一位技師（M-09）
- ⚠️ 追加項目標記後，必須觸發通知（不能靜默）

---

## 整體閉環管理要求

Partner AI Agent 完成每頁 React 修改後，在回報前必須問自己：

1. **「這頁的使用者，能做到應該做的事嗎？」**
2. **「確認按鈕按了之後，資料有沒有真正寫進 DB？」**（Toast ≠ 完成）
3. **「下一頁有沒有正確帶入上一頁的資料？」**（SA 有沒有被迫重填）
4. **「我有沒有跑 Playwright 驗收確認？」**（感覺對 ≠ 測試通過）

---

## 已廢除頁面提醒

| 頁面 | 處理方式 |
|------|---------|
| `04_預檢單_SA環檢_v3.html` | 移至 archive 資料夾，不對外展示 |
| `04_預檢單_RO串接_v3.html` | 移至 archive + nav_nodes 設 `is_active=false` |
| `02_正式工單RO_v3.html` | 若存在，刪除。最終版本是 `_v2.html` |

---

*DealerOS Partner AI Agent 置換指南 v1　｜　Russell Hung × Claude Sonnet 4.6　｜　2026-06-12　｜　機密文件*
