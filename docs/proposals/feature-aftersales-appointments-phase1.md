# 提案：售後工單模組 — 預約管理看板（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/01_預約管理看板.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組目前只在 Ducati nav 樹下；Indian 視業務決定再補）
> 姊妹頁：
> - `docs/proposals/feature-aftersales-overview-phase1.md`（00_導覽總覽）
> - `docs/proposals/feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）

---

## 0. 頁面定位（最重要）

**這頁是真正的「業務 CRUD 頁面」**，跟兩支 00_ 開頭的 meta landing 頁性質完全不同。它是售後工單模組 **Phase 1（流程第一站）的入口頁**，整條 pipeline 從這裡發動：

```
[01 預約管理看板] ← 你在這裡
        ↓ 點「預檢」
[04 預檢單 SA 環檢 / RO 串接（v3）]
        ↓ 預檢確認後
[02 正式 RO 工單]
        ↓
[03 維修項目零件明細 / 04 追加項目 / 05 增項閉環]
        ↓
[06 竣工複檢] → [07 售後管理] → [08 結帳收款]
```

**性質歸類**：典型 **List View + Daily Operations Dashboard** 混合體：

- **上半部 KPI + 排程卡 + 技師負載**：daily dashboard（不可寫入、純展示）
- **中間 filter bar**：標準 List View 篩選列
- **下半部表格 + 操作按鈕（預檢 / 編輯）**：標準 List View 表格段，會跳轉到下游頁

⚠️ **這頁的關鍵特徵**：表格的「操作」欄不只是 CRUD，更是 **pipeline 啟動器**（按「預檢」→ 進入下一站建立 `pre_inspection`）。這跟一般 master-data list view（編輯 / 停用 / 刪除）的語義不同。

**在售後流程中的定位**：**整條售後 pipeline 的入口閘門**。預約成功 → 到廠 → SA 接車 → 發動 SA 預檢 → 後續所有流程都從這張預約單長出來。任何售後業務 KPI（今日台數、技師負載、預計工時）的 single source 都在這個資料表的當天 view。

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

主 entity 一個、引用 entity 多個：

```
appointments （主 entity，本頁負責落地）
  fields:
    - id uuid PK
    - brand_id text
    - subsidiary_id uuid           # 法人歸屬（NetSuite Subsidiary 對映）
    - store_id uuid                # 哪家店收車（從 organizations 取，level=2）
    - appointment_date date
    - appointment_time time        # 09:00 / 09:30 / 10:00 ... 半小時為單位
    - customer_id uuid FK → customers
    - vehicle_id uuid FK → vehicles
    - service_type text            # MN / RP / WC / AC / OT（業務分類；對映既有售後業務代碼）
    - service_subtype text         # CP（一般）/ WR（保固）/ FR（返工）— 跟 service_type 組成「MN-CP」「WC-WR」「RP-FR」
    - estimated_hours numeric(4,1) # 1.0 / 1.5 / 2.0 / 3.5 / 4.0
    - assigned_technician_id uuid FK → employees
    - status text                  # 待到廠 / 已到廠 / 等待中 / 維修中 / 待取車 / 已完成
    - source text                  # 預約來源（電話 / LINE / 官網 / 進廠）— 從 metadata 開始
    - notes text                   # SA 備註
    - arrived_at timestamptz       # 實際到廠時間（status 切到「已到廠」時填）
    - started_at timestamptz       # 進車間時間
    - completed_at timestamptz     # 完工時間
    - metadata jsonb               # 預檢單 ID 反查、LINE 通知標記、客戶標籤快照…等變動中欄位
    - created_by uuid
    - created_at / updated_at

  relationships:
    - { to: customers,   kind: 'fk' }     # 車主
    - { to: vehicles,    kind: 'fk' }     # 車輛（同人可多車）
    - { to: employees,   kind: 'fk' }     # 指派技師
    - { to: organizations, kind: 'fk' }   # 收車店（store level=2）
    - { to: subsidiaries,  kind: 'fk' }   # 法人歸屬
    - { to: pre_inspections, kind: '1m' } # 一筆預約可能對應 0 或 1 張預檢單（按「預檢」後建立）
    - { to: repair_orders,   kind: '1m' } # 預檢通過後產出 1 張 RO

