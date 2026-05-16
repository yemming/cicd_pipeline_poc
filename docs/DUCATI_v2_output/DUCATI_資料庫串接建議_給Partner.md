# DUCATI Taiwan 新系統　資料庫串接建議
**給 Partner 的技術交接文件**
版本：v1.0　｜　2026/05　｜　本文件為內部技術參考，請勿外傳

---

## 一、整體架構建議

目前所有 HTML 均為**純前端展示頁（Static HTML）**，內含模擬資料與互動邏輯。  
正式上線前，需將頁面改為**動態前端（呼叫後端 API）**，搭配關聯式資料庫運作。

### 建議技術堆疊

| 層級 | 建議選項 | 說明 |
|------|---------|------|
| 前端 | 現有 HTML + Fetch API | 現有頁面架構保留，改為呼叫 REST API |
| 後端 | Node.js (Express) 或 Laravel (PHP) | 依 Partner 熟悉度選擇 |
| 資料庫 | MySQL 8 / PostgreSQL | 關聯式，支援交易（Transaction）|
| 快取 | Redis | 庫存水位、即時看板用 |
| 通知 | LINE Notify API / SMTP | 推播通知、取車通知用 |

---

## 二、四大模組資料表設計建議

### 2.1 銷售接待模組（RS）

```sql
-- 客戶基本資料（手卡來源）
CREATE TABLE customers (
  customer_id   VARCHAR(20) PRIMARY KEY,  -- C + 年月 + 序號
  name          VARCHAR(50) NOT NULL,
  phone         VARCHAR(20),
  email         VARCHAR(100),
  id_number     VARCHAR(20),
  address       TEXT,
  source        ENUM('walk_in','referral','online','event'),
  tags          JSON,                      -- 客群標籤陣列
  created_at    DATETIME DEFAULT NOW(),
  updated_at    DATETIME ON UPDATE NOW()
);

-- 接待手卡（RS01）
CREATE TABLE sales_cards (
  card_id       VARCHAR(20) PRIMARY KEY,  -- SC + 年月 + 序號
  customer_id   VARCHAR(20) NOT NULL,
  rs_user_id    VARCHAR(20) NOT NULL,     -- 負責銷售顧問
  stage         ENUM('contact','interest','quote','order','delivered') DEFAULT 'contact',
  visit_date    DATE,
  interest_model VARCHAR(50),
  budget        DECIMAL(10,0),
  trade_in      BOOLEAN DEFAULT FALSE,
  note          TEXT,
  created_at    DATETIME DEFAULT NOW(),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- 試乘試駕（RS02）
CREATE TABLE test_rides (
  ride_id       VARCHAR(20) PRIMARY KEY,
  card_id       VARCHAR(20),
  vehicle_id    VARCHAR(20),              -- 關聯新車庫存
  ride_date     DATETIME,
  rider_name    VARCHAR(50),
  id_number     VARCHAR(20),
  license_class VARCHAR(10),
  signature     TEXT,                    -- Base64 電子簽名
  result        ENUM('positive','neutral','negative'),
  FOREIGN KEY (card_id) REFERENCES sales_cards(card_id)
);

-- 報價單 / 成交訂單（RS04）
CREATE TABLE sales_orders (
  order_id      VARCHAR(20) PRIMARY KEY,  -- SO + 年月 + 序號
  card_id       VARCHAR(20),
  vehicle_id    VARCHAR(20),
  list_price    DECIMAL(10,0),
  discount      DECIMAL(10,0),
  final_price   DECIMAL(10,0),
  payment_type  ENUM('cash','loan','lease'),
  status        ENUM('quote','confirmed','cancelled','delivered') DEFAULT 'quote',
  order_date    DATE,
  delivery_date DATE,
  FOREIGN KEY (card_id) REFERENCES sales_cards(card_id)
);
```

> **⚠️ 注意：** `sales_cards.stage` 欄位變動時，需同步更新 `RS_M1 銷售漏斗看板` 的統計。建議用 DB Trigger 或後端 Event 處理。

---

### 2.2 客服管理模組（CRM）

