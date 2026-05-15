# 提案：售後 — 預約管理看板（appointments）

> 來源：nav_node `ce276bdb-f402-472c-a274-ff942703f326` (Indian) + `869aca0b-bf79-46de-9116-1adb5871a8b5` (Ducati) ／ HTML `docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/01_預約管理看板.html`
> 日期：2026-05-15
> 階段：架構提案（auto-decided，spec-to-feature 子 agent，不問用戶）
> 接手自：`docs/proposals/feature-aftersales-appointments-phase1.md`

---

## 1. 結構摘要

售後工單模組 Phase 1 入口頁、整條 pipeline 的 root。**List View + Daily Dashboard 混合體**：
- 上半部：4 張 KPI（今日 / 等待 / 維修 / 完成）+ 兩張 dashboard 子卡（今日時段排程、技師工作負載）
- 中段：filter bar（日期 / 狀態 / 業務類型 / 技師）
- 下半部：DataGrid 列出當天預約清單，列尾兩顆 button「預檢」（→ 跳預檢單）「編輯」（→ Page View）

主 entity `appointments` 一張新表，FK 連 customers / customer_vehicles / employees / organizations / subsidiaries，並用 metadata jsonb 反向索引 pre_inspections。

---

## 2. Schema 草案

### 新表 `appointments`

```sql
CREATE TABLE appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  subsidiary_id uuid REFERENCES subsidiaries(id),
  store_id uuid REFERENCES organizations(id),

  -- typed core
  appointment_date date NOT NULL,
  appointment_time time NOT NULL,
  customer_id uuid REFERENCES customers(id),
  vehicle_id uuid REFERENCES customer_vehicles(id),
  service_type text NOT NULL,        -- MN / RP / WC / AC / OT
  service_subtype text,              -- CP / WR / FR
  estimated_hours numeric(4,1),
  assigned_technician_id uuid REFERENCES employees(id),
  status text NOT NULL DEFAULT '待到廠',  -- 待到廠 / 已到廠 / 等待中 / 維修中 / 待取車 / 已完成 / 已取消
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,

  -- jsonb metadata（變動中、純顯示）
  metadata jsonb DEFAULT '{}'::jsonb,

  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX appointments_brand_date_status ON appointments (brand_id, appointment_date, status);
CREATE INDEX appointments_brand_tech_date  ON appointments (brand_id, assigned_technician_id, appointment_date);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY appointments_select ON appointments FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY appointments_insert ON appointments FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY appointments_update ON appointments FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY appointments_delete ON appointments FOR DELETE USING (user_has_brand(brand_id));
```

### 欄位分類

| 欄位 | 落腳 | 理由 |
|---|---|---|
| brand_id / status / customer_id / vehicle_id / service_type / appointment_date+time | typed | RLS / FK / index / KPI 都要用 |
| service_subtype / estimated_hours / assigned_technician_id | typed | 報表會用、需 index by tech |
| arrived_at / started_at / completed_at | typed | 工時與超時計算的 SoR |
| metadata.source（電話 / LINE / 官網 / 進廠 / SA 主動聯絡） | jsonb | 還在演化、未來統計需求出現再 promote |
| metadata.line_notification_sent_at | jsonb | 通知 hub 自己會留 deliveries log，這只是顯示用 marker |
| metadata.customer_tags_snapshot | jsonb | 純顯示、變動中、不是 FK |
| metadata.linked_pre_inspection_id | jsonb | 等 pre_inspections 表落地後 promote 為 typed FK |

---

## 3. Domain Helper 規劃

檔案：`src/domain/appointments.ts`（不 export 非 async value，常數拆 `appointments.constants.ts`）

