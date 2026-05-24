# Feature Proposal — Tech 技師工作台（Phase 1：結構分析 + 架構提案）

> spec-to-feature Phase 1-3。**本文件只到「架構提案 + 拍板」，不含落地。**
> 範圍由 Ming 拍板：**接單 / 工項勾選 / 標記完成 / 追加標記 + 工時計 / 暫停 / 轉派**（7 功能）。
> Batch C4・第十一輪・2026-05-24

---

## 0. TL;DR（給 Ming 三句話版）

1. **Tech 工作台操作 `repair_orders`（+ `repair_order_lines`），不是 `work_orders`** —— 因為派工的單一事實來源是 `repair_orders.lead_technician_id`，`/service/workshop` 派工看板、`setLeadTechnicianAction` 全都在這條軌；`work_orders` 是 admin master-data 編輯 + 發料的平行視角，跟技師執行端沒接起來。
2. **工時計 + 工項完成標記 DB 完全沒欄位** —— `repair_order_lines` 無 done/status、`repair_orders` 無 timer 欄。建議**新增一張 `labor_time_sessions` 表**（暫停/續跑自然成多 row）+ `repair_order_lines` 加 `done`/`done_at` 兩欄。
3. **`/tech` route 不存在、nav 無入口、技師 role 無接單/工時 permission** —— 全要新建（permission code 本 task 只列、不建）。

---

## 1. Phase 1 — 結構分析（探查事實）

### 1.1 `/tech` route 現況

| 探查項 | 結果 |
|---|---|
| `src/app/(workspace)/tech/` 目錄 | **不存在** |
| `modules.ts` 有無 Tech 模組 | **無**（只有 `/sales/bdc` 電銷工作台，名字像但無關） |
| `nav_nodes` 有無 Tech 入口 | 無（要落地時雙 brand 各 INSERT） |
| 既有最接近的東西 | `/service/workshop`（維修廠派工看板，SA/工頭視角，**派工方** 不是 **執行方**）+ `/parts/aftersales/management/dispatch`（即時派工看板，純讀 KPI） |

**結論**：Tech 工作台是全新頁面。它跟 `/service/workshop` 的差別 ——
- `/service/workshop` = **派工方**（工頭/SA）把 active RO 指派給技師（改 `lead_technician_id`）。
- `/tech` = **執行方**（技師本人）看「指派給我的單」、接單、勾工項、計工時、標完成、追加項目、轉派。

### 1.2 雙表問題 —— Tech 工作台到底操作 `repair_orders` 還是 `work_orders`？

**答案：`repair_orders`（+ `repair_order_lines`）。** 依據：

| 證據 | 指向 |
|---|---|
| `setLeadTechnicianAction(roId, technicianId)` 改的是 `repair_orders.lead_technician_id` | repair_orders 是派工載體 |
| `/service/workshop` 的 `getWorkshopBoardData()` 撈 `repair_orders` + `aftersales_technicians`、用 `lead_technician_id` 算每技師被指派幾張 | 派工軌 = repair_orders |
| `repair_order_addons.ro_id` → `repair_orders.id`；追加項目同意後寫 `repair_order_lines` | 追加項目掛在 repair_orders |
| `repair_order_lines` 是技師實際施作的「工項 / 零件」明細（kind='labor'/'part'） | 工項勾選 = repair_order_lines |
| RO 狀態機：進行中 → 維修中 → 待結帳 → 已關單（已取消） | 技師執行進度反映在 repair_orders.status |
| `work_orders` / `work_order_items` 只被 `/admin/master-data/work-orders/*`（編輯頁）+ `stock_issues.ro_id`（發料）引用，**沒有任何技師執行 UI 讀它** | work_orders ≠ 技師執行端 |

> ⚠️ `work_order_items` 有 `technician_id` + `labor_minutes`（估時）欄看似「技師工時」，但那是 admin 後台維修工單的明細欄、跟 RO 軌平行、demo 沒接起來。Tech 工作台**不碰 work_orders**，避免製造第二套真相。（拍板點 Q1 再確認是否同意此切法。）

### 1.3 工時計 / 暫停 的狀態 —— DB 現況

