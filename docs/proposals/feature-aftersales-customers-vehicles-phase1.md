# 提案：售後工單模組 — 09 人車檔案（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/09_人車檔案.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組目前只在 Ducati nav 樹下；Indian 視業務決定再補；schema 仍雙 brand）
> 姊妹頁：
> - `docs/proposals/feature-aftersales-overview-phase1.md`（00_導覽總覽）
> - `docs/proposals/feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）
> - `docs/proposals/feature-aftersales-appointments-phase1.md`（01_預約）
> - `docs/proposals/feature-aftersales-ro-phase1.md`（02_RO）
> - `docs/proposals/feature-aftersales-precheck-sa-phase1.md`（04_預檢 SA）
> - `docs/proposals/feature-aftersales-precheck-ro-phase1.md`（04_預檢 RO 串接）
> - `docs/proposals/feature-aftersales-ro-lines-phase1.md`（03_項目零件明細）
> - `docs/proposals/feature-aftersales-addons-phase1.md`（04_追加）
> - `docs/proposals/feature-aftersales-addon-loop-phase1.md`（05_閉環）
> - `docs/proposals/feature-aftersales-final-check-phase1.md`（06_竣工複檢）
> - `docs/proposals/feature-aftersales-management-phase1.md`（07_售後管理）
> - `docs/proposals/feature-aftersales-checkout-phase1.md`（08_結帳收款）
> - **後續**：`feature-aftersales-customer-tags-admin-phase1.md`（12_客戶標籤主管設定，本頁是消費端、它是管理端）

---

## 0. 頁面定位（最重要）

**這頁是售後模組的「核心 master data 主檔頁」**，是整條售後 pipeline 上下游所有單據的 source of truth：

```
[01 預約]                  ─┐
[02 正式 RO]               ─┤
[04 預檢 SA / RO 串接]     ─┤── 全部 FK → customers + customer_vehicles
[08 結帳收款]              ─┤
[07 售後管理（取車通知）]  ─┘
                           ↓
                  [09 人車檔案] ← 你在這裡（master）
                           ↑
                  [12 客戶標籤主管設定] ← 標籤的 admin 端
```

**性質歸類**：典型 **「Search-first List View + Read-mostly Detail View」**。跟一般 master-data list view 不同：

- **List 端不長表格**：頁面打開只有 search bar + 「請輸入車主姓名/車牌/電話查詢」空狀態。客戶量大（單店累積數千），不適合 paginated table，預設用 search → 命中 → 切到 detail。
- **Detail 端是「客戶 + 車輛 + 履歷」三合一**：左欄客戶卡 + 標籤、右欄車輛卡 + 維修履歷表。**履歷是 read-only aggregation**（從 `work_orders` JOIN 出來、不獨立存）。
- **CRUD 比重小**：客戶基本資料 + 車輛基本資料用 modal 編輯就夠；不會有複雜 wizard。多數寫入發生在「預約 / RO 建立」流程的 inline create（在 01 預約頁就會建立新客戶 / 新車）。

⚠️ **這頁的關鍵特徵**：
1. **它是消費端不是生產端** — `work_orders.customer_id` / `service_appointments.vehicle_id` 一旦累積，這頁的維修履歷自動有內容；不需要在本頁手動建工單
2. **客戶標籤是 cross-role 的觀察筆記** — 銷售 / 售後 / 售後主管都可以掛標籤，部分標籤鎖定（如「🔴 情緒敏感型 ·售後主管🔒」），這是 12_客戶標籤主管設定 的下游消費點
3. **保固狀態是 derived** — `🛡 保固狀態：有效 · 到期：2027/11/08` 從 `customer_vehicles.warranty_until` 算，不另存

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

**主 entity 兩個（master）+ 引用 entity 多個**：

```
customers （核心 master，✅ 已存在於 DB）
  既有 typed core fields:
    - id uuid PK
    - brand_id text NOT NULL DEFAULT 'ducati'
    - code text NOT NULL                        # 客戶編號 C-20241108-089（HTML 顯示）
    - name text NOT NULL                        # 鄭宗勳
    - type text NOT NULL DEFAULT 'individual'   # individual / business
    - customer_type text DEFAULT 'INDIVIDUAL'   # 大寫版（重複欄位，疑似遷移殘留 — 階段 3 確認哪個是 SSOT）
    - tax_id text                                # 統編
    - national_id text                           # 身分證
    - phone text                                 # 0960-771-318
    - email text
    - address text
    - birthday date                              # 1988/11/08
    - source_module text                         # 預約 / RO / POS / 手動建立（HTML 沒顯示但 schema 有）
    - notes text
    - gl_receivable_coa_id uuid                  # 應收帳款分錄
    - default_tax_code_id uuid
    - payment_terms_days integer DEFAULT 30
    - credit_limit numeric
    - is_active boolean DEFAULT true
    - external_id / external_source / synced_at  # NetSuite 對接
    - created_by uuid                            # auth.users（建立人，不是「客戶本人帳號」）
    - created_at / updated_at
  既有 jsonb metadata:
    - metadata jsonb DEFAULT '{}'                # 已存在

  HTML 上顯示但 schema 尚無、要 jsonb 接（不升 typed）:
    - line_id text          → metadata.line_id        # jason.cheng88（IM 通路、未來可能多帳號 → jsonb）
    - first_visit_at date   → metadata.first_visit_at # 首次到店；可從最早 work_order.created_at derive，不必獨立
    - 累計回廠次數          → derived, 不存          # COUNT(work_orders WHERE customer_id=...)
    - 累計消費              → derived, 不存          # SUM(work_orders.final_amount)