```ts
"use server";

export type AppointmentStatus = "待到廠" | "已到廠" | "等待中" | "維修中" | "待取車" | "已完成" | "已取消";
export type AppointmentRow = ...;
export type AppointmentDetailRow = AppointmentRow & {
  customer: { id; name; phone } | null;
  vehicle:  { id; license_plate; model_name } | null;
  technician: { id; name } | null;
};
export type AppointmentListFilters = {
  date?: string; status?: string; service_type?: string; technician_id?: string; q?: string;
};
export type DailyKpis = {
  total: number; arrived: number; waiting: number; waiting_overdue: number;
  in_progress: number; in_progress_avg_hours: number;
  completed: number; pending_pickup: number;
};
export type ScheduleSlot = { time: string; items: { customer_name; service_type_label; tech_short }[] };
export type TechnicianLoad = { id; name; load: number; max: number; status: string };

export async function listAppointments(filters: AppointmentListFilters): Promise<AppointmentDetailRow[]>
export async function getAppointmentById(id: string): Promise<AppointmentDetailRow | null>
export async function getAppointmentsListPageData(filters): Promise<{
  rows: AppointmentDetailRow[];
  totalCount: number;
  customers: { id; name }[];
  vehicles: { id; license_plate; model; customer_id }[];
  technicians: { id; name }[];
  kpis: DailyKpis;
  schedule: ScheduleSlot[];
  techLoad: TechnicianLoad[];
}>
export async function getAppointmentDetailPageData(id: string)
export async function getAppointmentNewPageData()
```

實作策略 Day 1：直連 supabase（透過 `createClient` from server）+ `getActiveScope().brand_id`。

對應 server actions：`src/lib/aftersales/appointment-actions.ts`（`Result<T>` 型別、不 redirect）：
- `createAppointmentAction`
- `updateAppointmentAction`
- `setAppointmentStatusAction(id, status, payload?)`（內含 markArrived / start / complete 三變體共用）
- `cancelAppointmentAction(id, reason)`
- `deleteAppointmentAction(id)`（軟刪：設 is_canceled / 改 status='已取消'，本表沒 is_active）

---

## 4. 副作用清單

| 動作 | 副作用 | 拍板 |
|---|---|---|
| createAppointment | （未來）推 LINE 給客戶 | ❌ Phase 1 不接 — 等 customer LINE OA 綁定 schema 出來再加 |
| markArrived | （未來）推 LINE 給 SA「客戶到廠」 | ❌ Phase 1 不接 |
| startPreInspection | 在 pre_inspections 表 INSERT 一張 + 切 status='等待中' + 寫 `metadata.linked_pre_inspection_id` | ⏸ pre_inspections 表還沒建 → 本 Phase「預檢」按鈕 disabled + tooltip「預檢模組待開發」 |
| 改派技師 | 推 LINE 給原 / 新技師 | ❌ Phase 1 不接 |
| cancelAppointment | 推 LINE 給客戶 + 釋放車位 | ❌ Phase 1 不接 — 純改 status |

> 全列為 Phase 2 待加，避免 dependencies 上升、Phase 1 卡住。

---

## 5. 會計事件分析

**本功能會產生的會計事件**：0 個

預約本身不過帳。建立 appointment / 改 status / 取消都不產生資金流。會計事件發生在下游 RO 結帳關單（`08_結帳收款`），由那個 phase 的 transaction_type 處理。

→ 本 section 寫「無 — 純資料維護 / 流程啟動，不產生資金流」。

---

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 預約看板 | `/parts/aftersales/appointments` | List + Dashboard 混合 | 客製：上半 dashboard 區塊（KPI + schedule + tech load）+ 下半 design-pattern 標準（filter bar + DataGrid） |
| 預約詳情 | `/parts/aftersales/appointments/[id]` | Page View | `parts/setup/items/[id]/_components/item-detail-view.tsx` |
| 新增預約 | `/parts/aftersales/appointments/new` | Page View（create mode） | reuse 同一份 detail view，傳 `initialMode="create"` |

不動 `/service/appointments`（既有一份 hardcode demo，另一條 sidebar 入口、跟此 nav_node 無關）。

---

## 7. nav_nodes 切換（雙 brand）— UPDATE，不 INSERT

兩筆既有節點是 `static_html` + `href='/parts/aftersales/appointments'`。落地後改型態：

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route'
 WHERE id IN (
   '869aca0b-bf79-46de-9116-1adb5871a8b5',  -- ducati 預約管理看板
   'ce276bdb-f402-472c-a274-ff942703f326'   -- indian 預約管理看板
 );