schema-check 三張表，**沒有任何 labor timer / 計時 session 欄位**：

| 表 | 有的時間欄 | 缺的（工時計需要） |
|---|---|---|
| `repair_orders` | `opened_at` `closed_at` `issue_date` | ❌ 無計時 started/paused/accumulated |
| `repair_order_lines` | `created_at` `updated_at` | ❌ 無 done 標記、無 timer、無 status |
| `work_order_items` | `labor_minutes`（估時 smallint） | ❌ 無實際計時欄 |
| `aftersales_technicians` | `started_at`（當前單開始時間，demo 快照）`sold_minutes` `actual_minutes` `available_minutes` `jobs_total` `jobs_done` `status` | 這些是**人效快照欄**，非逐單 timer；目前是 seed 寫死的 demo 值、沒有寫入邏輯把真實工時餵進來 |

**結論**：工時計要新增儲存。兩個選項（拍板點 Q2）——
- **方案 A（建議）**：新表 `labor_time_sessions`（每次 start→pause 一個 row，accumulated 用 SUM 算）。乾淨、可追溯、暫停/續跑天然多 row、未來算實際工時直接 aggregate。
- 方案 B：`repair_orders` 加 `timer_started_at` / `timer_accumulated_seconds` 兩欄（單一 active timer/單）。省一張表但只能「整張單一個 timer」、無法逐工項計時、無歷史。

### 1.4 工項完成標記 —— DB 現況

`repair_order_lines` **無 done/completed/status 欄位**。「工項勾選 / 標記完成」需要在這張表加標記欄（拍板點 Q3）。

### 1.5 追加標記 —— DB 現況（已就緒）

`repair_order_addons` 已存在且結構完整：`addon_type`(labor/parts/labor_and_parts)、`safety_level`(normal/safety_related/safety_critical)、`customer_decision`、`tech_reason`、`proposed_by`、`estimated_fee`、`reserved_at` + `reserved_movement_id`（B3 庫存預留 hook 已留欄）。技師端「追加標記」= 新增一筆 `customer_decision='pending'` 的 addon，**不用改 schema**。

### 1.6 接單 —— 是什麼動作？

技師「接」一張指派給他的單。現況 `repair_orders` 無「技師已接受」欄位。選項（拍板點 Q4）——
- **方案 A（建議，最小）**：接單 = `repair_orders.status` 從「進行中」切到「維修中」+ 記 `metadata.accepted_at` / `accepted_by`。不加 typed 欄。
- 方案 B：加 typed `accepted_at` / `accepted_by` 欄（報表要算「派工→接單」時差才需要）。

> 註：`setLeadTechnicianAction` 目前在派工時若 RO 還是「進行中」就**順手切成「維修中」**。若接單採方案 A，要避免「派工即接單」—— 建議派工只設 `lead_technician_id`（status 維持「進行中」=已派未接），技師主動接單才切「維修中」。此調整影響 `setLeadTechnicianAction` 行為，列 delta（見 §6）。

### 1.7 轉派 —— 是什麼動作？

轉派 = 改 `repair_orders.lead_technician_id` 到另一技師。現況 `setLeadTechnicianAction` 已能做。問題：**要不要記派工歷史？**（拍板點 Q5）——
- **方案 A（建議，最小）**：轉派寫 `repair_orders.metadata.dispatch_history[]`（append `{from, to, at, by}`）。零新表。
- 方案 B：新表 `repair_order_dispatch_logs`（要做派工稽核 / 跨單統計才值得）。

### 1.8 SA-09 人效資料流（工時 → aftersales_technicians）

`aftersales_technicians` 的 `sold_minutes`(賣出工時=標準LU換算) / `actual_minutes`(實際工時) / `available_minutes`(可用工時) / `jobs_total` / `jobs_done` 目前是 demo 快照。**工時計落地後要把真實值餵進去**：
- 完成一張單 → `actual_minutes += 該技師本單 timer SUM`、`sold_minutes += Σ(labor_units × 標準分鐘/LU)`、`jobs_done += 1`。
- 這條回寫流接到 §2 的 `markOrderComplete` helper 末端（拍板點 Q6：完成即回寫 vs 批次重算）。

