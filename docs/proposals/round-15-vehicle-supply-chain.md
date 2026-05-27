# 第十五輪 BDN — 整車供應鏈模組（新車 PDI 鏈 + 中古車整備鏈）

**日期**：2026-05-27
**來源 spec**：`docs/20260527/`（Partner 寄來，2026-05-26）
**包含**：
- Pack A：7 支同名覆蓋頁面（修正既有實作的錯誤）
- Pack B：8 支全新頁面（補完整車供應鏈入庫流程）
- v2 完整規格書 `DealerOS_整車庫存管理模組_需求規格書_v2.md`

---

## 一、為什麼做這輪 — 核心邏輯錯誤的根因

現行系統有兩個**根本性邏輯錯誤**：

### 錯誤 1：PDI 工單觸發時機完全錯誤
- **現況**：RS05 交車管理 STEP 1 有「建立 PDI 工單」按鈕 — 業務在交車當天才建 PDI 工單
- **正確邏輯**：PDI 工單必須在**車輛到港入庫時**（INV02 到港確認）自動觸發。技師完成 PDI、主管核准後，車輛狀態才變「可銷售（AVAILABLE）」。RS05 交車時 PDI 早就完成，只需確認 ✅
- **影響**：整個整車供應鏈鏈路斷掉 — 沒有「待 PDI」狀態、沒有「PDI 費用計入整車成本」的成本結構

### 錯誤 2：中古車收購確認後系統零動作
- **現況**：RS06 Tab 4「收購決策」下拉只是普通 `<select>`，確認按鈕只彈 toast、沒呼叫 API
- **正確邏輯**：確認收購 → 建中古車車輛主檔（USED）+ 觸發整備工單 PD-UC → 整備完成費用寫回整車成本 → 車輛變 AVAILABLE
- **影響**：中古車入庫整備鏈完全沒接上，看板上沒有真實流程

### 補完整鏈路（Pack B 新頁面）
為了讓上面兩條鏈跑得通，要補 8 個新頁面：

```
新車：RS_INV01 採購單 → RS_INV02 到港確認（觸發PDI） → 02_PDI工單執行
                                                         ↓ 費用寫回
                                                       車輛 AVAILABLE → RS03A → RS05 交車
                          → RS_INV03 財務結算（關運保分攤）
                          → RS_INV04 車輛調撥
                          → RS_INV06 出庫管理

中古車：RS06 評估鑑價（置換） ↘
       RS_INV05 中古車收購申請（直購） → 02_中古車整備工單 → 費用寫回 → RS03B
```

---

## 二、Ground-truth 現況（DB / Route / Helper）

### 2.1 DB 表現況

| 表 | 狀態 | 現役欄位（重點） |
|---|---|---|
| `new_car_inventory` | ✅ 存在 | `status` 現有 6 值（`in_transit/arrived/displayed/reserved/sold/delivered`）— **缺 `pending_pdi`**；缺 PDI 成本欄 |
| `used_car_inventory` | ✅ 存在 | `acquisition_source` 已有 `trade_in/auction/direct_buy` ✅；status 含 `pending_inspection`；缺 `recon_cost` / 整車成本欄 |
| `repair_orders` | ✅ 存在 | `prefix_p1` 5 種（MN/RP/WC/AC/OT）— **缺 `PD`**；`prefix_p2` 3 種（CP/WR/FR）— **缺 `IN`** |
| `purchase_orders` | ⚠️ 是「零件採購」（vendor_id 對零件供應商）| 整車採購要新表或加 type 區隔 |
| `stock_transfers` | ⚠️ 是「零件調撥」| 整車調撥要新表 |
| `customer_vehicles` | ✅ 存在 | 客戶名下車輛（不是庫存） |
| `vehicles` | ❌ 不存在 | — |
| `vehicle_arrivals` / `stock_arrivals` | ❌ 不存在 | 到港確認批次表 |
| `vehicle_outbound` | ❌ 不存在 | 出庫紀錄表 |
| `used_purchase_requests` | ❌ 不存在 | 中古車直購申請表 |