customer_vehicles （核心 master，✅ 已存在於 DB；表名是 customer_vehicles 不是 vehicles）
  既有 typed core fields:
    - id uuid PK
    - brand_id text NOT NULL
    - customer_id uuid NOT NULL FK → customers
    - model_id uuid FK → vehicle_models           # PANIGALE V2 等車型
    - vin text                                    # 1ZVBP8CFXE5307641
    - license_plate text                          # LGX-8096
    - engine_no text                              # ZDB00E0100024892
    - color text
    - manufactured_year smallint                  # 2024（HTML「出廠年份」）
    - acquired_from text DEFAULT 'new'            # new / used / transfer
    - purchase_date date                          # 2024/11/08（HTML「購車日期」）
    - purchase_amount numeric
    - current_mileage numeric                     # 12,850 km（從最新 RO 同步 / 也可獨立填）
    - last_service_date date                      # 2026/05/08（HTML 最新 RO 日期）
    - last_service_mileage numeric
    - next_service_due_date date                  # 取車通知 / 11_設定的下游
    - next_service_due_mileage numeric
    - warranty_until date                         # 2027/11/08（HTML 顯示「保固到期」）
    - insurance_company / insurance_policy_no / insurance_until
    - preferred_technician_id uuid
    - is_active boolean
    - notes text
    - external_id / external_source / synced_at
    - created_by / created_at / updated_at
  既有 jsonb metadata:
    - metadata jsonb DEFAULT '{}'

  HTML 上隱含但 schema 尚無、jsonb 接：
    - 保固類型 / 里程上限 text → metadata.warranty.{ kind: 'NORM', mileage_cap: 'unlimited' }
    - 累計回廠次數 / 累計工時  → derived from work_orders, 不存

customer_contacts （✅ 已存在；本頁未直接顯示但 schema 已備）
  既有 typed: id, brand_id, customer_id FK, role ('primary'/'spouse'/'parent'/...),
              name, phone, email, relation, notes, is_active, metadata
  用途：一個客戶多個聯絡人（家屬代取車、公司戶代表人）

customer_tags  （❌ 尚未建表 — Phase 1 規劃中）
  master 端在 12_客戶標籤主管設定（另一張 Phase 1 提案 #26 還未開）；
  本頁是消費端，需要 customer_tag_assignments 連 customer ↔ tag。

  customer_tags                       # 官方標籤字典（受 admin 管理）
    - id uuid PK
    - brand_id text
    - code text UNIQUE                # 'emotional_sensitive' / 'prefers_detailed_explanation'
    - label text                       # 「情緒敏感型」
    - color text                       # 'red' / 'amber' / 'green' / 'blue'（HTML 四色定義）
    - emoji text                       # '🔴' / '🟡' / '🟢' / '🔵'
    - category text                    # 'mood' / 'preference' / 'habit' / 'concern'
    - locked_for_role text             # NULL = 任何角色可加；'service_manager' = 只該角色可加
    - is_active boolean
    - sort_order int
    - metadata jsonb
    - created_at / updated_at

  customer_tag_assignments            # 客戶 ↔ 標籤 m2m + source（誰掛的）
    - id uuid PK
    - brand_id text
    - customer_id uuid FK → customers
    - tag_id uuid FK → customer_tags
    - source_role text                 # 'sales' / 'service' / 'service_manager'
    - assigned_by uuid                 # auth.users
    - notes text                       # 為何掛這標籤的補充
    - assigned_at timestamptz
    - metadata jsonb
    - UNIQUE (customer_id, tag_id)