引用 entities（不歸本頁落地）：
- customers / vehicles → 「09 人車檔案」負責
- employees → master data，既有
- pre_inspections → 「04 預檢單 SA 環檢 v3」負責
- repair_orders → 「02 正式 RO 工單」負責
- organizations / subsidiaries → 既有 org 模組
```

> 雙 brand 考量：`appointments.brand_id text` 是 brand-aware RLS 必備欄位（套 memory「多品牌 Schema Pattern」4 條 user_has_brand RLS）。**brand_id 是行銷層、subsidiary_id 才是 NetSuite 法人對映**（依 memory「會計維度語意校準」）。售後業務分錄、技師工時成本未來都要落到 `subsidiary_id`，brand_id 只管「這筆預約是 Ducati 還是 Indian 的客戶」這個 RLS 過濾。

### actions

```
listAppointments(filter: {
  brand_id: string,
  date?: string,             # 預設今日
  status?: AppointmentStatus,
  service_type?: string,
  technician_id?: string,
}) → Promise<Appointment[]>

getAppointmentById(id: string) → Promise<Appointment | null>

createAppointment(input: CreateAppointmentInput) → Promise<Result<{ id }>>
  # 「+ 新增預約」按鈕觸發

updateAppointment(id, patch: Partial<AppointmentInput>) → Promise<Result>
  # 表格列「編輯」按鈕觸發

markArrived(id) → Promise<Result>
  # 客戶到廠：status = 已到廠 + arrived_at = now()
  # suspected_side_effects: [推 LINE 通知 SA / 派車間排程]

startPreInspection(appointment_id) → Promise<Result<{ pre_inspection_id }>>
  # 「預檢」按鈕觸發 → 在 pre_inspections 表 INSERT 一張、回傳 id 讓 UI router.push
  # suspected_side_effects: [建立預檢單初始 5 個 tab、status 推進到「等待中」/「維修中」]

assignTechnician(id, technician_id) → Promise<Result>
  # 預約建立時或之後改派技師

cancelAppointment(id, reason) → Promise<Result>
  # 軟取消（不真刪、改 status）

# Dashboard 端（read-only）
getDailyKpis(date, brand_id) → Promise<DailyKpis>
  # 4 張 KPI：今日預約 / 等待中 / 維修中 / 已完成
getSchedule(date, brand_id) → Promise<ScheduleSlot[]>
  # 時段排程卡
getTechnicianWorkload(date, brand_id) → Promise<TechnicianLoad[]>
  # 技師工作負載條
```

**[需確認] 副作用**（Phase 3 拍板）：

| 動作 | 推測副作用 | 確定性 |
|---|---|---|
| 建立預約 | 推 LINE 給客戶確認 + 寫進 notification_deliveries | [需確認] |
| markArrived | 推 LINE 給 SA「客戶到廠了」 | [需確認] |
| startPreInspection | 建 pre_inspection row + 切 appointment.status 到「等待中」 | 高機率正確 |
| 改派技師 | 推 LINE 給原技師 + 新技師 | [需確認] |
| cancelAppointment | 推 LINE 給客戶 + 釋放車位 | [需確認] |

### kpis

頁面頂部 4 張 hero scorecard（**目前 HTML 寫死**，落地後應動態算）：

| KPI | 目前值 | 怎麼算 |
|---|---|---|
| 今日預約 | 12 台（已到廠 7 台） | `count(appointments WHERE date=today AND brand_id=…)` + 細部 `WHERE status IN ('已到廠','等待中','維修中','已完成')` |
| 等待中 | 3 台（超時 1 台） | `count(appointments WHERE status='等待中')` + 「超時」需業務定義（到廠超過 N 分鐘未進車間？） |
| 維修中 | 4 台（平均工時 2.3h） | `count(status='維修中')` + `avg(estimated_hours)` |
| 已完成 | 5 台（等待取車 2 台） | `count(status='已完成')` + `count(status='待取車')` |

旁邊兩張 dashboard card：

- **今日排程**（時段分組）：依 `appointment_time` 半小時切 bucket、每 bucket 列出客戶 + 業務類型 + 技師
- **技師工作負載**：依 `assigned_technician_id` group by、`load / max` 算百分比、>=75% 黃 / <75% 綠

「超時」「平均工時」這類衍生數據 → **Phase 2 拍板要不要先做**（POC 階段可先 hardcode、Phase B 再動態化）。

### implied_schema

```sql
-- 主表
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  subsidiary_id uuid REFERENCES subsidiaries(id),
  store_id uuid REFERENCES organizations(id),

  -- typed core
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  customer_id uuid REFERENCES customers(id),
  vehicle_id uuid REFERENCES vehicles(id),
  service_type text NOT NULL,        -- MN / RP / WC / AC / OT
  service_subtype text,              -- CP / WR / FR
  estimated_hours numeric(4,1),
  assigned_technician_id uuid REFERENCES employees(id),
  status text NOT NULL DEFAULT '待到廠',
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,

  -- jsonb metadata（變動中、單頁專用）
  metadata jsonb DEFAULT '{}'::jsonb,
  -- 預期 keys：
  --   source: '電話' | 'LINE' | '官網' | '進廠' | 'SA 主動聯絡'
  --   line_notification_sent_at: timestamptz
  --   customer_tags_snapshot: string[]   -- 預約當下客戶標籤（VIP / 黑名單 / 首訪）
  --   linked_pre_inspection_id: uuid     -- 反查預檢單

  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX ON appointments (brand_id, appointment_date, status);