### 2.2 Route 現況

| Spec ID | 現役 Route | 對應 domain helper |
|---|---|---|
| RS03A 新車庫存看板 | `/sales/showroom/new-cars` | `src/domain/new-car-inventory.ts`（298 lines, 現役） + `sales-newcar-inventory.ts`（42 lines, 舊版） |
| RS03B 中古車庫存看板 | `/sales/showroom/used-cars` | `src/domain/used-car-inventory.ts`（409 lines, 現役） |
| RS05 交車管理 | `/sales/delivery` | `src/domain/sales-delivery.ts` + `.constants.ts` |
| RS06 中古車評估鑑價 | `/usedcar/evaluations/[id]` | `src/domain/used-car-evaluations.ts` |
| 02 正式工單 RO | `/parts/aftersales/repair-orders/new` | `src/domain/repair-orders.constants.ts` |
| 09 人車檔案 | （待確認，可能在 `/crm/**`） | — |
| 10 工單查詢 | `/parts/aftersales/ro-search`（待確認） | `src/domain/repair-orders.ts` |

### 2.3 Pack B 8 頁全部「無對應 route」、全部要新建。

---

## 三、Schema Migration 計畫（一次性 apply）

### 3.1 ALTER 既有表

```sql
-- (1) 新車庫存加 PDI 狀態 + 成本欄位
ALTER TABLE new_car_inventory
  ADD COLUMN pdi_workorder_id uuid REFERENCES repair_orders(id),
  ADD COLUMN pdi_labor_cost numeric DEFAULT 0,
  ADD COLUMN pdi_parts_cost numeric DEFAULT 0,
  ADD COLUMN transfer_freight_cost numeric DEFAULT 0,
  ADD COLUMN total_cost numeric GENERATED ALWAYS AS
    (COALESCE(cost_price,0) + COALESCE(pdi_labor_cost,0) + COALESCE(pdi_parts_cost,0) + COALESCE(transfer_freight_cost,0)) STORED,
  ADD COLUMN purchase_order_id uuid,
  ADD COLUMN arrival_batch_id uuid,
  ADD COLUMN damage_flag boolean DEFAULT false,
  ADD COLUMN damage_notes text;

-- status 改用 text + CHECK（避免 enum migration 痛）
ALTER TABLE new_car_inventory
  ADD CONSTRAINT new_car_inventory_status_chk
  CHECK (status IN ('in_transit','pending_pdi','arrived','displayed','reserved','sold','delivered','damaged'));

-- (2) 中古車庫存加整備成本 + PDI 工單 FK
ALTER TABLE used_car_inventory
  ADD COLUMN recon_workorder_id uuid REFERENCES repair_orders(id),
  ADD COLUMN recon_labor_cost numeric DEFAULT 0,
  ADD COLUMN recon_parts_cost numeric DEFAULT 0,
  ADD COLUMN bodywork_cost numeric DEFAULT 0,
  ADD COLUMN transfer_freight_cost numeric DEFAULT 0,
  ADD COLUMN total_cost numeric GENERATED ALWAYS AS
    (COALESCE(acquisition_price,0) + COALESCE(recon_labor_cost,0) + COALESCE(recon_parts_cost,0) + COALESCE(bodywork_cost,0) + COALESCE(transfer_freight_cost,0)) STORED;

-- status 加 pending_recon
ALTER TABLE used_car_inventory
  ADD CONSTRAINT used_car_inventory_status_chk
  CHECK (status IN ('evaluation','pending_recon','pending_inspection','available','reserved','sold','consignment','in_transit_transfer','inactive'));

-- (3) repair_orders 擴 prefix + 費用歸屬
-- prefix_p1 加 PD，prefix_p2 加 IN — 改 repair-orders.constants.ts 即可（hardcoded TS enum）
-- DB 層加 fee_allocation 欄位
ALTER TABLE repair_orders
  ADD COLUMN fee_allocation text DEFAULT 'customer'
    CHECK (fee_allocation IN ('customer','vehicle_cost','warranty_vendor')),
  ADD COLUMN related_new_car_id uuid REFERENCES new_car_inventory(id),
  ADD COLUMN related_used_car_id uuid REFERENCES used_car_inventory(id);
```

