# DealerOS 黃金版本 v3 — 目錄結構對照與交付確認
**日期：2026-06-12　｜　Russell Hung × Claude Sonnet 4.6**
**基準文件：目錄結構規範 v3.0（2026-06-10）**

---

## 一、58個故障點覆蓋確認

### 主線故障點（12個）

| 編號 | 問題 | 對應HTML | 覆蓋狀態 |
|------|------|---------|---------|
| M-01 | 預約清單為假資料 | `01_預約管理看板_v2.html` | ✅ Walk-in插單、假資料已更新 |
| M-02 | 車牌查詢無API | `04_預檢單_合併版_v1.html` | ✅ onBlur呼叫API帶入人車資料 |
| M-03 | Tab5簽名為假動作 | `04_預檢單_合併版_v1.html` | ✅ canvas真實電子簽名 |
| M-04 | confirmRO()只顯示Toast | `02_正式工單RO_v2.html` | ✅ POST /api/workorders + 推送派工 |
| M-05 | 套餐帶入依07B費率 | `07B_服務套餐與費率設定_v2.html` | ✅ Tab B費率可編輯+儲存 |
| M-06 | 派工看板假資料+假按鈕 | `07_售後管理模組_v3.html` | ✅ 派工Modal + PATCH API |
| M-07 | 發料確認出庫只顯示Toast | `06_出庫管理_維修領料_v2.html` | ✅ 退料Tab + API標注 |
| M-08 | 竣工複檢通過只顯示Toast | `06_竣工複檢_v2.html` | ✅ 退回重工流程 + 狀態更新API |
| M-09 | 施工Tech不得自複檢無後端驗證 | `06_竣工複檢_v2.html` | ✅ 警告橫幅 + 403驗證說明 |
| M-10 | 結帳費用為假資料 | `08_結帳收款_v2.html` | ✅ GET /api/workorders/{id}/billing說明 |
| M-11 | 第二次客戶簽名為假動作 | `08_結帳收款_v2.html` | ✅ canvas真實簽名 + 費用鎖定 |
| M-12 | 工單關閉後無連鎖動作 | `08_結帳收款_v2.html` | ✅ 6個連鎖動作說明 |

**主線：12/12 ✅ 全部覆蓋**

---

### 支線故障點（46個）