work_orders（✅ 已存在，本頁的「維修履歷」來源）
  本頁不寫入 work_orders，只 SELECT JOIN customer_id = ?；
  HTML 履歷顯示欄位：date / ro_no / items 摘要 / mileage / amount / sa_name / 操作（查看跳 02 RO）
  → 需要 listVehicleHistory(vehicle_id) helper 從 work_orders + work_order_items aggregate

service_appointments（✅ 已存在；本頁不直接顯示但偶爾要查「最近預約」）

vehicle_models（✅ 已存在）
  - 提供 dropdown 選項：PANIGALE / MONSTER / MULTISTRADA / STREETFIGHTER / DIAVEL（HTML 上的 series filter）
  - 已有 series + model_name + display_name 分層
```

### relationships（單向 ER 圖摘要）

```
customers 1 ─── M customer_vehicles
customers 1 ─── M customer_contacts
customers M ─── M customer_tags  (via customer_tag_assignments)
customer_vehicles M ─── 1 vehicle_models
customer_vehicles 1 ─── M work_orders (履歷)
customer_vehicles 1 ─── M service_appointments
customers M ─── ? auth.users        ← 階段 3 重點問題：要不要 link
```

⚠️ **`customers.created_by` vs `feedback_tickets.created_by`**：
- `customers.created_by` = 哪個員工建這筆客戶資料（DealerOS 內部 staff，profiles.id）
- `feedback_tickets.created_by` = 提許願單的人（也是 staff 員工）
- 兩個都是 `auth.users.id`，**但 customers 表本身代表「車主」這個業務實體，不代表車主的登入帳號**
- 車主本人**沒有** DealerOS 帳號（POC 階段沒做客戶端 portal）
- 結論：customers 是純業務 master data，跟 auth.users 沒有 1:1 對映，未來若做客戶 portal 才考慮加 `customers.user_id uuid REFERENCES auth.users`

### actions

```
listCustomersSearch(q: { keyword?: string; series?: string; brand_id }) ⟶ Customer[]
  source: customers WHERE brand_id = current AND (name ILIKE %q% OR phone ILIKE %q%
           OR EXISTS (SELECT 1 FROM customer_vehicles cv WHERE cv.customer_id=c.id AND cv.license_plate ILIKE %q%))
  HTML 上「搜尋」按鈕觸發、空狀態頁直接顯示 empty hint
  suspected_side_effects: 無（純讀）

getCustomerProfile(customer_id) ⟶ {
  customer: Customer,
  vehicles: CustomerVehicle[],
  tags: TagAssignment[],
  primary_vehicle: CustomerVehicle | null,
  stats: { visit_count: number; total_amount: numeric; first_visit_at: date; last_visit_at: date }
}
  source: 1 customers + 1 customer_vehicles JOIN vehicle_models
        + 1 customer_tag_assignments JOIN customer_tags + 1 work_orders aggregate
  suspected_side_effects: 無

listVehicleHistory(vehicle_id) ⟶ WorkOrderHistory[]
  fields per row: date, ro_no, items_summary, mileage, amount, sa_name, status
  source: work_orders WHERE vehicle_id = ? ORDER BY completed_at DESC LIMIT 50
  + work_order_items aggregate (前 3 個維修項目串成 items_summary 字串)
  suspected_side_effects: 無

createCustomer(input) ⟶ { id, code }
  本頁的「+ 新增客戶」按鈕；通常從 01 預約 inline create 進來
  side_effects:
    - 生 code（C-YYYYMMDD-NNN，HTML 命名規則）：用 sequence 或 max+1 都 OK
    - INSERT customers
    - 若同時填了車輛資料 → INSERT customer_vehicles
  [需確認] 是否同時 INSERT default customer_contacts（primary）

updateCustomer(id, patch) / updateCustomerVehicle(id, patch)
  HTML 上「編輯」按鈕觸發 modal
  side_effects: 改 updated_at；若改 warranty_until 影響保固狀態顯示，無外部副作用