### 3.2 新增表（4 張）

```sql
-- (A) 整車採購單（新車批次）
CREATE TABLE vehicle_purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  subsidiary_id uuid REFERENCES subsidiaries(id),
  po_no text NOT NULL,                   -- VPO-YYYYMM-NNN
  supplier_name text,
  order_date date,
  expected_arrival date,
  warehouse_id uuid,
  currency text DEFAULT 'TWD',
  exchange_rate numeric DEFAULT 1,
  freight_estimate numeric DEFAULT 0,
  insurance_estimate numeric DEFAULT 0,
  customs_rate numeric DEFAULT 0,
  status text DEFAULT 'draft'
    CHECK (status IN ('draft','submitted','in_transit','arrived','closed','cancelled')),
  notes text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  UNIQUE (brand_id, po_no)
);

CREATE TABLE vehicle_purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES vehicle_purchase_orders(id) ON DELETE CASCADE,
  seq int,
  vehicle_model_id uuid REFERENCES vehicle_models(id),
  color text,
  color_code text,
  qty int DEFAULT 1,
  unit_price_source numeric,
  unit_price_twd numeric,
  factory_order_no text,
  created_at timestamptz DEFAULT now()
);

-- (B) 到港確認批次（觸發 PDI 工單的入口）
CREATE TABLE vehicle_arrivals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  arrival_no text NOT NULL,              -- ARR-YYYYMMDD-NNN
  purchase_order_id uuid REFERENCES vehicle_purchase_orders(id),
  arrival_date date,
  warehouse_id uuid,
  total_vehicles int DEFAULT 0,
  confirmed_vehicles int DEFAULT 0,
  damaged_vehicles int DEFAULT 0,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','partial','completed')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  UNIQUE (brand_id, arrival_no)
);

-- (C) 整車調撥單
CREATE TABLE vehicle_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  transfer_no text NOT NULL,             -- VTR-YYYYMMDD-NNN
  vehicle_kind text CHECK (vehicle_kind IN ('new','used')),
  new_car_id uuid REFERENCES new_car_inventory(id),
  used_car_id uuid REFERENCES used_car_inventory(id),
  from_warehouse_id uuid,
  to_warehouse_id uuid,
  transfer_date date,
  freight_type text CHECK (freight_type IN ('A_VEHICLE_COST','B_FROM','C_TO','D_SPLIT','E_NONE')),
  freight_amount numeric DEFAULT 0,
  carrier text,
  reason text,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','in_transit','completed','cancelled')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  UNIQUE (brand_id, transfer_no)
);

-- (D) 中古車收購申請（直購）
CREATE TABLE used_purchase_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  application_no text NOT NULL,          -- BUY-YYYYMM-NNN
  source_type text CHECK (source_type IN ('auction','personal','dealer','other')),
  seller_name text,
  seller_phone text,
  seller_id_no text,
  vin text,
  vehicle_model_id uuid REFERENCES vehicle_models(id),
  year int,
  color text,
  mileage_km int,
  grade_ext text CHECK (grade_ext IN ('A','B','C','D')),
  grade_mech text CHECK (grade_mech IN ('A','B','C','D')),
  market_ref_price numeric,
  recon_estimate numeric,
  suggested_price numeric,
  actual_price numeric,
  decision text CHECK (decision IN ('approved','conditional','rejected')),
  used_car_id uuid REFERENCES used_car_inventory(id),  -- 確認後建主檔回填
  recon_workorder_id uuid REFERENCES repair_orders(id),
  images jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  UNIQUE (brand_id, application_no)
);
```

### 3.3 RLS policy（每張新表都要）