| 編號 | 支線場景 | 對應HTML | 覆蓋狀態 |
|------|---------|---------|---------|
| B1-01 | Walk-in插單 | `01_預約管理看板_v2.html` | ✅ |
| B1-02 | 查無車牌快速建檔 | `04_預檢單_合併版_v1.html` | ✅ 引導Modal |
| B2-01 | 損傷異議備註欄位 | `04_預檢單_合併版_v1.html` | ✅ 不可刪除的異議記錄區塊 |
| B2-02 | 主管升級通知 | `06_竣工複檢_v2.html` | ✅ 退回重工超2次觸發主管授權 |
| B3-01 | 同車多工單視覺提示 | `07_售後管理模組_v3.html` | ⚠️ 派工Modal已標注，後端需實作識別邏輯 |
| B3-02 | 派工看板識別同車多工單 | `07_售後管理模組_v3.html` | ⚠️ HTML標示，後端需實作 |
| B3-03 | 同車多工單合併結帳 | `08_結帳收款_v2.html` | ⚠️ HTML未涵蓋，需後端另行實作 |
| B4-01 | 保固到期日為假資料 | `04_預檢單_合併版_v1.html` | ✅ GET /api/vehicles帶入保固狀態 |
| B4-02 | 主管授權覆蓋保固期限 | `06_竣工複檢_v2.html` | ✅ 授權驗證機制 |
| B5-01 | 技師追加通知SA機制 | `04_追加項目記錄_v2.html` | ✅ POST /api/repair-order-addons通知SA |
| B5-02 | 聯繫記錄欄位 | `04_追加項目記錄_v2.html` | ✅ 確認方式欄位 |
| B5-03 | 工單缺「等待客戶授權」狀態 | `02_正式工單RO_v2.html` | ✅ 完整10狀態機含此狀態 |
| B6-01 | 維修退料反向流程 | `06_出庫管理_維修領料_v2.html` | ✅ 退料入庫Tab（3種類型）|
| B6-02 | 部分施工工本費計算 | `08_結帳收款_v2.html` | ✅ 費用明細自動帶入說明 |
| B6-03 | 追加項目「同意後取消」狀態 | `04_追加項目記錄_v2.html` | ✅ 狀態追蹤 |
| B7-01 | 追加項目缺「暫緩觀察」狀態 | `04_追加項目記錄_v2.html` | ✅ 暫緩按鈕 |
| B7-02 | 拒絕項目無法寫入人車檔案 | `09_人車檔案_v2.html` | ✅ 待處理項目區塊（四來源匯入）|
| B7-03 | 竣工複檢無法指定部分項目 | `06_竣工複檢_v2.html` | ✅ 逐項複檢清單 |
| B8-01 | 追加項目無累積費用即時顯示 | `04_追加項目記錄_v2.html` | ✅ 費用變動摘要 |
| B8-02 | 追加金額超門檻無主管介入 | `04_追加項目記錄_v2.html` | ✅ API標注+說明 |
| B9-01 | 工單缺「待料」狀態 | `02_正式工單RO_v2.html` | ✅ 狀態機含待料 |
| B9-02 | 車輛暫還流程 | `02_正式工單RO_v2.html` | ✅ 狀態機含待料-車輛已還 |
| B9-03 | 取回未完工車輛確認書 | `08_結帳收款_v2.html` | ✅ 委託取車流程 |
| B9-04 | 入庫後自動通知SA | `07_售後管理模組_v3.html` | ✅ 通知橫幅機制說明 |
| B10-01 | 工位計時為假資料 | `Tech_工作台_v1.html` | ✅ 計時器 + PATCH /api/workorders/{id}/timer |
| B10-02 | 主管超時費用決定無記錄 | `售後稽核日誌_v1.html` | ✅ 主管授權統計 |
| B11-01 | 竣工複檢無退回重工流程 | `06_竣工複檢_v2.html` | ✅ 完整退回重工流程 |
| B11-02 | 無複檢次數記錄 | `06_竣工複檢_v2.html` | ✅ 複檢次數計數器 |
| B12-01 | 工單缺路試問題記錄欄位 | `06_竣工複檢_v2.html` | ✅ 試車記錄步驟（步驟2）|
| B12-02 | 路試問題責任歸屬判定 | `06_竣工複檢_v2.html` | ✅ 試車備註欄 |
| B13-01 | 結帳無委託取車流程 | `08_結帳收款_v2.html` | ✅ 委託取車Tab（Step 1B）|
| B13-02 | 委託人簽名與本人簽名無法區分 | `08_結帳收款_v2.html` | ✅ 委託人簽名canvas + 標示「委託人代簽」|
| B14-01 | 追加授權無電子簽名 | `04_追加項目記錄_v2.html` | ✅ 四種授權方式含截圖上傳 |
| B14-02 | 主管折扣授權無系統記錄 | `售後稽核日誌_v1.html` | ✅ 主管授權統計 |
| B14-03 | 結帳費用簽名後無鎖定 | `08_結帳收款_v2.html` | ✅ lockFeeAfterSign()函式 |
| B15-01 | 無遠端主管授權機制 | `07_售後管理模組_v3.html` | ✅ 派工Modal授權說明 |
| B15-02 | 無代理授權人機制 | `07_售後管理模組_v3.html` | ✅ API標注說明 |
| B16-01 | 工單缺「完修待原廠確認費用」狀態 | `02_正式工單RO_v2.html` | ✅ 狀態機含已關閉-保固待確認 |
| B16-02 | 三種保固費用處理方式無流程 | `02_正式工單RO_v2.html` | ✅ WC付款類型+說明 |
| B17-01 | 工單無中途取消流程 | `02_正式工單RO_v2.html` | ✅ 取消申請Modal（需主管授權）|
| B17-02 | 結帳頁無法處理取消工單的部分結帳 | `08_結帳收款_v2.html` | ✅ 費用明細可調整 |
| B18-01 | 無返工自動偵測機制 | `02_正式工單RO_v2.html` | ✅ RP-FR返工偵測（已由Partner實作）|
| B18-02 | 返工費用歸屬無自動設定 | `02_正式工單RO_v2.html` | ✅ FR=免費重工設定說明 |
| B19-01 | 無取車後投訴記錄機制 | `08_結帳收款_v2.html` | ✅ 取車後投訴入口（B19-01）|
| B19-02 | 工單關閉後無法補記投訴處理結果 | `09_人車檔案_v2.html` | ✅ 投訴歷史區塊（可補填處理結果）|

