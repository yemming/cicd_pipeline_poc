# DealerOS — 新頁面包 B 說明文件
## 版本：v1.0 | 日期：2026-05-26
## 執行對象：Partner AI Agent / 開發人員

---

## 一、本包目的

本包包含 DealerOS 系統中**原本不存在**的全新頁面，共 **8 支**。  
這些頁面的功能是補全整車供應鏈入庫流程，讓系統能從「採購訂單」一路跑通到「可售庫存」。

> ⚠️ **重要：本包所有檔案均為新增，直接放入系統目錄即可，不覆蓋任何現有檔案。**

---

## 二、命名規則說明

本包共 8 支新頁面，依所屬模組分為兩組：

### 銷售模組（RS_ 前綴，放入 7z 目錄）
整車供應鏈管理，前綴統一用 `RS_INV`：

| 檔案名稱 | 說明 |
|---------|------|
| `RS_INV01_整車採購訂單.html` | 對原廠下採購訂單 |
| `RS_INV02_到港確認.html` | 新車到港逐台掃 VIN，**觸發 PDI 工單的唯一入口** |
| `RS_INV03_整車採購財務結算.html` | 關稅/運費/保險費按比例分攤至各台 |
| `RS_INV04_車輛調撥.html` | 跨倉調撥，含 5 種運費承擔方式 |
| `RS_INV05_中古車收購申請.html` | 直購中古車入庫起點（非置換） |
| `RS_INV06_出庫管理.html` | 各類出庫記錄查詢（銷售/調撥/試乘/報廢） |

### 售後模組（02_ 前綴，放入 zip 目錄）
工單作業，前綴統一用 `02_`（工單系列）：

| 檔案名稱 | 說明 |
|---------|------|
| `02_PDI工單執行.html` | 技師執行新車 PDI 29 項，完成後費用寫回整車成本 |
| `02_中古車整備工單.html` | 技師執行中古車整備，完成後費用寫回整車成本，車輛變可售 |

---

## 三、系統流程說明

### 新車流程（完整鏈路）

```
RS_INV01（採購下單）
    ↓ 車輛狀態：IN_TRANSIT（在途）
RS_INV02（到港確認，逐台掃VIN）
    ↓ 自動建立 PDI 工單 × N 筆
    ↓ 車輛狀態：PENDING_PDI（待PDI）
02_PDI工單執行（技師執行 29 項）
    ↓ 費用寫回整車成本
    ↓ 車輛狀態：AVAILABLE（可售）
RS03A 新車庫存看板（顯示可售車輛）
    ↓ 業務配車報價（RS04）
RS05 交車管理（確認 PDI 已完成）
    ↓ 車輛狀態：SOLD（已售）
RS_INV06（銷售出庫記錄）

---（財務）---
RS_INV03（財務結算：關稅/運費/保險分攤）
```

### 中古車直購流程

```
RS_INV05（直購收購申請）
    ↓ 確認收購，建立車輛主檔（DIRECT_BUY）
    ↓ 自動建立整備工單（PD-UC）
    ↓ 車輛狀態：PENDING_RECON（待整備）
02_中古車整備工單（技師執行整備）
    ↓ 費用寫回整車成本
    ↓ 車輛狀態：AVAILABLE（可售）
RS03B 中古車庫存看板（顯示可售）
```

### 中古車置換流程（由包 A 的 RS06 觸發）
```
RS06（評估鑑價 → 確認收購）
    ↓ 自動建立車輛主檔（TRADE_IN）+ 整備工單（PD-UC）
02_中古車整備工單（整備執行）
    ↓ 同上
```

---

## 四、逐支頁面說明

---

### 1. RS_INV01 整車採購訂單

**功能：** 對原廠下整車採購訂單，管理採購清單與在途狀態。

**主要功能：**
- 採購單列表（顯示狀態：在途中 / 到港完成）
- 新增採購單：填入供應商、採購日期、預計到港日、車款明細（型號/顏色/數量/單價）
- 自動計算採購總金額
- 送出後車輛狀態為 `IN_TRANSIT`

**後端串接點：**
```javascript
// POST /api/purchase-orders
// { supplier_id, order_date, expected_arrival, items: [{model, color, qty, unit_price}] }
// 回傳：{ po_id, batch_id }
// GET /api/purchase-orders → 採購單列表
```