每張新表 4 條 policy：`auth.uid() IS NOT NULL` + `user_has_brand(brand_id)` 套用到 SELECT/INSERT/UPDATE/DELETE。**新表 migration 必帶 RLS 是強制紀律**（feedback memory `feedback_rls_migration_sop.md`）。

### 3.4 出庫管理（RS_INV06）— 不用新表，用 view 組

不建 `vehicle_outbound` 表，改用 view aggregate：
- 銷售出庫：`new_car_inventory.status='delivered'` 或 `used_car_inventory.status='sold'`
- 調撥出庫：`vehicle_transfers WHERE status='in_transit'`
- 試乘出庫：從 `test_ride_bookings`（如已存在）撈

---

## 四、12 條 Spec-to-Feature 任務切分

按 PDI 鏈依賴順序、可平行的綁一組。每條都是一支獨立 sub-agent 跑。

### 🔴 Phase 0（前置 — schema + constants 擴充，**必須先做完**）

**T0**：Schema migration（一次性 apply）+ repair-orders constants 加 PD/IN
- ALTER 3 張表 + CREATE 4 張新表 + RLS policy
- 改 `src/domain/repair-orders.constants.ts`：
  - `PrefixP1` 加 `"PD"`、`PREFIX_P1_DEFS` 加 `{ code: "PD", name: "PDI整備", desc: "Pre-Delivery Inspection · 內部結算" }`
  - `PrefixP2` 加 `"IN"`、`PREFIX_P2_DEFS` 加 `{ code: "IN", name: "內部結算", desc: "Internal · 整車成本轉入" }`
  - `PREFIX_COMBO_RULES` 加：`{ p1:"PD", p2:"IN", verdict:"valid", accounting:"VEHICLE_COST"(新), description:"✅ PD-IN PDI整備 · 整車成本轉入" }`
  - `AccountingCategory` 加 `"VEHICLE_COST"`
- 工作量：M（半天～1 天）
- 阻塞：T1～T11 全部都要等 T0 完成

### 🔴 Phase 1（Pack A 連帶修正 — 都是改既有，不依賴 Pack B）

**T1** · RS03A 新車庫存看板（M）— `/sales/showroom/new-cars`
- 加 `pending_pdi` 狀態（紫色 badge）
- 卡片底部 PDI 進度條（綠色 % bar）
- 「待 PDI」車輛的「報價」按鈕鎖（disabled）
- 新增整車成本 / 毛利欄（只主管可見、權限 `sales.cost.view`）
- KPI 改 4 項動態（可售 / 待 PDI / 已保留 / 在途）
- KPI 下方藍色入庫橫幅 → INV02

**T2** · RS03B 中古車庫存看板（M）— `/sales/showroom/used-cars`
- 入庫橫幅（置換→RS06 / 直購→RS_INV05）綠色
- 來源 badge（🔄置換 from `acquisition_source='trade_in'` / 🛒直購 from `'direct_buy'`）
- Filter 加「來源類型」下拉
- 卡片 3 行成本：收購成本 / 整備成本 / 整車成本合計
- 待整備車輛卡片頂部顯示紫色整備工單號

**T3** · 02 正式工單 RO（S）— `/parts/aftersales/repair-orders/new`
- P1 第 6 種「PD（PDI整備）」綠色
- 選 PD 時 P2 自動鎖 IN、其他選項隱藏
- 顯示綠色費用說明卡（整車成本 / 車主應付 NT$0）
- 確認按鈕變綠色、toast 提示

**T4** · 10 工單查詢 — PD 工單顯示樣式（S）— `/parts/aftersales/ro-search`
- 列表加 PD 工單範例（含 PD-IN 新車 + PD-UC 中古）
- 車主欄改 `[內部] 海德生`
- 金額欄改綠色「整車成本」tag
- 業務類型 badge：PD=紫 / WC=綠 / RP=琥珀 / AC=紅 / MN=深藍