```sql
-- 電訪問卷定義（CRM02A / CRM02B）
CREATE TABLE survey_templates (
  template_id   INT AUTO_INCREMENT PRIMARY KEY,
  type          ENUM('sales','after_sales'),
  title         VARCHAR(100),
  questions     JSON,   -- [{id, text, type:'radio'/'text', options:[]}]
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    DATETIME DEFAULT NOW()
);

-- 電訪工作台記錄（CRM03A / CRM03B）
CREATE TABLE crm_calls (
  call_id       VARCHAR(20) PRIMARY KEY,
  type          ENUM('sales','after_sales'),
  customer_id   VARCHAR(20),
  user_id       VARCHAR(20),             -- 執行電訪的 CRM 人員
  template_id   INT,
  answers       JSON,                    -- 問卷回覆
  nps_score     TINYINT,                -- 0-10
  call_date     DATETIME,
  result        ENUM('completed','no_answer','refused','rescheduled'),
  next_call_date DATE,
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  FOREIGN KEY (template_id) REFERENCES survey_templates(template_id)
);

-- 推播通知設定（CRM06A / CRM06B）
CREATE TABLE push_rules (
  rule_id       INT AUTO_INCREMENT PRIMARY KEY,
  type          ENUM('sales','after_sales'),
  trigger_event VARCHAR(100),           -- 'delivery_done', 'service_done', 'birthday' 等
  channel       SET('line','sms','email'),
  template      TEXT,                   -- 訊息模板，支援 {{name}} 變數
  delay_days    INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE
);
```

> **⚠️ 注意：** NPS看板（CRM05A / CRM05B）的分數計算公式：
> `NPS = (推薦者% - 批評者%)` 其中推薦者 = score 9-10，批評者 = score 0-6。
> 建議在後端計算後以 API 傳回，避免前端每次重算。

---

### 2.3 售後修護模組（SA）

```sql
-- 預約（01_預約管理看板）
CREATE TABLE appointments (
  appt_id       VARCHAR(20) PRIMARY KEY,  -- AP + 年月日 + 序號
  customer_id   VARCHAR(20),
  vehicle_id    VARCHAR(20),
  appt_date     DATE,
  appt_time     TIME,
  technician_id VARCHAR(20),
  service_type  VARCHAR(100),
  status        ENUM('pending','confirmed','in_progress','done','cancelled') DEFAULT 'pending',
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- 正式工單 RO（02_正式工單RO）
CREATE TABLE repair_orders (
  ro_id         VARCHAR(20) PRIMARY KEY,  -- 前綴碼 + 年月日 + 序號
  appt_id       VARCHAR(20),
  customer_id   VARCHAR(20),
  vehicle_plate VARCHAR(15),
  vehicle_vin   VARCHAR(20),
  mileage       INT,
  sa_user_id    VARCHAR(20),
  business_type ENUM('warranty','self_pay','insurance','campaign'),
  payment_type  ENUM('cash','card','monthly','insurance'),
  status        ENUM('open','in_progress','waiting_parts','inspection','completed','closed'),
  open_time     DATETIME DEFAULT NOW(),
  close_time    DATETIME,
  total_amount  DECIMAL(10,0),
  FOREIGN KEY (customer_id) REFERENCES customers(customer_id)
);

-- 工單零件明細（03_維修項目零件明細）⭐ 跨模組串接點
CREATE TABLE ro_parts (
  line_id       INT AUTO_INCREMENT PRIMARY KEY,
  ro_id         VARCHAR(20),
  part_no       VARCHAR(50),             -- 關聯庫存 parts.part_no
  part_name     VARCHAR(100),
  qty_required  INT,
  qty_issued    INT DEFAULT 0,
  unit_price    DECIMAL(10,2),
  status        ENUM('pending','reserved','issued','returned') DEFAULT 'pending',
  FOREIGN KEY (ro_id) REFERENCES repair_orders(ro_id)
  -- ⭐ part_no 關聯庫存模組 inventory_items.part_no
);

-- 追加項目（04_追加項目記錄）⭐ 跨模組串接點
CREATE TABLE ro_addons (
  addon_id      INT AUTO_INCREMENT PRIMARY KEY,
  ro_id         VARCHAR(20),
  description   TEXT,
  safety_level  ENUM('urgent','suggested','optional'),
  customer_decision ENUM('approved','rejected','deferred'),
  part_reserved BOOLEAN DEFAULT FALSE,   -- ⭐ 車主同意後觸發庫存預留
  FOREIGN KEY (ro_id) REFERENCES repair_orders(ro_id)
);
```

> **⭐ 關鍵串接：**
> 1. `ro_parts` 新增時 → 呼叫庫存 API 確認可用量，不足則 `ro.status = 'waiting_parts'`
> 2. `ro_addons.customer_decision = 'approved'` → 觸發庫存預留（`inventory_reservations` 表新增一筆）

---

### 2.4 庫存管理模組（INV）