assignTag(customer_id, tag_id, notes)
  side_effects:
    - INSERT customer_tag_assignments
    - [需確認] 若 tag.locked_for_role = 'service_manager' 而當前 user 不是該 role → 拒絕
removeTag(assignment_id)

addVehicleToCustomer(customer_id, vehicle_input)
  HTML 沒明顯按鈕但業務必要（一個客戶後續又買新車）
  side_effects: INSERT customer_vehicles

deactivateCustomer(id) / deactivateVehicle(id)
  軟刪除；is_active=false；歷史 work_orders 保留
```

### kpis

本頁 detail 端 4 個顯示型 metric（純 derived，不獨立存）：

```
- 累計回廠：COUNT(DISTINCT work_orders.id) WHERE customer_id=?
- 累計消費：SUM(work_orders.final_amount) WHERE customer_id=? AND status='completed'
- 首次到店：MIN(work_orders.created_at) WHERE customer_id=?  （或 customers.created_at fallback）
- 保固狀態：CASE WHEN warranty_until > today THEN '有效' ELSE '已過期' END
```

### implied_schema 變更（本頁專屬）

**1. 既有表（不動）**：
- `customers`：欄位已齊備，HTML 上 line_id / first_visit_at 走 jsonb，不 ALTER
- `customer_vehicles`：欄位已齊備，保固類型 / 里程上限走 jsonb
- `customer_contacts`：已齊備
- `work_orders` / `service_appointments` / `vehicle_models`：本頁只讀

**2. 新表（兩張）**：
- `customer_tags`（標籤字典 / dictionary table）
- `customer_tag_assignments`（客戶 ↔ 標籤 m2m + 軌跡）

**3. 疑似冗餘欄位（階段 3 問用戶）**：
- `customers.type` (`'individual'`/`'business'`) **vs** `customers.customer_type` (`'INDIVIDUAL'`)
- 同義但大小寫 + 預設值不同；疑似 migration 過渡殘留
- 建議拍板：留 `type` 廢 `customer_type`（lowercase 慣例 + 已被姊妹頁的 helper 使用）

### implied_pages

```
- kind: 'list+search'    route: /aftersales/customers
  - 上半 search bar / filter
  - 下半 default empty state；輸入後切到 detail（**不分頁列表**，因量大）
  - 「+ 新增客戶」開 modal 或跳 /aftersales/customers/new

- kind: 'detail'         route: /aftersales/customers/[id]
  - 左欄客戶卡 + 標籤卡（含 manage modal）
  - 右欄車輛卡（多車 carousel 或 dropdown 切換）+ 維修履歷 table
  - tabs（建議）：基本資料 / 車輛 / 維修履歷 / 標籤 / 聯絡人 / 取車通知設定
  - 「編輯客戶」/「編輯車輛」按鈕 → 各自 modal