**T5** · 09 人車檔案 — 工單歷史補類型欄（S）
- 需先找 route 位置（探勘 todo）
- 工單歷史表加「類型」彩色 badge 欄
- PD 工單金額欄顯示「整車成本」綠 tag

T1 + T2 + T3 + T4 + T5 可**並行**（不互相依賴），五隻 sub-agent 同時跑。

### 🔴 Phase 2（Pack B 新車鏈 — 從採購到 PDI 完成可售）

**T6** · RS_INV01 整車採購訂單（M）— **新建** `/sales/inventory/purchase-orders`
- 列表（list）+ 新增 wizard + detail 三件套（照 design pattern）
- domain helper：`src/domain/vehicle-purchase-orders.ts`
- 提交後：每筆採購明細在 `new_car_inventory` 自動建一筆 row、`status='in_transit'`、關聯 `purchase_order_id` + `arrival_batch_id`

**T7** · RS_INV02 到港確認（M）— **新建** `/sales/inventory/arrival-confirmation`
- Wizard 4 步驟（選採購單→掃 VIN→損傷確認→批次完成）
- 完成觸發：
  - `new_car_inventory.status` 從 `in_transit` → `pending_pdi`
  - 對每台車建一筆 `repair_orders`（kind=PD-IN、fee_allocation=`vehicle_cost`、`related_new_car_id`）
  - notification dispatch（售後主管）
- domain helper：`src/domain/vehicle-arrivals.ts`
- **關鍵**：要驗證 PDI 工單真的建出來、看板狀態真的變

**T8** · 02_PDI工單執行（L）— **新建** `/parts/aftersales/workorders/[id]`（或在現有 RO detail 補 kind 分流）
- 5 個 Tab（工單資訊 / 29 項 checklist / 零件工時 / 費用彙總 / 完成核准）
- 完成核准後：
  - RO `status='已關單'`
  - 回寫 `new_car_inventory.pdi_labor_cost` + `pdi_parts_cost`
  - 觸發 `new_car_inventory.status` 從 `pending_pdi` → `displayed`（可售）
- domain helper：擴 `src/domain/repair-orders.ts` 或新增 `pdi-workorders.ts`

**T9** · RS05 交車管理修正（M）— `/sales/delivery`
- STEP 1 改「PDI 完成確認」
- 移除「建立 PDI 工單」按鈕
- 三狀態卡：PDI已完成 / PDI進行中 / PDI未完成
- PDI 未完成下一步鎖

T6 → T7 → T8 依賴鏈強（前者完成才能 demo 後者）；T9 可等 T8 確定 PDI 工單流程後並行。

### 🔴 Phase 3（Pack B 中古車鏈 + 補件）

**T10** · RS_INV05 中古車收購申請（M）— **新建** `/sales/inventory/used-purchase`
- Wizard 4 步驟（基本資訊 → 車輛資料 → 鑑價 → 收購決策）
- 確認收購後：
  - 建 `used_car_inventory` row（`acquisition_source='direct_buy'`、`status='pending_recon'`）
  - 建 `repair_orders`（kind=PD-UC、fee_allocation=`vehicle_cost`、`related_used_car_id`）
  - 建 `used_purchase_requests` row 串起來
- domain helper：`src/domain/used-purchase-requests.ts`

**T11** · 02_中古車整備工單（L）— **新建** `/parts/aftersales/workorders/recon-[id]`
- 與 T8 PDI 工單共用主體、checklist 改 24 項中古整備
- 完成核准後回寫 `used_car_inventory.recon_*_cost` + `status='available'`

**T12** · RS06 中古車評估鑑價修正（L）— `/usedcar/evaluations/[id]`
- Tab 4「收購決策」下拉改有 value（BUY_NORMAL / BUY_COND / BUY_MGR / NO_BUY）
- 「確認收購」按鈕真的 server action：
  - 建 `used_car_inventory` row（`acquisition_source='trade_in'`、`status='pending_recon'`）
  - 建 `repair_orders`（PD-UC）