---

## 2. Phase 2 — 架構提案

### 2.1 頁面結構（誠實標明偏離 design pattern 處）

Tech 工作台是**即時工作主控台**，不是標準 list/detail CRUD。採用 **卡片式看板 + inline 操作**：

```
/tech  （技師工作台首頁）
┌─────────────────────────────────────────────────────┐
│ Header：技師姓名 + 今日 KPI（接單數/進行中/已完成/今日工時）│
├─────────────────────────────────────────────────────┤
│ Tab：[待我接單] [進行中] [今日完成]                       │
├─────────────────────────────────────────────────────┤
│ ┌─ RO 卡片 ──────────────────────────────────────┐   │
│ │ RO-CP-260524-001  [維修中]   ⏱ 01:23:45 計時中    │   │
│ │ 客戶/車牌/車型                  [暫停][標記完成]    │   │
│ │ ─ 工項清單（repair_order_lines）─                 │   │
│ │   ☑ Desmo 12000km 保養   2.5 LU                   │   │
│ │   ☐ 前煞車皮更換          0.5 LU   [開始計時]      │   │
│ │ [＋ 追加項目]  [轉派給…]                            │   │
│ └────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**照 design pattern token 的部分**：色票（#1A3A5C 主色 / #0F6E56 綠 / #CC0000 紅）、字級階梯、chip 樣式、按鈕高度（h-[30px]/h-[26px]）、banner、`<Kv>`、pending 鎖 UI。

**誠實標明偏離**：
- ❌ 不用 `<DataGrid>` —— 技師端是「卡片式作業面板」不是資料表格，column visibility/Excel 匯出/排序對技師無意義。
- ❌ 不做標準 `[id]/detail` view/edit/create 三 mode —— 技師不「編輯工單主檔」，只在卡片上做有限即時動作。工單主檔編輯仍走 `/parts/aftersales/repair-orders/[id]`。
- ✅ 偏離理由：即時性 + 觸控友善（技師可能用平板在車間操作），卡片比表格更適合「一張單一個工作單元」的心智模型。

> 拍板點 Q7：看板/卡片式（建議）vs 硬套 list+detail？

### 2.2 Domain Helper API（新檔 `src/domain/tech-workstation.ts`）

UI 一律走 helper（天條）。新檔 reuse 既有 `repair-orders.ts` / `repair-order-lines.ts` / `repair-order-addons.ts` 的型別與部分 query，**新動作集中在此檔**。

```ts
// src/domain/tech-workstation.ts  (server-only, "use server")

// ── 讀 ──
listMyAssignedOrders(techId: string, tab?: 'pending'|'in_progress'|'done_today')
  → RO 卡片清單（lead_technician_id = techId、含 lines、timer 當前狀態）
getMyWorkstationKpi(techId)
  → { acceptedCount, inProgressCount, doneToday, todayWorkedMinutes }

// ── 接單 ──（Q4 方案 A）
acceptOrder(roId)
  → repair_orders.status 進行中→維修中 + metadata.accepted_at/accepted_by

// ── 工項 ──（需 repair_order_lines.done 欄，Q3）
toggleWorkItem(lineId, done: boolean)
  → repair_order_lines.done = done, done_at = done ? now() : null

// ── 標記完成 ──
markOrderComplete(roId)
  → 1) 驗所有 labor line done（或允許強制，Q3b）
    2) stop 進行中的 timer
    3) repair_orders.status → 待結帳
    4) 回寫 aftersales_technicians 人效（§1.8、Q6）

// ── 追加項目 ──（reuse repair_order_addons，無需改 schema）
addAddon(roId, { name, addon_type, safety_level, tech_reason, estimated_fee })
  → INSERT repair_order_addons (customer_decision='pending', proposed_by=techId)
  → ⚠️ 建 addon 後觸發「庫存預留 hook」#4（B3 負責；本 helper 只標記呼叫點）