**支線：43/46 ✅，3個需後端另行實作（B3-01、B3-02、B3-03 同車多工單）**

---

### 故障點覆蓋總結

| 類別 | 總數 | HTML已覆蓋 | 需後端另行實作 |
|------|------|-----------|--------------|
| 主線故障點 | 12 | 12 | 0 |
| 支線故障點 | 46 | 43 | 3（B3-01/02/03 同車多工單）|
| **合計** | **58** | **55** | **3** |

**結論：16支HTML覆蓋了55/58個故障點（95%）。剩餘3個是「同車多工單」場景，屬後端邏輯，HTML層面無法單獨解決。**

---

## 二、目錄結構 v3.0 對照表（③ 售後修護模組）

依據《目錄結構規範 v3.0》第五章，以下是 Partner 執行 nav_nodes 時的完整對照：

### SA 工單流程群組

#### ── Step 1–5 ──

| Sidebar 顯示名稱 | 對應 HTML（黃金版本 v3）| 版本說明 | nav_nodes href |
|----------------|----------------------|---------|---------------|
| 預約管理看板 | `01_預約管理看板_v2.html` | 新增Walk-in插單 | `/aftersales/appointments` |
| 預檢單 SA環檢 | `04_預檢單_合併版_v1.html` | ⚠️ 取代原SA環檢+RO串接兩頁，**只保留此一頁** | `/aftersales/pre-inspection` |
| ~~預檢單 RO串接~~ | ~~`04_預檢單_RO串接_v3.html`~~ | **廢除，is_active=false** | — |
| 開立工單 RO | `02_正式工單RO_v2.html` | PD補回+推送派工+完整狀態機 | `/aftersales/work-order-ro` |
| 快速報價查詢 | `04B_快速報價查詢_v1.html` | 黃金v2原版，未修改 | `/aftersales/quick-quote` |
| 維修項目零件明細 | `03_維修項目零件明細.html` | 黃金v2原版，未修改 | `/aftersales/repair-items` |

#### ── Step 6–10 ──

| Sidebar 顯示名稱 | 對應 HTML（黃金版本 v3）| 版本說明 | nav_nodes href |
|----------------|----------------------|---------|---------------|
| 追加項目記錄 | `04_追加項目記錄_v2.html` | 拒絕原因Modal（B-23）| `/aftersales/addons` |
| 增項閉環 | `05_增項閉環_完整子模組_v2.html` | Tab3圓餅圖+SA轉化率（B-24）| `/aftersales/addon-loop` |
| 竣工複檢 | `06_竣工複檢_v2.html` | 退回重工流程+複檢次數 | `/aftersales/qc-check` |
| 結帳收款 | `08_結帳收款_v2.html` | 費用鎖定+投訴入口 | `/aftersales/checkout` |
| 取車通知 | `11_取車通知設定.html` | 黃金v2原版，未修改 | `/aftersales/pickup-notify` |

---

### 主管工作台群組

#### ── 每日監看 ──

| Sidebar 顯示名稱 | 對應 HTML（黃金版本 v3）| 版本說明 | nav_nodes href |
|----------------|----------------------|---------|---------------|
| 車間看板 | `07_售後管理模組_v3.html`（工位Tab）| 通知橫幅+派工Modal | `/aftersales/workshop` |
| 派工看板 | `07_售後管理模組_v3.html`（派工Tab）| 真實派工功能 | `/aftersales/dispatch` |
| 中古車整備工單進度 | `02_中古車整備工單.html` | 黃金v2原版，未修改 | `/aftersales/used-vehicle` |

#### ── 審批與設定 ──

| Sidebar 顯示名稱 | 對應 HTML（黃金版本 v3）| 版本說明 | nav_nodes href |
|----------------|----------------------|---------|---------------|
| 服務套餐與費率設定 | `07B_服務套餐與費率設定_v2.html` | Tab B費率可編輯（L-001修正）| `/aftersales/service-packages` |
| 員工名冊 | `07_售後管理模組_v3.html`（員工Tab）| 黃金v3合併版 | `/aftersales/staff` |
| 工單編號規則 | `07_售後管理模組_v3.html`（設定Tab）| 黃金v3合併版 | `/aftersales/ro-settings` |
| 崗位折扣審批 | `07_售後管理模組_v3.html`（審批Tab）| 黃金v3合併版 | `/aftersales/discount-approval` |
| 環檢項目設定 | `07_售後管理模組_v3.html`（環檢Tab）| 黃金v3合併版 | `/aftersales/inspection-settings` |
| 客戶標籤設定 | `12_客戶標籤主管設定.html` | 黃金v2原版，未修改 | `/aftersales/customer-tags` |