-- href 不動（路徑已正確）；html_storage_path 保留作歷史檔
```

退路：失敗時 `SET page_kind='static_html'` 恢復 HTML 渲染。

---

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/appointments.ts` |
| 新增 | `src/domain/appointments.constants.ts`（status / service_type 常數，避免 "use server" export non-async value 雷） |
| 新增 | `src/lib/aftersales/appointment-actions.ts`（server actions） |
| 新增 | `src/app/(workspace)/parts/aftersales/appointments/page.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/appointments/_components/appointments-board.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/appointments/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/appointments/[id]/_components/appointment-detail-view.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/appointments/new/page.tsx` |
| DB | `apply_migration: create_appointments_table` |
| DB | UPDATE 雙 brand nav_nodes 切 react_route |
| DB | seed 6-8 筆 indian demo data |
| Type | regenerate `src/lib/database.types.ts` |

---

## 9. Verification

1. tsc / eslint 0 errors（必過）
2. `grep -rn "@/lib/supabase" src/app/\(workspace\)/parts/aftersales/appointments` = 0 hit
3. Playwright CLI：開 `/parts/aftersales/appointments` 載入成功（200）、看到「預約管理看板」標題、看到 4 張 KPI 卡、看到「+ 新增預約」、表格至少 1 row
4. Sidebar：「預約管理看板」chip 從 HTML 變成 REACT、點擊進新頁面（雙 brand 各驗一次）
5. 改 status 後 KPI 數字應同步變動（樂觀更新 + revalidatePath）

---

## 10. Auto-decisions（拍板紀錄，自動採用以下選項）

| Q | 選項 | 理由 |
|---|---|---|
| 路由命名 | `/parts/aftersales/appointments` | 與 sibling 兄弟頁（10 張 nav_node）一致；nav 既有 href 無須改 |
| customers / vehicles 依賴 | 直接使用既有 `customers` + `customer_vehicles` 表（已存在） | 表已存在、無 placeholder 必要；先用 FK 不留 stub |
| 「預檢」按鈕 | disabled + tooltip「預檢模組待開發」 | pre_inspections 表還沒建、disabled 比 placeholder 跳轉乾淨 |
| 副作用 | Phase 1 不接 LINE / 不寫 audit log | 降複雜度、focus 在 CRUD 跑通；通知 hub 已成熟、Phase 2 一行 dispatch 即可 |
| 狀態機嚴格度 | 寬鬆：所有 status 皆可手改，不擋 transition | demo 期靈活優先；後續真正切到生產時再加 state-machine guard |
| KPI 動態化 | Day 1 全動態（從當天 appointments 算）；超時定義 = 「狀態=等待中 且 arrived_at < 30 分鐘前」 | phase1.md 推薦、簡單一條 SQL 算 |
| 技師負載 max | hardcode max=4（內建 const）、本 phase 不進 business_rules | 依 SKILL §禁區「為 role 設定能 / 不能 → RBAC；量化 → business_rules」— 但這只是視覺尺度、未到「業務規則」門檻；後續真要可調再進 business_rules |
| Permission | reuse 既有 `PERMISSIONS.APPOINTMENT_VIEW / EDIT` | 已存在，無須新加 |
| 雙 brand | UPDATE 既有兩筆 nav_node 切 react_route，不 INSERT | 兩筆都已存在 |
| Indian seed | 塞 6-8 筆 demo（依 CLAUDE.md indian 預設規則） | Ming 平常測 indian、空畫面=誤判系統壞 |

---

## 11. 不做（明確列出，避免下次質疑）

- ❌ 不做 LINE 通知接點（Phase 2）
- ❌ 不做技師派工演算法（Phase 2）
- ❌ 不做超時警示（Phase 2）
- ❌ 不動 `/service/appointments`（那是另一個 demo、跟本 nav_node 無關）
- ❌ 不刪 nav_node 的 `html_storage_path`（保留當歷史檔，依 SKILL §階段 4 規則）
- ❌ 不重建 customers / customer_vehicles / employees 表（reuse）
- ❌ 不做 pre_inspections 表（不在本 feature 範圍）