**驗證 Checklist：**
- [ ] 採購單列表正常顯示，含狀態 badge
- [ ] 點擊「＋ 新增採購單」展開表單
- [ ] 可新增/刪除車款明細列，金額自動計算
- [ ] 送出後顯示 Toast 含工單號與車輛狀態說明

---

### 2. RS_INV02 到港確認（最關鍵）

**功能：** 新車到港時，逐台掃描 VIN 確認，**自動觸發 PDI 工單**。

**4 步驟流程：**
1. 選擇採購單（待確認狀態）
2. 逐台掃描 / 手動輸入 VIN（支援掃描槍）
3. 確認損傷記錄（可標記損傷等級，拍照上傳）
4. 完成到港確認 → 批次建立 PDI 工單 × N 筆

**後端串接點：**
```javascript
// POST /api/vehicles/batch-arrival-confirm
// {
//   purchase_order_id, arrival_date, warehouse_id,
//   vehicles: [{ seq, vin, damage_flag, damage_level }]
// }
// 後端執行：
// 1. 每台建立 vehicle 記錄，status → PENDING_PDI
// 2. 每台建立 PD-IN 工單
// 3. 通知售後主管
```

**驗證 Checklist：**
- [ ] STEP 1 可選擇採購單，點擊「選擇此單」進入 STEP 2
- [ ] STEP 2 輸入 VIN 後按 Enter 或點確認，對應車輛列轉為綠色
- [ ] 所有車輛確認後，「下一步」按鈕解鎖
- [ ] STEP 4 點擊「確認到港」後，顯示 PDI 工單號清單
- [ ] 測試按鈕「全部確認無損傷」可快速完成

---

### 3. RS_INV03 整車採購財務結算

**功能：** 批次到港後，輸入關稅/運費/保險等費用，按採購成本比例分攤至各台車輛主檔。

**分攤公式：**
- 關稅、運費、保險：按各台採購成本佔批次總採購成本的比例分攤
- 報關代辦費：均攤（每台相同金額）

**後端串接點：**
```javascript
// POST /api/batches/{batch_id}/settle
// { customs, freight, insurance, customs_fee }
// 後端：計算各台分攤金額，寫回：
// vehicle.customs_duty, vehicle.freight_cost, vehicle.insurance_cost
// 重新計算 vehicle.total_cost
```

**驗證 Checklist：**
- [ ] 費用輸入欄可修改，分攤表即時更新
- [ ] 各台整車成本合計正確（採購成本 + 各項分攤）
- [ ] 確認結算後 Toast 顯示確認訊息

---

### 4. RS_INV04 車輛調撥

**功能：** 車輛跨倉/跨點調撥，支援 5 種運費承擔方式。

**5 種運費承擔方式：**

| 代碼 | 名稱 | 說明 |
|------|------|------|
| A | 計入整車成本 | transfer_freight_cost 加入 total_cost |
| B | 調出方負擔 | 費用計入調出倉費用科目 |
| C | 調入方負擔 | 費用計入寄倉方費用科目 |
| D | 各半平攤 | 雙方各 50% |
| E | 免運費 | transfer_freight_cost = 0 |

**特殊情境：**
- 待整備（PENDING_RECON）車輛調撥：整備工單暫停並移交，系統顯示警告
- 選擇方式 A 且金額較大時：顯示毛利影響警告，需主管確認

**後端串接點：**
```javascript
// POST /api/vehicles/{vehicle_id}/transfer
// { from_warehouse, to_warehouse, freight_type, freight_amt, reason }
// 若 freight_type==='A'：vehicle.transfer_freight_cost += freight_amt
// vehicle.status → IN_TRANSIT_TRANSFER
```

**驗證 Checklist：**
- [ ] 調撥紀錄列表正常顯示
- [ ] 點擊「＋ 新增調撥申請」展開表單
- [ ] 選擇「待整備」車輛後，黃色警告卡出現
- [ ] 5 種運費承擔方式可切換，說明文字對應更新
- [ ] 選方式 A 並輸入金額後，毛利影響警告顯示

---

### 5. RS_INV05 中古車收購申請