```sql
-- 商品主檔（03_基礎設定_商品基礎資料）
CREATE TABLE parts (
  part_no       VARCHAR(50) PRIMARY KEY,
  part_name     VARCHAR(100) NOT NULL,
  spec          VARCHAR(200),
  unit          VARCHAR(10),
  cost_price    DECIMAL(10,2),
  abc_class     ENUM('A','B','C') DEFAULT 'C',
  control_type  ENUM('serial','batch','normal') DEFAULT 'normal',
  is_active     BOOLEAN DEFAULT TRUE
);

-- 庫存即時數量（核心表）
CREATE TABLE inventory_items (
  inv_id        INT AUTO_INCREMENT PRIMARY KEY,
  warehouse_id  VARCHAR(20),
  part_no       VARCHAR(50),
  qty_on_hand   INT DEFAULT 0,           -- 實際在庫
  qty_reserved  INT DEFAULT 0,           -- 已預留（工單/追加）
  qty_in_transit INT DEFAULT 0,          -- 調撥在途
  qty_available INT GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,  -- 可用量
  min_level     INT DEFAULT 0,           -- 最小庫存水位
  reorder_point INT DEFAULT 0,           -- 再訂購點
  max_level     INT DEFAULT 0,           -- 最大庫存
  updated_at    DATETIME ON UPDATE NOW(),
  UNIQUE KEY (warehouse_id, part_no),
  FOREIGN KEY (part_no) REFERENCES parts(part_no)
);

-- 庫存異動記錄（所有入出庫共用）
CREATE TABLE inventory_transactions (
  txn_id        VARCHAR(30) PRIMARY KEY,
  txn_type      ENUM('purchase_in','transfer_in','internal_sale_in','return_in',
                      'repair_out','transfer_out','internal_sale_out','exception'),
  warehouse_id  VARCHAR(20),
  part_no       VARCHAR(50),
  qty           INT,                     -- 正數=入庫，負數=出庫
  ref_id        VARCHAR(30),             -- 關聯工單/採購單/調撥單
  user_id       VARCHAR(20),
  reason        TEXT,                    -- 例外出入庫必填
  txn_time      DATETIME DEFAULT NOW()
);

-- 備件預留（⭐ 跨模組串接）
CREATE TABLE inventory_reservations (
  reservation_id VARCHAR(20) PRIMARY KEY,
  ro_id         VARCHAR(20),             -- ⭐ 關聯售後工單
  part_no       VARCHAR(50),
  warehouse_id  VARCHAR(20),
  qty           INT,
  status        ENUM('reserved','issued','cancelled') DEFAULT 'reserved',
  created_at    DATETIME DEFAULT NOW(),
  FOREIGN KEY (ro_id) REFERENCES repair_orders(ro_id)
);
```

> **⚠️ 重要：** `inventory_items.qty_available` 建議用 Generated Column（如上）或由後端維護，**不要讓前端直接計算**，以免多人操作時出現競態條件（Race Condition）。  
> 高併發時建議搭配 **Redis** 做庫存快取層。

---

## 三、六大跨模組串接點　實作說明

### 串接點 1：工單零件 → 庫存出庫

```
頁面：03_維修項目零件明細 ↔ 06_出庫管理_維修領料

流程：
  SA 確認零件清單（前端）
    → POST /api/ro/{ro_id}/parts
    → 後端查 inventory_items.qty_available
    → 足夠：建立 inventory_reservations，RO維持 'in_progress'
    → 不足：RO status → 'waiting_parts'，觸發告警
```

### 串接點 2：追加項目 → 備件預留

```
頁面：04_追加項目記錄 ↔ 10_預警告警_工單增項閉環

流程：
  車主同意追加（前端點「同意」）
    → PATCH /api/ro/{ro_id}/addons/{addon_id} { decision: 'approved' }
    → 後端建立 inventory_reservations
    → 若庫存不足 → 觸發告警 + 建立採購需求
```

### 串接點 3：調撥到貨 → 工單待料解除

```
頁面：05_入庫管理_調撥入庫 ↔ 售後工單待料狀態

流程：
  倉管確認調撥到貨（前端）
    → POST /api/inventory/transfer-in
    → 後端更新 inventory_items.qty_on_hand
    → 查詢所有 'waiting_parts' 且有對應 reservation 的 RO
    → 批次更新 RO status → 'in_progress'
    → 推送通知給 SA
```

### 串接點 4：竣工複檢 → 保固舊件登錄

```
頁面：06_竣工複檢 ↔ 11_保固索賠_舊件管理

流程：
  竣工複檢通過（前端電子簽名完成）
    → PATCH /api/ro/{ro_id}/status { status: 'completed' }
    → 後端判斷 business_type == 'warranty'
    → 自動建立 warranty_parts 記錄（舊件登錄暫存倉）
    → 觸發保固索賠流程
```