- 成功卡顯示中古車主檔號 + 整備工單號

T10 + T11 + T12 互相依賴（T12 觸發跟 T10 觸發其實是同一邏輯）— 一個 sub-agent 串著做。

### 🟡 Phase 4（拓展頁面 — 可延後）

**T13** · RS_INV03 整車採購財務結算（S）— `/sales/inventory/cost-settlement`
- 輸入關稅 / 運費 / 保險，按採購成本比例分攤各台
- 寫回 `new_car_inventory` 的成本欄位

**T14** · RS_INV04 車輛調撥（M）— `/sales/inventory/transfers`
- 列表 + 申請 wizard
- 5 種運費承擔方式（A=計入整車成本 / B=調出方 / C=調入方 / D=各半 / E=免運）
- A 選項要主管二次確認 + 警告毛利影響
- 寫 `vehicle_transfers` 表 + （若 A）寫回車輛 `transfer_freight_cost`

**T15** · RS_INV06 出庫管理（S）— `/sales/inventory/outbound`
- 純查詢頁、用 view aggregate（不建新表）
- 4 種出庫類型篩選（SALE / TRANSFER / DEMO / SCRAP）
- 顯示銷售毛利（售價 − 整車成本）

T13 + T14 + T15 可並行。

---

## 五、執行流程（Ming 要的工作模式）

```
┌─────────────────────────────────────────────────────────────┐
│  主 Agent（你 / Claude）                                       │
│  1) T0 schema migration 自己做（不分派）                        │
│  2) 派 T1~T5 五隻 sub-agent 並行（spec-to-feature skill）       │
│  3) 收回 → 串 Playwright 跑 Phase 1 回歸                       │
│  4) 派 T6 → 完成後串 T7 → 完成後串 T8 → 完成後並行 T9             │
│  5) Playwright 跑「新車到港→PDI→可售→交車」端到端                │
│  6) 派 T10+T11+T12（中古車鏈，給單一 sub-agent 串著做）           │
│  7) Playwright 跑「中古車收購→整備→可售」                       │
│  8) 派 T13+T14+T15 並行                                       │
│  9) Playwright 跑全模組回歸                                    │
│ 10) 全綠 → 回報 Ming → 等 commit/push 點頭                     │
└─────────────────────────────────────────────────────────────┘
```

**Sub-agent 派工紀律**（依 memory `feedback_sub_agent_resource_discipline.md`）：
- 靜態 spec-to-feature（讀 HTML + 寫 React 檔）= 純檔案操作，**可大量並行**
- 跑 Playwright 那一步 = 動態探測（起 dev server + Chromium）— **必須序列、一次一隻**
- T7 / T8 / T11 / T12 任務複雜，建議單獨派、不跟別人 batch

**Sub-agent 回報格式**（每隻必含）：
- 完成的檔案清單（建立 / 修改）
- 對應的 domain helper / server action
- 必過驗證 checklist（spec 裡有列）
- Playwright 跑哪條路線測過 + 截圖路徑
- 遇到的卡點 / 需要 Ming 拍板的決策

---

## 六、Playwright 端到端劇本（總驗收）

最後跑這條完整鏈路（從採購到交車），全綠才算 round 15 結案：

```
1. 倉管登入 → 進 RS_INV01 → 建一張採購單（Indian Scout × 2 台）
2. 切倉管 → 進 RS_INV02 → 選那張採購單 → 掃 2 個 VIN → 批次完成
3. 驗證：兩張 PDI 工單自動建出（PD-IN-xxx）
4. 驗證：RS03A 看板兩台車狀態 = 待 PDI、報價按鈕鎖
5. 技師登入 → 進 02_PDI工單執行 → 跑完 29 項 → 主管核准
6. 驗證：RS03A 看板那台車狀態 → 可售、整車成本 = 採購 + 關運保 + PDI
7. 業務登入 → 進 RS05 交車管理 → STEP 1 顯示「PDI 已完成」
8. 跑完交車 → 驗證車輛狀態 → SOLD、出庫紀錄出現在 RS_INV06

接著跑中古車鏈：
9. 業務 → 進 RS06 評估鑑價 → 確認收購 → 中古車主檔 + PD-UC 工單自動建
10. 技師 → 進 02_中古車整備工單 → 跑完 24 項 → 核准
11. 驗證：RS03B 看板那台車 → 可售、整車成本 = 收購 + 整備

調撥 / 出庫劇本：
12. RS_INV04 申請調撥（FREIGHT-A 計入整車成本）→ 驗證車輛總成本變更
13. RS_INV06 看到調撥 + 銷售出庫紀錄
```