**功能：** 直接從市場收購中古車（非置換），建立車輛主檔並觸發整備工單。

**4 步驟流程：**
1. 基本資訊（來源類型：拍賣/個人/同業/其他，賣方資料）
2. 車輛資料（VIN、型號、年份、里程、車況評級 A~D、照片上傳）
3. 鑑價與成本（市場行情、整備費用估算、建議收購報價計算）
4. 收購決策（確認收購 / 條件收購 / 不收購）

**後端串接點：**
```javascript
// POST /api/used-purchase/confirm
// {
//   application_no, decision, source_type: 'DIRECT_BUY',
//   acquisition_price, recon_cost_estimate,
//   vehicle: { vin, brand, model, year, color, mileage, grade_ext, grade_mech }
// }
// 後端執行：
// 1. 建立 vehicle（vehicle_type=USED, used_source_type=DIRECT_BUY）
// 2. 建立 PD-UC 整備工單
// 3. 建立應付帳款（應付賣方）
```

**驗證 Checklist：**
- [ ] 4 個來源類型卡片可切換選擇
- [ ] STEP 2 車況等級（外觀/機械）可點選 A~D
- [ ] 照片上傳框點擊後模擬上傳完成（綠色）
- [ ] STEP 3 費用計算即時更新建議收購報價
- [ ] STEP 4 三種決策各自顯示對應說明
- [ ] 確認收購後，成功卡顯示車輛主檔號與整備工單號

---

### 6. RS_INV06 出庫管理

**功能：** 查詢所有整車出庫記錄（銷售/調撥/試乘展覽/報廢下架），顯示毛利。

**出庫類型：**
- 銷售出庫（SALE）：正常交車，顯示售價與毛利
- 調撥出庫（TRANSFER）：跨倉調撥
- 試乘/展覽（DEMO）：暫時借出
- 報廢/下架（SCRAP）：損壞或召回

**驗證 Checklist：**
- [ ] KPI 顯示本月出庫台數統計
- [ ] 出庫類型篩選正常運作
- [ ] 銷售出庫記錄顯示毛利（售價 − 整車成本）
- [ ] 匯出報表按鈕可點擊

---

### 7. 02_PDI工單執行

**功能：** 技師執行新車 PDI 整備 29 項檢查，完成後費用自動寫回整車成本。

**5 個 Tab：**
1. 工單資訊（來自 INV02 自動建立，車輛資料與費用歸屬說明）
2. PDI 檢查清單（29 項，A~D 四類，可標記旗標並填異常說明）
3. 零件與工時（可新增/刪除，自動計算費用）
4. 費用彙總（費用歸屬財務科目說明 + 整車成本更新預覽）
5. 完成核准（技師+主管雙簽，核准後費用寫回整車成本，車輛→可售）

**後端串接點：**
```javascript
// PATCH /api/workorders/{workorder_id}/complete
// { labor_cost, parts_cost, completed_date }
// 後端：
// 1. 工單 status → CLOSED
// 2. vehicle.pdi_labor_cost = labor_cost
// 3. vehicle.pdi_parts_cost = parts_cost
// 4. 重算 vehicle.total_cost
// 5. vehicle.status → AVAILABLE
```

**驗證 Checklist：**
- [ ] Tab 0 顯示費用歸屬說明橫幅（車主應付 NT$0）
- [ ] Tab 1 可逐項勾選，進度條更新
- [ ] Tab 1 旗標按鈕點擊後項目變琥珀色
- [ ] Tab 2 可新增工時/零件，金額自動計算
- [ ] Tab 3 費用彙總與整車成本更新預覽正確
- [ ] Tab 4 技師/主管簽名後點「核准完工」，成功卡出現

---

### 8. 02_中古車整備工單

**功能：** 技師執行中古車整備（PD-UC），完成後費用寫回整車成本，車輛狀態變為可售。

**與 PDI 工單的差異：**
- 檢查清單改為中古車整備 24 項（清潔/機械/安全/文件）
- 費用寫回欄位為 `recon_cost`（非 pdi_labor_cost）
- 適用來源：置換收購（TRADE_IN）與直購（DIRECT_BUY）均使用此工單