### 串接點 5：人車檔案 → CRM 客戶基盤同步

```
頁面：09_人車檔案 ↔ CRM01B_售後客戶基盤

流程：
  工單關閉（RO status → 'closed'）
    → 後端 Event / Trigger
    → 更新 customers 表（最後回廠日、累計消費）
    → CRM01B 查詢時即時反映
    建議：使用 DB View 或定期同步，不要雙重寫入
```

### 串接點 6：銷售庫存展示 → 庫存管理即時數據

```
頁面：RS03A / RS03B ↔ 07_庫存管理_商品庫存查詢

流程：
  RS 端開啟新車/中古車庫存看板
    → GET /api/inventory/vehicles?type=new|used
    → 回傳 inventory_items（唯讀）
    RS 端沒有寫入權限，僅顯示
```

---

## 四、使用者與權限系統建議

```sql
-- 使用者帳號
CREATE TABLE users (
  user_id       VARCHAR(20) PRIMARY KEY,
  username      VARCHAR(50) UNIQUE,
  password_hash VARCHAR(255),
  full_name     VARCHAR(50),
  role          ENUM('rs','sales_mgr','crm_mgr','sa','sa_mgr','warehouse','warehouse_mgr','store_mgr'),
  store_id      VARCHAR(20),
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    DATETIME
);
```

### 各角色 API 存取矩陣

| 角色 | 銷售接待 | 客服管理 | 售後修護 | 庫存管理 |
|------|---------|---------|---------|---------|
| RS 銷售顧問 | R/W | R（CRM客盤） | — | R（庫存展示） |
| 銷售主管 | R/W/管理 | R/W | — | R |
| CRM主管 | R | R/W/管理 | R（人車檔案） | — |
| SA 售後接待 | — | R（售後CRM） | R/W（接待部分） | R（零件查詢） |
| 售後主管 | — | R/W | R/W/管理 | R |
| 倉管人員 | — | — | R（工單查詢） | R/W（部分） |
| 庫房主管 | — | — | R | R/W/管理 |
| 店長 | R | R/W | R | R |

---

## 五、建置優先順序建議

### Phase 1（基礎，約 4-6 週）
1. 使用者認證系統（JWT）
2. `customers` / `users` / `parts` 基礎資料表
3. 銷售接待：手卡 → 訂單流程 API
4. 售後修護：工單開立 → 結帳 API

### Phase 2（串接，約 3-4 週）
5. 庫存異動（入庫/出庫/預留）API
6. **串接點 1 & 2**：工單零件 ↔ 庫存
7. **串接點 3**：調撥到貨 → 工單解除待料
8. 推播通知（取車通知、告警）

### Phase 3（完善，約 3-4 週）
9. CRM 電訪 / NPS 計算
10. **串接點 4**：保固索賠流程
11. **串接點 5**：人車檔案 ↔ CRM 同步
12. 盤點管理 / 分析報表

---

## 六、前端改造重點（HTML → API 串接）

每支 HTML 目前使用 **hardcoded 模擬資料**，上線前需：

1. **找到模擬資料段落**，通常是 `const mockData = [...]` 或 `const demoData = {...}`
2. **改為 Fetch 呼叫**：
```javascript
// 原本
const data = mockData;

// 改為
const res = await fetch('/api/repair-orders?status=open', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
});
const data = await res.json();
```
3. **表單送出** 從前端模擬改為 `POST /api/...`
4. **權限控制**：登入後依 `role` 隱藏/顯示對應選單項目

---

## 七、注意事項與風險提醒

| 項目 | 說明 |
|------|------|
| **庫存競態條件** | 多人同時領料時需用 DB Transaction + Row Lock，避免超賣 |
| **工單前綴碼** | 格式設定後不可隨意更改，會影響歷史工單查詢 |
| **07_售後管理模組_v2.html** | 目前整合四功能於一頁，正式系統建議拆開，分別設定 SA 與主管權限 |
| **LINE Notify** | 2025 年後 LINE Notify API 有異動，建議改用 LINE Messaging API |
| **個資保護** | 客戶身分證、電話等欄位建議加密儲存（AES-256）|
| **備份策略** | 庫存異動記錄為不可刪除的 append-only 資料，建議每日備份 |

---

*本文件由 Claude AI 根據 DUCATI Taiwan 系統架構自動生成，僅供技術參考。實際實作前請與開發團隊確認細節。*
*DUCATI Taiwan 內部文件　請勿外傳*