- kind: 'admin'          route: /admin/customer-tags  ← 12_客戶標籤主管設定 的 home（另一張 Phase 1）
```

---

## 2. 既有表盤點結果（重點）

| 表 | 狀態 | 完備度 | 動作 |
|---|---|---|---|
| `customers` | ✅ 已存在 | 95% 齊備（含 RBAC / NetSuite / GL 欄位） | **不動**；HTML 新欄位走 jsonb |
| `customer_vehicles` | ✅ 已存在 | 100% 齊備（含保固 / 保險 / 偏好技師） | **不動** |
| `customer_contacts` | ✅ 已存在 | 100% 齊備 | **不動** |
| `vehicle_models` | ✅ 已存在 | 100% 齊備（含 NetSuite segment / GL） | **不動** |
| `service_appointments` | ✅ 已存在 | 完備 | 只讀 |
| `work_orders` / `work_order_items` | ✅ 已存在 | 完備 | 只讀（履歷來源） |
| `customer_tags` | ❌ 不存在 | — | **Phase 4 建表** |
| `customer_tag_assignments` | ❌ 不存在 | — | **Phase 4 建表** |

⚠️ **關鍵發現**：兩張 master 表（customers + customer_vehicles）schema 已經由 01 預約 / 02 RO / 08 結帳等姊妹 Phase 1 推導落地，**Phase 4 主要工作不是建主檔表，是建 tags 兩張表 + 寫 query/helper + 起 React 頁**。這在售後模組裡是少數「資料層幾乎不用動」的頁面。

---

## 3. 副作用清單（Phase 1 預判）

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `createCustomer` | INSERT customers；若帶 vehicle → 也 INSERT customer_vehicles；可能順手建一筆 `customer_contacts` (role='primary', name=customer.name, phone=customer.phone) | [需確認] |
| `assignTag` (locked_for_role) | 角色驗證：當前 user 是否屬於 tag.locked_for_role；不是 → 拒絕（RBAC 候選） | [需確認] — 走 `permissions` 還是 `business_rules`？建議走 RBAC `customer_tag.assign_locked` permission |
| `updateCustomerVehicle.warranty_until` | 純資料更新；不觸發通知 | 確定 |
| `addVehicleToCustomer` | INSERT；若同 VIN 已存在他客戶 → ⚠️ 應警告（轉手車輛）；HTML 沒設計 | [需確認] |
| `listVehicleHistory` | 純讀；無副作用 | 確定 |
| 客戶資料異動 | 是否要 audit log（誰改、什麼時候、改了什麼）？HTML 沒呈現 | [需確認] |
| LINE ID 變更 | 是否要重新訂閱通知（07 售後管理 / 11 取車通知）？ | [需確認] — 可能影響 11 頁 |

---

## 4. Schema 草案（重點）— customers + customer_vehicles 已存在，重點是 tags

### 4.1 既有表（不動，僅列出供 review）

`customers`：見 §1 entities。typed core 已齊；HTML 新欄位（line_id / first_visit_at 等）走 `metadata jsonb`：

```json
{
  "line_id": "jason.cheng88",
  "first_visit_at": "2024-11-08",   // 也可不存，從 work_orders.MIN 計
  "preferred_contact_channel": "line",
  "marketing_opt_in": true
}
```

`customer_vehicles`：見 §1 entities。`metadata jsonb` 範例：

```json
{
  "warranty": { "kind": "NORM", "mileage_cap": "unlimited" },
  "accessories": ["panniers", "heated_grips"],   // 加裝清單，純顯示
  "photos": ["s3://.../vehicle_front.jpg"]
}
```

### 4.2 新表：customer_tags（字典）+ customer_tag_assignments（m2m）

```sql
-- 字典表：HTML 上「官方標籤」by 12_主管設定
CREATE TABLE customer_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  code text NOT NULL,                              -- 'emotional_sensitive'
  label text NOT NULL,                              -- '情緒敏感型'
  color text NOT NULL,                              -- 'red' / 'amber' / 'green' / 'blue'
  emoji text,                                       -- '🔴'
  category text,                                    -- 'mood' / 'preference' / 'habit' / 'concern'
  locked_for_role text,                             -- NULL = 任何角色；'service_manager' = 只該角色可掛
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, code)
);
CREATE INDEX ON customer_tags (brand_id, is_active, sort_order);

-- m2m：客戶 ↔ 標籤 + 誰掛的軌跡
CREATE TABLE customer_tag_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES customer_tags(id) ON DELETE RESTRICT,
  source_role text,                                 -- 'sales' / 'service' / 'service_manager'
  assigned_by uuid REFERENCES auth.users(id),
  notes text,                                       -- 「為何掛這標籤」補充
  assigned_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE (customer_id, tag_id)
);
CREATE INDEX ON customer_tag_assignments (brand_id, customer_id);
CREATE INDEX ON customer_tag_assignments (brand_id, tag_id);