**後端串接點：**
```javascript
// PATCH /api/workorders/{workorder_id}/complete
// { labor_cost, parts_cost }
// 後端：
// vehicle.recon_cost = labor_cost + parts_cost
// 重算 vehicle.total_cost
// vehicle.status → AVAILABLE
```

**驗證 Checklist：**
- [ ] Tab 0 顯示 PD-UC 工單資訊（含來源類型）
- [ ] Tab 1 中古車整備 24 項清單可勾選
- [ ] Tab 3 整車成本更新預覽：收購價 + 整備費用
- [ ] Tab 4 核准後，成功卡顯示 RS03B 庫存連結

---

## 五、後端 API 串接總覽

本包所有頁面均為前端 prototype，資料為假資料。  
以下為完整的 API 串接點清單，Partner 後端工程師請依此建立對應端點：

### 車輛主檔（Vehicle Master）
```
GET    /api/vehicles                          → 車輛列表（篩選條件：type, status）
GET    /api/vehicles/{id}                     → 單台車輛詳情
PATCH  /api/vehicles/{id}/status             → 更新車輛狀態
PATCH  /api/vehicles/{id}/costs              → 更新整車成本（PDI/整備完成後）
```

### 採購管理
```
GET    /api/purchase-orders                   → 採購單列表
POST   /api/purchase-orders                   → 建立採購單
POST   /api/vehicles/batch-arrival-confirm    → 批次到港確認（觸發PDI）
POST   /api/batches/{id}/settle               → 財務結算（費用分攤）
```

### 工單管理
```
GET    /api/workorders                        → 工單列表
GET    /api/workorders/{id}                   → 工單詳情
PATCH  /api/workorders/{id}/complete          → 工單完工核准
```

### 中古車
```
POST   /api/used-purchase/confirm             → 直購收購確認
POST   /api/trade-in/confirm                  → 置換收購確認（由RS06觸發）
```

### 調撥
```
POST   /api/vehicles/{id}/transfer            → 建立調撥申請
PATCH  /api/vehicles/{id}/transfer/complete   → 確認到達
```

---

## 六、車輛狀態機（完整版）

```
新車：
IN_TRANSIT → PENDING_PDI → AVAILABLE → RESERVED → SOLD

中古車：
EVALUATION → PENDING_RECON → AVAILABLE → RESERVED → SOLD

特殊狀態：
IN_TRANSIT_TRANSFER（調撥中）
INACTIVE（下架/報廢）
```

---

## 七、本包交付檔案清單

| 檔案名稱 | 所屬模組 | 功能 |
|---------|---------|------|
| `RS_INV01_整車採購訂單.html` | 銷售模組（7z） | 對原廠採購下單 |
| `RS_INV02_到港確認.html` | 銷售模組（7z） | 到港掃VIN，觸發PDI |
| `RS_INV03_整車採購財務結算.html` | 銷售模組（7z） | 關運保費用分攤 |
| `RS_INV04_車輛調撥.html` | 銷售模組（7z） | 跨倉調撥管理 |
| `RS_INV05_中古車收購申請.html` | 銷售模組（7z） | 直購中古車入庫 |
| `RS_INV06_出庫管理.html` | 銷售模組（7z） | 各類出庫查詢 |
| `02_PDI工單執行.html` | 售後模組（zip） | 新車PDI整備執行 |
| `02_中古車整備工單.html` | 售後模組（zip） | 中古車整備執行 |
| `DealerOS_B_新頁面說明.md` | — | 本說明文件 |
| `DealerOS_整車庫存管理模組_需求規格書_v2.md` | — | 完整規格書 |

---

## 八、與包 A（錯誤修正包）的關係

包 A 與包 B **相互獨立**，但邏輯上有依賴關係：

- 包 B 的 RS_INV02（到港確認）會在完成後，讓 RS03A（包 A 修正版）顯示「待PDI」狀態
- 包 B 的 02_PDI工單執行完成後，RS05（包 A 修正版）才能在 STEP 1 看到「PDI已完成」

**建議部署順序：** 先部署包 A → 確認驗證通過 → 再部署包 B。

---

*文件版本：v1.0 | 建立日期：2026-05-26*
*海德生貿易 × Indian摩托車總代理 DealerOS 專案*