CREATE INDEX ON appointments (brand_id, assigned_technician_id, appointment_date);

-- RLS（依 memory「多品牌 Schema Pattern」4 條）
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointments_select ON appointments FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY appointments_insert ON appointments FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY appointments_update ON appointments FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY appointments_delete ON appointments FOR DELETE USING (user_has_brand(brand_id));
```

**升降級規則**（依 architecture.md）：
- `source` 先丟 jsonb metadata，預約來源統計需求出現後 promote 成 typed column
- `customer_tags_snapshot` 永遠 jsonb（純顯示、變動中、不是 FK）
- `linked_pre_inspection_id` 等 pre_inspections 表落地後考慮 promote 成 typed FK

**依賴的 entity**（需先在或同時落地，本提案**不涵蓋**）：
- `customers` / `vehicles`（「09 人車檔案」負責）— 若這兩張表還沒，本頁需用 placeholder 或 stub
- `employees` — 既有 master data，OK
- `pre_inspections`（「04 預檢單」負責）— 「預檢」按鈕跳轉目的地，本提案只負責「跳轉動作 + 反向反查 id」

### implied_pages

| 頁面 | 路徑（建議） | 類型 | 範本 | 備註 |
|---|---|---|---|---|
| 預約看板 | `/parts/aftersales/appointments` | **List View + Dashboard 混合** | 客製（不能直接套 items-board） | KPI + 排程卡 + 技師負載 + filter bar + table |
| 預約詳情 / 編輯 | `/parts/aftersales/appointments/[id]` | Page View | parts/setup/items/[id]/_components/item-detail-view.tsx | view / edit / create 三 mode |
| 新增預約 | `/parts/aftersales/appointments/new` | Page View（create mode） | 同上、reuse detail view | reuse 同一個 detail view |

⚠️ **這頁不能直接套 canonical items-board.tsx**：頂部多了 4 張 KPI + 兩張 dashboard card（排程 / 技師負載），不是純列表。建議拆成「上半 dashboard 區（self-contained component）+ 下半標準 list view 區（按 design pattern §List View）」兩塊，list 部分照規格、dashboard 部分客製。

---

## 2. 在售後流程中的定位摘要

| 階段 | 對映 HTML | 對映 entity | 串接關係 |
|---|---|---|---|
| **Phase 1 預約進廠** | 01_預約管理看板（本頁） | **appointments** | 整條 pipeline 的源頭。所有下游單據反查都從 appointment_id 連回來 |
| Phase 2 SA 預檢 | 04_預檢單 SA 環檢 v3 / RO 串接 v3 | pre_inspections | `appointments.metadata.linked_pre_inspection_id` 反查 |
| Phase 3 RO 工單 | 02_正式工單 RO | repair_orders | 預檢確認後產出，FK → appointment |
| Phase 4 維修項目 | 03 / 04 / 05 | ro_items / addons / followups | RO 子表 |
| Phase 5 竣工複檢 | 06_竣工複檢 | final_inspections | RO 子表 |
| Phase 6 結帳關單 | 08_結帳收款 | payments / invoices | RO 結尾 |

**核心定位**：appointment 是售後 pipeline 的 root，後續 6 個 phase 的所有單據都 FK 連回 appointment_id。在 KPI / 報表層面，「今日台數」「技師負載」「業務類型分布」全部是 appointments 表上的 aggregate。

---

## 3. 建議落地型態（給 Phase 2 / Phase 3 用戶拍板）

| 方案 | 描述 | 適合場景 |
|---|---|---|
| **A. 最小可用版** | 只做 list 表 + 新增 / 編輯 Modal、KPI 與排程卡 hardcode | 用戶要趕快看到雛形、暫不處理 dashboard |
| **B. 推薦版** | 標準 design pattern list/detail + KPI 動態算 + 排程卡 + 技師負載條，「預檢」按鈕跳 placeholder（pre_inspections 還沒做時） | 推薦。能 dogfood 整套架構，未來預檢單上線時無痛接 |
| **C. 完整版** | 含 LINE 通知、客戶到廠標記、技師派工演算法、超時警示 | 過度設計、應拆 sprint 漸進做 |

**Phase 1 推薦傾向 B**：用標準 design pattern 跑列表 + 詳情頁，把 KPI 區跟排程 / 技師負載做成可 reuse 的 dashboard 子元件。

### 落地型態的雙 brand 考量

- 售後工單模組目前**只規劃在 Ducati**（依 memory「WMS 範圍 — Ducati 不做」反推、本模組目錄屬於 Ducati）
- `appointments.brand_id` 仍要從 session 取，**不要 hardcode `'ducati'`**，給 Indian 未來開啟留口
- nav_nodes 落地時需雙 brand 各 INSERT 一筆（Indian 那筆 `is_active=false` 暫關，或 `coming_soon=true`）— Phase 2 提案再拍板

---

## 4. 已避開的陷阱（紀律檢查）

- ✅ **沒走 `business_rules`**（這是業務 entity 不是規則）
- ✅ **brand_id ≠ subsidiary_id**：brand_id 用於 RLS 過濾、subsidiary_id 用於 NetSuite 法人對映（依 memory 校準）
- ✅ **沒提早把 customers / vehicles entity 攬進來**（那是 09 人車檔案的責任，本頁只引用 FK）
- ✅ **沒套單純 items-board 範本**（這頁是混合型、需客製 dashboard 區）
- ✅ **意識到雙 brand**（brand_id 從 session 取、nav_nodes 雙 brand INSERT）
- ✅ **沒 commit、沒動 nav_nodes、沒動 DB、沒寫 code**（依任務指示停在 Phase 1）
- ✅ **意識到下游依賴**（pre_inspections / customers / vehicles 還沒落地、「預檢」按鈕需先 placeholder）

---

## 5. Phase 2 應該問用戶的問題（給下一階段預留）

> ⚠️ 本任務不執行 Phase 2，僅列出供下次 session 使用。

1. **依賴順序**：customers / vehicles 還沒落地，這頁要先做還是等人車檔案先做？
   - 推薦：先做這頁、customer/vehicle FK 暫存為 text 名字 + jsonb metadata、等 09 落地後 ALTER 補 FK
2. **「預檢」按鈕**：預檢單頁面（04_預檢單）還沒實作前，這顆按鈕：
   - 跳 placeholder 頁？
   - disabled + hint「預檢模組開發中」？
   - 直接建一張 pre_inspections row 但詳情頁顯示 stub？
3. **副作用範圍**：建立預約是否要立刻推 LINE 給客戶確認？markArrived 是否推 LINE 給 SA？
4. **狀態機嚴格度**：status 切換要不要做嚴格 state machine（例如不允許「已完成」回到「維修中」）？
5. **KPI 動態化邊界**：4 張 hero 與「超時」「平均工時」這類衍生數據要 Phase 1 動態化，還是先 hardcode？
6. **技師負載 max**：HTML 寫死 max=4，這是配置值還是業務邏輯？要不要進 `business_rules` 還是 employees.metadata？
7. **路由命名**：`/parts/aftersales/appointments` 還是 `/parts/service/appointments`？（modules.ts 既有 service 模組）

---

## 6. 結論（給 caller 用）

本頁是售後工單模組的 **Phase 1 入口頁、整條 pipeline 的 root**，性質為 **List View + Daily Dashboard 混合體**：

- **主 entity**：`appointments`（新表、需建）
- **主要 actions**：list / create / update / markArrived / startPreInspection（後者是 pipeline 啟動器，跳轉到 pre_inspections）
- **主要 KPIs**：今日台數 / 等待 / 維修 / 完成 4 張 hero + 排程時段卡 + 技師負載條
- **建議路由**：`/parts/aftersales/appointments`（list） + `/[id]`（detail） + `/new`（create）
- **建議落地型態**：方案 B（標準 design pattern list/detail + 上半客製 dashboard 區）
- **核心依賴**：customers / vehicles / pre_inspections 三張表都還沒落地 → Phase 2 需先決定依賴順序與「預檢」按鈕的 placeholder 策略
- **雙 brand**：brand_id 從 session 取、不寫死；nav_nodes Indian 那筆可先 `coming_soon=true`

Phase 1 到此打住，等用戶決定要不要進 Phase 2 寫完整提案。