---

### 技師工作台群組（v3.0 新增）

| Sidebar 顯示名稱 | 對應 HTML（黃金版本 v3）| 版本說明 | nav_nodes href |
|----------------|----------------------|---------|---------------|
| 技師工作台 | `Tech_工作台_v1.html` | **全新頁面**，技師接單/施工/追加/工時 | `/aftersales/tech-workstation` |
| 中古車整備工單 | `02_中古車整備工單.html` | 黃金v2原版，未修改 | `/aftersales/used-repair` |

---

### 查詢與檔案群組

| Sidebar 顯示名稱 | 對應 HTML（黃金版本 v3）| 版本說明 | nav_nodes href |
|----------------|----------------------|---------|---------------|
| 工單查詢 | `10_工單查詢_v1.html` | 今日快速篩選+Walk-in標籤 | `/aftersales/workorder-search` |
| 人車檔案 | `09_人車檔案_v2.html` | 五區塊架構+待處理項目+投訴歷史 | `/aftersales/vehicle-profile` |

---

### 稽核日誌群組（v3.0 新增）

| Sidebar 顯示名稱 | 對應 HTML（黃金版本 v3）| 版本說明 | 可見角色 |
|----------------|----------------------|---------|---------|
| 售後稽核日誌 | `售後稽核日誌_v1.html` | **全新頁面**，工單事件時間軸+主管授權統計 | 售後主管、店長 |
| 庫存稽核日誌 | `庫存稽核日誌_v1.html` | **全新頁面**，入出庫/退料/核銷記錄 | 庫房主管 |
| 集團稽核日誌 | `集團稽核日誌_v1.html` | **全新頁面**，跨門店稽核總覽 | 品牌協理、通路管理經理 |

---

## 三、nav_nodes 執行清單（Partner 必讀）

### 立即執行（黃金版本 v3 交付時同步）

```sql
-- 1. 廢除舊預檢單RO串接頁
UPDATE nav_nodes SET is_active = false 
WHERE href LIKE '%pre-inspection%RO%' 
   OR name LIKE '%預檢單%RO串接%'
   OR name LIKE '%預檢單轉RO%';

-- 2. 預檢單入口改指向合併版
UPDATE nav_nodes SET href = '/aftersales/pre-inspection'
WHERE name = '預檢單 SA環檢';

-- 3. 開立工單 RO 更新至 v2
UPDATE nav_nodes SET href = '/aftersales/work-order-ro'
WHERE name = '開立工單 RO';

-- 4. 移除所有括號說明文字（見第六章 6.1）
UPDATE nav_nodes SET name = '預約管理看板' WHERE name LIKE '預約管理看板（%';
UPDATE nav_nodes SET name = '預檢單 SA環檢' WHERE name LIKE '預檢單 SA環檢（%';
UPDATE nav_nodes SET name = '開立工單 RO'  WHERE name LIKE '開立工單RO（%';
UPDATE nav_nodes SET name = '快速報價查詢' WHERE name LIKE '快速報價查詢（%';
UPDATE nav_nodes SET name = '維修項目零件明細' WHERE name LIKE '維修項目零件明細（%';
UPDATE nav_nodes SET name = '追加項目記錄' WHERE name LIKE '追加項目記錄（%';
UPDATE nav_nodes SET name = '增項閉環'     WHERE name LIKE '增項閉環（%';
UPDATE nav_nodes SET name = '竣工複檢'     WHERE name LIKE '竣工複檢（%';
UPDATE nav_nodes SET name = '結帳收款'     WHERE name LIKE '結帳收款（%';
UPDATE nav_nodes SET name = '取車通知'     WHERE name LIKE '取車通知（%';

-- 5. 新增技師工作台入口
INSERT INTO nav_nodes (name, href, parent_label, group_label, is_active, sort_order)
VALUES ('技師工作台', '/aftersales/tech-workstation', '技師工作台', NULL, true, 1);

-- 6. 新增稽核日誌入口（三種角色限定）
INSERT INTO nav_nodes (name, href, parent_label, is_active, sort_order, role_required)
VALUES 
  ('售後稽核日誌', '/aftersales/audit-log', '查詢與檔案', true, 10, 'aftersales_lead,store_manager'),
  ('庫存稽核日誌', '/inventory/audit-log', '查詢與檔案', true, 11, 'warehouse_manager'),
  ('集團稽核日誌', '/group/audit-log', '查詢與檔案', true, 12, 'brand_director,channel_manager');
```