-- 4 條 brand-aware RLS（兩張表都套）
-- ...（沿用 architecture.md §RLS 樣板）
```

### 4.3 欄位分類（typed vs jsonb）— 重點是新表

| 欄位（new） | 落腳 | 理由 |
|---|---|---|
| customer_tags.code | typed UNIQUE | helper 用、設定頁人會打 |
| customer_tags.label | typed | 顯示主欄、報表 group by |
| customer_tags.color | typed text | 4 種固定值、driver UI 樣式 |
| customer_tags.category | typed text | filter / group by |
| customer_tags.locked_for_role | typed text NULL | RBAC 邏輯會 SELECT 比對 |
| customer_tag_assignments.source_role | typed text | 報表會 group by「銷售掛的 vs 售後掛的」 |
| customer_tag_assignments.notes | typed text | 純顯示但欄位穩 |
| customer_tag_assignments.assigned_at | typed timestamptz | 排序索引 |

| 欄位（existing 表新加） | 落腳 | 理由 |
|---|---|---|
| customers — LINE ID | metadata.line_id | 未來可能多帳號（個人 / 群組）、形狀未穩 |
| customers — 首次到店 | metadata.first_visit_at（或 derived） | 可計算、避免雙寫不一致 |
| customer_vehicles — 保固類型 / 里程上限 | metadata.warranty.{ kind, mileage_cap } | 子結構 + 國際保固政策可能變 |
| customer_vehicles — 加裝清單 | metadata.accessories[] | array、純顯示 |

---

## 5. Domain Helper 規劃

檔案：`src/domain/customers.ts`（新建；與 12_主管設定那邊共用）

```ts
// 搜尋 / 讀
export async function searchCustomers(q: { keyword?: string; series?: string }): Promise<Customer[]>
export async function getCustomerProfile(id: string): Promise<CustomerProfile>
export async function listVehicleHistory(vehicle_id: string, limit?: number): Promise<VehicleHistoryRow[]>
export async function listCustomerStats(customer_id: string): Promise<{ visit_count, total_amount, first_visit_at, last_visit_at }>

// 寫入
export async function createCustomer(input): Promise<{ id: string; code: string }>
export async function updateCustomer(id, patch): Promise<{ id: string }>
export async function addVehicleToCustomer(customer_id, vehicle_input): Promise<{ id: string }>
export async function updateCustomerVehicle(id, patch): Promise<{ id: string }>

// 標籤
export async function listTags(): Promise<CustomerTag[]>                       // 字典（消費端共用）
export async function listCustomerTagAssignments(customer_id): Promise<TagAssignment[]>
export async function assignTag(customer_id, tag_id, notes?): Promise<{ id: string }>
export async function removeTagAssignment(assignment_id): Promise<{ id: string }>
```

Day 1 內部實作：supabase 直連 + multi-statement (search 用 ILIKE + EXISTS、profile 用 Promise.all 平行讀 4 個小 query)。
Day 30 升級候選：customer_profile 變 RPC（一次 round-trip 拉完）。

⚠️ **constants 拆檔**：`customer_tag` 的 color / category / locked_for_role 預設集要拆到 `src/domain/customers.constants.ts`（避免 `"use server"` 違規）。

---

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 客戶搜尋首頁 | `/aftersales/customers` | Search-first list（**不含 DataGrid，是 empty hint + 命中跳轉**） | 半客製（從 items-board 拷骨架但移除表格段） |
| 客戶詳情 | `/aftersales/customers/[id]` | Page View（左 300px 客戶卡 + 標籤卡 / 右車輛卡 + 履歷 table） | `parts/setup/items/[id]/_components/item-detail-view.tsx` 改 2 欄式 |
| 新增客戶 | `/aftersales/customers/new` | Page View 同上頁的 create-mode | 同 detail，`creating` state |
| 客戶標籤管理（未來） | `/admin/customer-tags` | List View | items-board 直拷（→ 12_主管設定 phase1 自負） |

---

## 7. nav_nodes（雙 brand）

```sql
-- 「人車檔案」在 nav 上應屬於「售後管理 → 主檔 / 客戶資料」群組
-- 實際 parent_id 需查 SELECT id FROM nav_nodes WHERE name='售後管理' AND level=2;
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES
  ('ducati', '<ducati-aftersales-parent>', 3, <n>, '人車檔案', 'person_pin', '/aftersales/customers', 'react_route', true, false),
  ('indian', '<indian-aftersales-parent>', 3, <n>, '人車檔案', 'person_pin', '/aftersales/customers', 'react_route', true, false);
```

建議擺位：售後管理底下，鄰近 01 預約、07 售後管理、10 工單查詢。Phase 4 落地時用 `mcp__plugin_supabase_supabase__execute_sql` 查實際 parent_id 與 sort_order。

---

## 8. Critical Files（Phase 4 預估）

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/customers.ts` |
| 新增 | `src/domain/customers.constants.ts`（tag color / category 字典常數） |
| 新增 | `src/lib/customers/queries.ts`（list / get / aggregate） |
| 新增 | `src/lib/customers/customer-actions.ts`（create / update / addVehicle / assignTag） |
| 新增 | `src/app/(workspace)/aftersales/customers/page.tsx`（search） |
| 新增 | `src/app/(workspace)/aftersales/customers/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/aftersales/customers/[id]/_components/customer-profile-view.tsx` |
| 新增 | `src/app/(workspace)/aftersales/customers/new/page.tsx`（reuse profile-view） |
| 新增 | `src/app/(workspace)/aftersales/customers/_components/customer-search-bar.tsx` |
| 新表 DDL | `customer_tags` / `customer_tag_assignments` + RLS |
| 既有表 | `customers` / `customer_vehicles` 不動 |