---

## 七、預估時程

| Phase | 工作 | 並行度 | 工時 |
|---|---|---|---|
| Phase 0 | T0 schema | 主 agent 自己做 | 0.5 天 |
| Phase 1 | T1~T5 連帶修正 | 5 並行 | 1.5 天 |
| Phase 2 | T6→T7→T8 新車鏈 + T9 | 串行 + 1 並行 | 4 天 |
| Phase 3 | T10+T11+T12 中古車鏈 | 1 隻串行 | 2 天 |
| Phase 4 | T13/T14/T15 拓展 | 3 並行 | 1.5 天 |
| 驗收 | Playwright 端到端 | 主 agent | 0.5 天 |
| **總計** | 15 task | | **10 天** |

---

## 八、開工前要 Ming 拍板的問題

> ⚠️ Ming review 提案時請就以下 5 題明確點頭：

1. **status enum 改 text+CHECK，OK 嗎？**
   現行 `new_car_inventory.status` 是 text，新增 `pending_pdi`、`damaged` 值。維持 text+CHECK，不轉 enum（避免 migration 痛）。

2. **整車採購要不要跟現有 `purchase_orders`（零件採購）共用同一張表？**
   提案：**不共用**，新表 `vehicle_purchase_orders`。理由：零件採購欄位（item-based）跟整車（VIN-based）差太多，硬塞 metadata 會難搜尋報表。

3. **PDI / 整備工單跟一般工單共用 `repair_orders` 表，OK 嗎？**
   提案：**共用**，加 `fee_allocation` 欄位（customer / vehicle_cost / warranty_vendor），用 P1=PD 區分。理由：複用整套工單 lifecycle、技師工作台、權限 — 不重複造輪子。

4. **出庫管理（RS_INV06）用 view 不建表，OK 嗎？**
   提案：**用 view**。出庫資訊從 new/used car inventory 的 status + 既有銷售訂單 + vehicle_transfers 三方 aggregate 出來，不必另存。如果後面要 audit log 才升級成獨立表。

5. **舊 `src/domain/sales-newcar-inventory.ts`（42 行）跟 `new-car-inventory.ts`（298 行）兩支共存的問題要不要這輪一起清？**
   提案：**這輪不清**（避免 scope creep）。第十五輪只動 `new-car-inventory.ts`（現役），舊版 42 行的當 dead code 留著；下一輪統一 audit `_components` 還在 import 舊的就改。

---

## 九、結案條件

- ✅ Schema migration 跑完、雙 brand 都有 RLS、所有新表 service-role 寫得進
- ✅ 15 task 全 ship、每隻 sub-agent 回報過驗證 checklist
- ✅ Playwright 端到端完整鏈路全綠（含螢幕錄影 `docs/test-evidence/round-15/`）
- ✅ `npx tsc --noEmit` + `npx eslint` 都 0 error
- ✅ 雙 brand seed 各塞 demo 資料（Indian 主力，Ducati 副）
- ✅ Notion 卡 STATUS=完成 + 寫好下一輪 HANDOFF

未做完者升等下一輪（不卡這輪結案）。

---

*Spec 來源：`docs/20260527/` partner 包 A + 包 B + v2 規格書*
*提案版本：v1 · 2026-05-27 · 待 Ming review*