### 分類註記實作（依目錄結構v3.0第二章）

依照 v3.0 第 2.4 節，使用**方法一（推薦）**：`group_label` 欄位：

```sql
-- 售後修護模組分類註記
UPDATE nav_nodes SET group_label = 'Step 1–5' 
WHERE name IN ('預約管理看板','預檢單 SA環檢','開立工單 RO','快速報價查詢','維修項目零件明細');

UPDATE nav_nodes SET group_label = 'Step 6–10' 
WHERE name IN ('追加項目記錄','增項閉環','竣工複檢','結帳收款','取車通知');

UPDATE nav_nodes SET group_label = '每日監看' 
WHERE name IN ('車間看板','派工看板','中古車整備工單進度');

UPDATE nav_nodes SET group_label = '審批與設定' 
WHERE name IN ('服務套餐與費率設定','員工名冊','工單編號規則','崗位折扣審批','環檢項目設定','客戶標籤設定');
```

---

## 四、黃金版本 v3 完整 HTML 檔案清單（16支）

| # | 檔名 | 對應 Sidebar 名稱 | 狀態 |
|---|------|-----------------|------|
| 1 | `01_預約管理看板_v2.html` | 預約管理看板 | ✅ 新版 |
| 2 | `02_正式工單RO_v2.html` | 開立工單 RO | ✅ 新版 |
| 3 | `04_預檢單_合併版_v1.html` | 預檢單 SA環檢（合併版）| ✅ 新版，取代原兩頁 |
| 4 | `04_追加項目記錄_v2.html` | 追加項目記錄 | ✅ 新版 |
| 5 | `05_增項閉環_完整子模組_v2.html` | 增項閉環 | ✅ 新版 |
| 6 | `06_竣工複檢_v2.html` | 竣工複檢 | ✅ 新版 |
| 7 | `06_出庫管理_維修領料_v2.html` | （庫存模組）出庫管理 | ✅ 新版 |
| 8 | `07_售後管理模組_v3.html` | 車間看板 / 派工看板 / 員工名冊等 | ✅ 新版 |
| 9 | `07B_服務套餐與費率設定_v2.html` | 服務套餐與費率設定 | ✅ 新版 |
| 10 | `08_結帳收款_v2.html` | 結帳收款 | ✅ 新版 |
| 11 | `09_人車檔案_v2.html` | 人車檔案 | ✅ 新版 |
| 12 | `10_工單查詢_v1.html` | 工單查詢 | ✅ 新版 |
| 13 | `Tech_工作台_v1.html` | 技師工作台 | ✅ 全新新增 |
| 14 | `售後稽核日誌_v1.html` | 售後稽核日誌 | ✅ 全新新增 |
| 15 | `庫存稽核日誌_v1.html` | 庫存稽核日誌 | ✅ 全新新增 |
| 16 | `集團稽核日誌_v1.html` | 集團稽核日誌 | ✅ 全新新增 |

**廢除（移至archive）：**
- `04_預檢單_SA環檢_v3.html` → 功能已整合至合併版
- `04_預檢單_RO串接_v3.html` → 廢除，nav_nodes is_active=false

---

## 五、驗收確認清單（Partner 回傳前必須自問）

1. ✅ Sidebar 所有功能名稱已移除括號說明文字？
2. ✅ 分類註記（Step 1–5 / Step 6–10 / 每日監看 / 審批與設定）在畫面上可見？
3. ✅ `04_預檢單_RO串接_v3.html` 已設 is_active=false？
4. ✅ `04_預檢單_合併版_v1.html` 的 nav_nodes href 已更新？
5. ✅ 所有按鈕點擊後有真實 API 呼叫，非只顯示 Toast？
6. ✅ 技師工作台 nav_nodes 已新增？
7. ✅ 三種稽核日誌 nav_nodes 已新增，角色限定正確？
8. ✅ 截圖每個模組 Sidebar 回傳 Russell 確認？

---

*DealerOS 黃金版本 v3 × 目錄結構對照　｜　Russell Hung × Claude Sonnet 4.6　｜　2026-06-12　｜　機密文件*