---

## 9. Verification（落地完手測，Phase 5）

1. **SSOT 一致性**：客戶資料 JOIN `work_orders.customer_id` 累積回廠次數 = 履歷表筆數（雙路徑同數）
2. **跨模組共讀**：01 預約頁 inline 建的新客戶 → 立刻能在 09 搜尋到（同 `customers` 表，不另存）
3. **保固狀態**：手動把 `customer_vehicles.warranty_until` 改到過去 → 詳情頁從「有效」變「已過期」（純 derived）
4. **標籤 RBAC**：以非 service_manager 角色登入 → 不能掛 `locked_for_role='service_manager'` 的標籤（後端 reject）
5. **多車**：同客戶加第二台車 → 詳情頁右欄出現切換 dropdown / carousel
6. **標籤跨頁**：12_主管設定停用某 tag → 09 詳情頁該客戶 chip 變灰 / 隱藏（is_active 過濾）
7. `npx tsc --noEmit` / `npx eslint <touched-paths>` = 0 errors
8. nav chip 從 HTML → REACT（雙 brand）

---

## 10. 開放問題（Phase 3 拍板用 — 重點）

- [ ] **customers.type vs customer_type**：留哪個？建議留 `type`（lowercase + 已被姊妹頁 helper 採用）；`customer_type` 列為 deprecated 過幾天刪
- [ ] **customers ↔ auth.users**：POC 階段確認**不**加 `customers.user_id`（車主沒 DealerOS 帳號）— 對嗎？
- [ ] **createCustomer 時要不要順手 INSERT customer_contacts(role='primary')？** 簡化使用者操作 vs 雙寫一致性風險
- [ ] **同 VIN 已存在他客戶（轉手車輛）**：addVehicleToCustomer 怎麼處理？選項 A 拒絕 / B 警告但允許（複製為新 row）/ C 提供「轉讓」action（把車轉到新主人 + 保留歷史）
- [ ] **標籤 RBAC**：locked_for_role 的權限要走 `permissions` 表（建議 `customer_tag.assign_locked` 一個 permission code）還是 `business_rules`？依 architecture.md 判斷三步 → 是 boolean「能 / 不能」→ **走 RBAC**
- [ ] **LINE ID 變更時 11_取車通知設定 是否要重新訂閱**？階段 3 跨頁確認
- [ ] **「+ 新增客戶」按鈕走 modal 還是 /new 路由**？modal 對 SA 流程順、/new 對 deep-link 友善；建議跟 01 預約的 inline create 二選一統一
- [ ] **客戶資料 audit log**：要不要記改動歷史？姊妹頁 02 RO 已有 status_history pattern 可參考
- [ ] **車輛詳情頁要不要獨立 route**（`/aftersales/vehicles/[id]`）？POC 建議併入 `/aftersales/customers/[id]?vehicle=xxx`，未來再拆

---

## 11. Phase 1 結語

09 人車檔案是售後模組裡 schema 工作量最小的頁面 — `customers` / `customer_vehicles` / `customer_contacts` 三張主檔表早在 01 預約 / 02 RO / 08 結帳的 Phase 1 推導中已落地，且 typed core 完備度高（含 NetSuite 對接、GL 對接、RBAC 欄位）。Phase 4 真正的新建工作集中在：

1. **客戶標籤兩張表**（dictionary + m2m），承接 12_主管設定
2. **search-first list 頁**（不是傳統 DataGrid，是 empty-hint + 命中跳轉）
3. **2-column detail 頁**（HTML 上 300px + 1fr 的版型，跟既有 item-detail-view 1-column 不同，需要小客製）
4. **listVehicleHistory aggregate helper**（從 work_orders 拉，非獨立存）

待 Phase 3 拍板的 9 個開放問題以「VIN 衝突處理」、「標籤 RBAC 落地位置」、「LINE ID 變更聯動」、「customer_type / type 二選一」最關鍵 — 其餘是 UX 取捨。