// ── 工時計 ──（需 labor_time_sessions 表，Q2 方案 A）
startLaborTimer(roId, lineId?)   → INSERT session row (started_at=now, ended_at=null)
pauseLaborTimer(roId, lineId?)   → UPDATE 該 active session ended_at=now
                                   （續跑 = 再 startLaborTimer 開新 row）
getTimerState(roId)              → { isRunning, accumulatedSeconds, activeSessionId }

// ── 轉派 ──（Q5 方案 A）
reassignOrder(roId, toTechId)
  → 改 lead_technician_id + append metadata.dispatch_history[]
  → 內部 reuse setLeadTechnicianAction（已驗 brand/active）
```

### 2.3 工時計資料模型（建議方案 A — 新表）

```sql
CREATE TABLE labor_time_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  repair_order_id uuid NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  repair_order_line_id uuid REFERENCES repair_order_lines(id) ON DELETE SET NULL,  -- null = 整張單層級計時
  technician_id uuid NOT NULL REFERENCES aftersales_technicians(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,                 -- null = 計時中
  duration_seconds integer GENERATED ALWAYS AS
     (CASE WHEN ended_at IS NULL THEN NULL
           ELSE EXTRACT(EPOCH FROM (ended_at - started_at))::int END) STORED,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON labor_time_sessions (brand_id, repair_order_id);
CREATE INDEX ON labor_time_sessions (technician_id, started_at);
-- 同一 (ro, line, tech) 同時只能有一個 ended_at IS NULL（避免重複開計時）
CREATE UNIQUE INDEX one_active_timer_per_line
  ON labor_time_sessions (repair_order_id, COALESCE(repair_order_line_id, repair_order_id), technician_id)
  WHERE ended_at IS NULL;
```

**暫停/續跑語意**：start → 開 row（ended_at=null）；pause → 該 row 填 ended_at；續跑 → 開新 row。累計工時 = `SUM(duration_seconds) WHERE ro=X`；當前是否計時中 = 存在 `ended_at IS NULL` 的 row。

**完成回寫人效**（接 §1.8）：`markOrderComplete` 末端
```
actualMinutes = SUM(duration_seconds)/60 WHERE ro=X AND tech=Y
soldMinutes   = Σ(line.labor_units × MINUTES_PER_LU)   -- MINUTES_PER_LU demo 常數，或讀 business_rules
UPDATE aftersales_technicians
  SET actual_minutes = actual_minutes + actualMinutes,
      sold_minutes   = sold_minutes + soldMinutes,
      jobs_done      = jobs_done + 1,
      started_at = null, current_ro_code = null, status = 'idle'
  WHERE id = techId;
```

### 2.4 工項完成標記（需改 `repair_order_lines`）

```sql
ALTER TABLE repair_order_lines
  ADD COLUMN done boolean NOT NULL DEFAULT false,
  ADD COLUMN done_at timestamptz,
  ADD COLUMN done_by uuid;  -- aftersales_technicians.id（誰勾的）
```
只對 `kind='labor'` 有意義（零件靠發料軌追蹤）；UI 只在 labor line 顯示勾選框。

### 2.5 追加項目（reuse `repair_order_addons`，零 schema 改動）

`addAddon` INSERT 一筆 `customer_decision='pending'` 的 addon。安全相關（safety_level≠normal）的追加在卡片用紅 chip 標。**建立後觸發庫存預留 hook（#4）是 B3 的事**，本 helper 只在註解標呼叫點，不實作預留。

### 2.6 UX（CLAUDE.md §UX 互動規範）

每個寫入動作都要 loading + 鎖 UI（用 `useTransition` 的 `isPending`）：

| 動作 | pending 文案 | 樂觀更新 |
|---|---|---|
| 接單 | 「接單中⋯」 | 卡片移到「進行中」tab |
| 勾工項 | checkbox 半透明 + spinner | 立即打勾、失敗 rollback |
| 開始/暫停計時 | 按鈕「⋯」+ disabled | timer 立即跑/停（client tick + server session）|
| 標記完成 | 「完成中⋯」 | 卡片移到「今日完成」|
| 追加項目 | 「新增中⋯」 modal 鎖住 | banner 「✓ 已追加，待 SA 與客戶確認」|
| 轉派 | 「轉派中⋯」select disabled | 卡片從清單消失 |

計時器顯示用 client-side tick（`setInterval` 每秒 +1）疊在 server 的 accumulated 上，避免每秒打 server。

### 2.7 RLS（技師只看自己 brand + 指派給自己的單）

- `repair_orders` 已有 brand-aware RLS（`user_has_brand`），**跨 brand 已擋**。
- 「只看指派給我的單」是**業務過濾不是 RLS** —— helper `listMyAssignedOrders` 帶 `.eq('lead_technician_id', techId)`。（技師理論上仍有 RO_VIEW 權限可看全 brand 工單；「我的單」是視圖過濾，非安全邊界。）
- **新表 `labor_time_sessions` 要加 ENABLE RLS + 4 policy**（brand-aware）：

```sql
ALTER TABLE labor_time_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lts_select" ON labor_time_sessions FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY "lts_insert" ON labor_time_sessions FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY "lts_update" ON labor_time_sessions FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY "lts_delete" ON labor_time_sessions FOR DELETE USING (user_has_brand(brand_id));
```

### 2.8 權限（RBAC）

技師 role 現有 perm：`service.ro.view` / `service.inspection.view`+`edit` / `parts.issue.view`+`create` / `service.pi.execute` / `service.pdi.execute` / `service.appointment.view` / `master.item.view`。

Tech 工作台需要的動作，**現有 permission 對映 + 缺口**：

| 動作 | 現有可用 perm | 缺口（建議新 code，本 task 不建） |
|---|---|---|
| 看我的單 | `service.ro.view` ✅ | — |
| 接單 | — | `service.ro.accept`（新） |
| 勾工項/標完成/工時計 | — | `service.ro.execute`（新，統包施工動作） |
| 追加項目 | — | `service.addon.propose`（新；或暫掛 `service.ro.execute`）|
| 轉派 | `service.ro.dispatch`（目前工頭才有）| 技師能否自行轉派？（Q8）—— 若可，技師 role 補 `service.ro.dispatch`；若不可，轉派按鈕只對有 dispatch 權的人顯示 |

> 新 permission code 由落地 batch 建（INSERT `permissions` + 補技師 `role_permissions`）。本 task 只列清單。

### 2.9 會計事件分析

**無直接會計事件。** Tech 工作台的動作（接單/勾工項/工時/完成/追加標記/轉派）都是**施工進度與工時紀錄**，不產生資金/庫存/收入變動。

例外接點（不在本 task 範圍、只標明）：
- 追加項目同意後寫 `repair_order_lines` → 影響 RO 金額（在 §addons / checkout 軌結算時才入帳）。
- `markOrderComplete` 切「待結帳」→ 真正開立收入分錄在 **結帳模組**（feature-aftersales-checkout）。
- 工時計的 `actual_minutes` 是**管理會計 / 人效指標**，非財務分錄。

---

## 3. 新增 schema 彙總（待拍板才落地）

| # | 物件 | 類型 | 必要性 | 對應功能 |
|---|---|---|---|---|
| 1 | `labor_time_sessions`（新表 + RLS 4 policy + 2 index + 1 unique） | 新表 | 工時計核心 | 工時計/暫停/續跑 |
| 2 | `repair_order_lines.done` / `done_at` / `done_by` | ALTER 加 3 欄 | 工項完成標記 | 工項勾選/標完成 |
| 3 | `repair_orders.metadata.accepted_at/accepted_by` | jsonb（不改 schema） | 接單 | 接單 |
| 4 | `repair_orders.metadata.dispatch_history[]` | jsonb（不改 schema） | 轉派歷史 | 轉派 |
| 5 | permission codes：`service.ro.accept` / `service.ro.execute` / `service.addon.propose` | INSERT permissions + role_permissions | 權限 | 接單/施工/追加 |
| 6 | nav_nodes：`/tech` 雙 brand 入口 | INSERT 2 row | 導航 | 全頁 |

新 domain 檔：`src/domain/tech-workstation.ts` + `src/lib/aftersales/tech-workstation-actions.ts`（Result<T> pattern）。

---

## 4. 最小可驗範圍 vs 完整

- **最小可驗（建議先落地）**：`labor_time_sessions` 表 + `repair_order_lines.done` 欄 + helper 7 支 + `/tech` 頁卡片式 + 接單/勾工項/標完成/工時計/轉派。追加項目先做「建 addon」不接預留 hook。Indian brand 先進 nav。
- **完整**：再補 permission 細分、派工歷史 typed 表、人效自動回寫、追加項目接 B3 預留、Ducati nav。

---

## 5. 探查踩雷 / 已知事實

- `roles` 表用 `name`（中文「技師」）無 `code` 欄，查 role 要用 `name ILIKE`。
- Indian brand 有真實 RO 資料（已關單 131 / 進行中 8 / 維修中 1 / 待結帳 1），demo 用 Indian（符合 CLAUDE.md）。
- `setLeadTechnicianAction` 派工時會把「進行中」順手切「維修中」—— 跟「接單才切維修中」的設計衝突，落地要決定（見 §6 delta）。
- `aftersales_technicians.id` 是技師主鍵，但**它跟登入 `auth.users` / `employees` 沒有 FK 串接** —— 技師工作台要知道「當前登入者是哪個 technician」，需要一個對映（拍板點 Q9）。

---

## 6. Delta（已批准範圍內，執行中發現要調整的）

**`setLeadTechnicianAction` 行為衝突**：目前派工即把「進行中→維修中」。若採接單方案 A（技師主動接單才切維修中），派工應只設 `lead_technician_id`、status 維持「進行中」（語意=已派未接）。這會改動既有 `/service/workshop` 的行為。建議：派工後 status='進行中'（已派未接）、技師 acceptOrder 才切'維修中'。**這是已批准「接單」功能的必要 delta，列此請 Ming 點頭調整 `setLeadTechnicianAction`。**

---

## ⚠️ 等待 Ming 拍板

| # | 拍板點 | 建議 | 備選 |
|---|---|---|---|
| Q1 | Tech 工作台操作 `repair_orders` 不碰 `work_orders`？ | ✅ 是（依據 §1.2 一整排證據） | 若要併 work_orders 軌請說明場景 |
| Q2 | 工時計存哪？ | **新表 `labor_time_sessions`**（暫停/續跑天然多 row、可逐工項、有歷史） | repair_orders 加 2 欄（單一 timer，省表但功能弱） |
| Q3 | 工項完成標記加 `repair_order_lines.done`？ | ✅ 加 done/done_at/done_by 三欄 | 純用 metadata（不利報表） |
| Q3b | 標記完成時是否強制「所有 labor 工項已勾完」？ | 建議軟性（未勾完跳確認，可強制完成） | 硬性擋 |
| Q4 | 接單 = 改 status+metadata（不加 typed 欄）？ | ✅ 方案 A（metadata.accepted_at） | 加 typed 欄（要算派工→接單時差才需要） |
| Q5 | 轉派要不要派工歷史表？ | metadata.dispatch_history[]（零新表） | 新表 dispatch_logs（要稽核才值得） |
| Q6 | 完成時即時回寫人效 vs 批次重算？ | 完成即回寫 aftersales_technicians | 夜間批次重算（較準但延遲） |
| Q7 | 頁面採卡片式看板 vs 硬套 list+detail？ | ✅ 卡片式（即時性 + 觸控） | 標準 design pattern |
| Q8 | 技師能否自行轉派（補 `service.ro.dispatch` 給技師 role）？ | 建議只工頭/SA 能轉派，技師卡片不顯示轉派按鈕 | 技師可自行轉派 |
| Q9 | 「當前登入者 ↔ aftersales_technicians」如何對映？ | 建議 `aftersales_technicians` 加 `auth_user_id` 或 `employee_id` FK | demo 階段用 metadata 對映表 / URL 帶 techId |
| Q10 | 先做 Indian 單 brand nav，還是雙 brand？ | Indian 先（Ming 測試 scope） | 雙 brand 同時 |
| Q11 | 最小可驗範圍（§4）先落地，追加項目不接 B3 預留？ | ✅ 是 | 一次做完整 |
