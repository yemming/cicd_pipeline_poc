# 提案：售後 — 增項閉環管理（追蹤看板）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/05_增項閉環_完整子模組.html`
> 日期：2026-05-11
> 階段：架構提案（Phase 1，僅結構分析；待用戶拍板）
> 上游 sender：`feature-aftersales-addons-phase1.md`（04_追加項目記錄）
> 下游 receiver：`feature-aftersales-appointments-phase1.md`（同意後建預約 RO）/ `feature-alerts-*`（10 預警告警的 inventory shortage 模組同一張看板）

---

## 0. TL;DR — 跟 04 提案對齊的結論

> 04 提案已經把 `followup_cases` 表的邊界用「addon ↔ followup_case 1:1」鎖死。本頁的工作不是設計**新表**，而是把 04 預留的 `repair_order_followup_cases` 落實成完整 schema、補上「狀態機 / 追蹤動作 / 主管介入 / 結案出口」這四塊 04 沒處理的部分。

**04 已經畫好的部分**（本頁照抄）：

- `repair_order_addons.followup_case_id uuid` ← FK 到本表
- `case_kind text` 四值：`deferred` / `rejected_safety` / `rejected_advisory` / `manual_escalate`
- `status text`：`open` / `manager_intervened` / `rebooked` / `long_term` / `closed_no_response`
- 1:1 FK：`followup_cases.source_addon_id` UNIQUE → `addons.id`

**本頁要補的部分**（04 沒處理）：

1. 追蹤動作流水表 `followup_actions`（D+3 提醒 / D+10 聯繫 / 主管介入記錄 / Line 提醒 / 等）
2. 時間軸計算（next_action_at / next_action_kind，由 case_kind + safety_level + 上次 action 時間推算）
3. 結案出口（rebook → 建預約、long_term → 下次回廠提醒、closed → 失銷統計）
4. 整店統計（失銷金額 / 閉環回收 / SA 個人閉環率 / Top 5 失銷項目）
5. 副作用：推 LINE 給車主、推 LINE 給主管、自動建立預約

---

## 1. 結構摘要

「增項閉環」是 04 拒絕 / 暫緩決策的**下游 receiver**。當技師在維修中發現額外問題、車主說「下次再說」或「不要做」、又是安全等級項目時，這筆 addon 不會死掉變失銷，而是升級為一筆**跨工單長期追蹤案件**，由 SA 透過 D+3 / D+10 兩階段聯繫 + 必要時主管介入，直到車主回心轉意建立新預約、或標記長期追蹤、或結案無回應為止。

HTML 上 3 個 tab：

1. **待追蹤看板**（pending）— 安全等級分組（紅色主管必須介入 / 黃色一般）的卡片堆疊，每張卡可展開時間軸 + action row
2. **追蹤時間軸**（timeline）— 跨案件的時間序表格（建立日 / 車主車型 / 項目 / 金額 / 進度 / 結果），可搜尋 / 期間 / 結果篩選
3. **整店統計**（stats）— 本月失銷金額 / 已閉環回收 / 待追蹤 / 長期追蹤 4 個 stat card + 最常失銷項目 Top 5 + SA 個人閉環績效

---

## 2. Schema 草案

### 2.1 主表 `repair_order_followup_cases`（04 預留、本頁落實）

```sql
CREATE TABLE repair_order_followup_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,

  -- 反查源頭
  source_addon_id uuid NOT NULL UNIQUE REFERENCES repair_order_addons(id),
                                                    -- 1:1，一個 addon 最多一筆閉環
  source_ro_id uuid NOT NULL REFERENCES repair_orders(id),
                                                    -- denormalize 自 addon.ro_id，方便篩選不用 join
  customer_id uuid NOT NULL REFERENCES customers(id),
                                                    -- denormalize，看板要顯示車主、要按客戶 group
  vehicle_id uuid REFERENCES vehicles(id),          -- denormalize，看板顯示車型 / 車牌

  -- typed core — 案件本質
  case_kind text NOT NULL,                          -- 'deferred' | 'rejected_safety' | 'rejected_advisory' | 'manual_escalate'
  safety_level text NOT NULL,                       -- 'safety_critical' | 'safety_related' | 'normal'
                                                    -- denormalize 自 addon.safety_level，看板分組軸
  estimated_fee numeric(12,2),                      -- denormalize，失銷統計加總用
  item_name text NOT NULL,                          -- denormalize 自 addon.name，看板卡片標題

  -- 狀態機
  status text NOT NULL DEFAULT 'open',              -- 'open' | 'manager_intervened' | 'rebooked' | 'long_term' | 'closed_no_response' | 'closed_other'
  status_changed_at timestamptz DEFAULT now(),

  -- 主辦 / 主管
  assigned_sa_id uuid REFERENCES employees(id),     -- 從 addon.decided_by_sa_id 帶入
  manager_intervened_at timestamptz,                -- safety_critical 主管介入時間戳
  manager_intervened_by uuid REFERENCES employees(id),
  manager_intervention_note text,                   -- 主管介入結果（電話內容摘要、是否同意⋯）

  -- 時間軸 — 下一個動作（後端推算、前端不傳）
  next_action_at timestamptz,                       -- e.g. D0 建立後 +3 天 = D3 提醒時間
  next_action_kind text,                            -- 'sa_reminder_d3' | 'sa_followup_d10' | 'manager_intervene' | 'long_term_check' | null
  last_action_at timestamptz,                       -- 上次任意 action 時間

  -- 結案結果
  closed_at timestamptz,
  close_reason text,                                -- 'rebooked' | 'no_response' | 'customer_refused_final' | 'other'
  rebooked_appointment_id uuid REFERENCES appointments(id),
                                                    -- status='rebooked' 時 FK 到新建的預約

  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX ON repair_order_followup_cases (brand_id, status, safety_level);
CREATE INDEX ON repair_order_followup_cases (brand_id, next_action_at) WHERE status = 'open';
CREATE INDEX ON repair_order_followup_cases (brand_id, assigned_sa_id, status);
CREATE INDEX ON repair_order_followup_cases (brand_id, customer_id);
CREATE INDEX ON repair_order_followup_cases (source_ro_id);

-- RLS 4 條
ALTER TABLE repair_order_followup_cases ENABLE ROW LEVEL SECURITY;
-- repair_order_followup_cases_{select,insert,update,delete} USING/WITH CHECK (user_has_brand(brand_id))
```

### 2.2 動作流水表 `repair_order_followup_actions`（本頁新建）

> ⚠️ **為什麼需要這張表**：HTML 時間軸顯示「D0 失銷建立 / D3 SA 提醒（未接通） / 主管介入 / D10 二次聯繫」這些事件每筆都是**獨立的可審計動作**，有人員 / 時間 / 結果 / 通路。如果只用 metadata jsonb array 存 → 沒法 index、沒法 join SA 績效報表、沒法做「平均處理時間」KPI。所以拆 child table。

```sql
CREATE TABLE repair_order_followup_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  case_id uuid NOT NULL REFERENCES repair_order_followup_cases(id) ON DELETE CASCADE,

  -- typed core
  action_kind text NOT NULL,                        -- 'created' | 'sa_reminder_d3' | 'sa_followup_d10' | 'manager_intervene' | 'line_sent' | 'long_term_marked' | 'rebooked' | 'closed'
  channel text,                                     -- 'phone' | 'line' | 'sms' | 'onsite' | 'system'
  outcome text,                                     -- 'connected_agreed' | 'connected_deferred' | 'connected_refused' | 'no_answer' | 'voicemail_left' | 'line_read' | 'line_unread' | 'system'
  acted_by uuid REFERENCES employees(id),           -- 誰執行的（system 動作為 null）
  acted_at timestamptz NOT NULL DEFAULT now(),

  -- 內容
  note text,                                        -- 聯繫摘要 / 留言內容
  is_system_generated boolean DEFAULT false,        -- 系統自動產生（如 D0 建立、D+3 過期觸發 next_action_at）

  metadata jsonb DEFAULT '{}'::jsonb,
                                                    -- e.g. { call_duration_sec, voice_recording_url, line_message_id, sms_provider_msg_id }
  created_at timestamptz DEFAULT now()
);

CREATE INDEX ON repair_order_followup_actions (case_id, acted_at DESC);
CREATE INDEX ON repair_order_followup_actions (brand_id, acted_by, acted_at);
CREATE INDEX ON repair_order_followup_actions (brand_id, action_kind, outcome);

-- RLS 4 條（同上 user_has_brand）
ALTER TABLE repair_order_followup_actions ENABLE ROW LEVEL SECURITY;
```

### 2.3 與 04 / 02 提案的關聯

```
repair_order_addons (04)
  ├─ followup_case_id ────────► repair_order_followup_cases.id  (04 已預留)
  └─ id ◄────────────────────── repair_order_followup_cases.source_addon_id  UNIQUE  (本頁新加)

repair_order_followup_cases (本頁)
  ├─ id ◄────────────────────── repair_order_followup_actions.case_id  (1:N)
  └─ rebooked_appointment_id ──► appointments.id  (01 提案)

repair_orders (02)
  └─ id ◄────────────────────── repair_order_followup_cases.source_ro_id  (denormalize / audit)
```

### 2.4 欄位分類（typed vs jsonb）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `source_addon_id` / `source_ro_id` / `customer_id` / `vehicle_id` | typed | FK + 看板列表 join 用 |
| `case_kind` / `safety_level` | typed | 看板分組軸（紅色 vs 黃色）、KPI group by |
| `estimated_fee` | typed | 失銷金額 / 已閉環回收 加總 |
| `item_name` | typed | 看板每張卡標題、Top 5 失銷項目 group by（雖然 denormalize 但 query 不能 join 1k 次） |
| `status` | typed | 狀態機核心，多頁 query 軸 |
| `assigned_sa_id` | typed | SA 個人閉環績效 KPI 軸 |
| `manager_intervened_at` / `manager_intervened_by` | typed | 主管介入率 KPI、合規 audit |
| `next_action_at` / `next_action_kind` | typed | **這是看板排序軸**（D+3 待提醒、D+10 待聯繫），必須 index |
| `last_action_at` | typed | 排序 / 「最近異動」filter |
| `closed_at` / `close_reason` / `rebooked_appointment_id` | typed | 結案 KPI / 預約反查 |
| `manager_intervention_note` | typed text | 合規重點，要 search、不算稀疏 |
| `metadata.last_call_recording_url` | jsonb | 稀疏（不是每筆都有錄音）、單頁顯示 |
| `metadata.customer_preferred_contact_time` | jsonb | SA 自由欄位、看板不 query |
| `metadata.original_tech_reason` | jsonb | 從 addon snapshot 過來保險用，純顯示 |
| `actions.metadata.*` | jsonb | 各通路特定欄位（line_message_id / call_duration_sec / sms_provider_id） |

### 2.5 既有表變更

無。本頁只新建兩張表。04 已預留 `repair_order_addons.followup_case_id` 不需再改。

---

## 3. Domain Helper 規劃

檔案：`src/domain/repair-order-followups.ts`

```ts
// 看板 query
export async function listOpenFollowupCases(filters: {
  brand_id: string;
  safety_level?: 'safety_critical' | 'safety_related' | 'normal';
  status?: string;
  assigned_sa_id?: string;
  next_action_due?: 'overdue' | 'today' | 'this_week';
}): Promise<Result<FollowupCaseWithActions[]>>;
//   ↑ 帶最近 N 筆 actions、addon snapshot、customer/vehicle 顯示欄

// 時間軸 tab（跨案件）
export async function listFollowupCasesForTimeline(filters: {
  brand_id: string;
  q?: string;                 // 車主姓名 / 工單號 / 項目
  period_days?: 30 | 60 | 90;
  result_filter?: 'in_progress' | 'closed' | 'long_term' | 'all';
}): Promise<Result<FollowupCaseSummary[]>>;

// 整店統計（Phase 1 可先做純 query 加總；複雜的可以 Phase 2 用 materialized view）
export async function getFollowupStats(brand_id: string, period_days: number): Promise<Result<{
  lost_sales_amount: number;
  lost_sales_count: number;
  recovered_amount: number;
  recovered_count: number;
  recovery_rate: number;
  pending_count: number;
  pending_safety_count: number;
  long_term_count: number;
  long_term_amount: number;
  top_lost_items: Array<{ name: string; count: number; amount: number }>;
  sa_performance: Array<{ sa_id: string; sa_name: string; closed: number; total: number; rate: number }>;
}>>;

// 詳情頁（單筆 case 完整 timeline）
export async function getFollowupCaseById(id: string): Promise<Result<{
  case: FollowupCase;
  actions: FollowupAction[];
  addon: AddonSnapshot;
  ro_summary: { ro_no: string; status: string };
  customer: { name: string; phone: string };
  vehicle: { model: string; plate: string };
}>>;

// 動作：記錄聯繫結果（D+3 / D+10 / 自由補記）
export async function logFollowupAction(input: {
  case_id: string;
  action_kind: 'sa_reminder_d3' | 'sa_followup_d10' | 'manager_intervene' | 'line_sent' | 'free_form';
  channel: 'phone' | 'line' | 'sms' | 'onsite';
  outcome: 'connected_agreed' | 'connected_deferred' | 'connected_refused' | 'no_answer' | 'voicemail_left' | 'line_read' | 'line_unread';
  note?: string;
}): Promise<Result<{ action_id: string; case: FollowupCase /* updated */ }>>;
//   內部副作用：1. INSERT action  2. UPDATE case.last_action_at / next_action_at / next_action_kind
//                3. outcome='connected_agreed' → 不自動建預約，回 ok 讓 UI 帶 SA 開預約流程
//                4. action_kind='manager_intervene' → UPDATE case.status='manager_intervened'

// 動作：建立預約（車主同意回廠）
export async function rebookFromFollowup(input: {
  case_id: string;
  appointment_payload: {
    preferred_date: string;
    preferred_time_slot: string;
    notes?: string;
  };
}): Promise<Result<{ case: FollowupCase; appointment_id: string }>>;
//   副作用（A 跨表事務）：
//     1. INSERT appointments（reason='followup_addon_rebook', source_followup_case_id=case_id）
//     2. UPDATE repair_order_followup_cases SET status='rebooked', closed_at=now(),
//                close_reason='rebooked', rebooked_appointment_id=...
//     3. INSERT repair_order_followup_actions (action_kind='rebooked', is_system_generated=true)
//     4. after() → notifications.dispatch({ code: 'followup.rebooked', ... })

// 動作：轉長期追蹤
export async function markLongTerm(case_id: string, note?: string): Promise<Result<{ case: FollowupCase }>>;
//   副作用：1. UPDATE status='long_term' + next_action_kind='long_term_check' + next_action_at=+90 days
//             2. INSERT action (action_kind='long_term_marked')

// 動作：主管介入記錄（safety_critical 專用）
export async function recordManagerIntervention(input: {
  case_id: string;
  manager_id: string;
  outcome: 'connected_agreed' | 'connected_refused' | 'connected_deferred' | 'no_answer';
  note: string;          // 強制必填（合規）
}): Promise<Result<{ case: FollowupCase; action_id: string }>>;
//   副作用：1. UPDATE case.manager_intervened_at/by/note + status='manager_intervened'
//             2. INSERT action (action_kind='manager_intervene')
//             3. after() → notifications.dispatch({ code: 'followup.manager_resolved', ... })

// 動作：發送 LINE 提醒（一般項目用）
export async function sendLineReminder(case_id: string): Promise<Result<{ action_id: string }>>;
//   副作用：1. 呼 notification hub 發 LINE
//             2. INSERT action (action_kind='line_sent', channel='line', outcome='line_unread')
//             3. 等待 webhook 回 LINE read receipt（Phase 3 後做，Phase 1 outcome 固定 unread）

// 動作：結案無回應
export async function closeNoResponse(case_id: string, note: string): Promise<Result<{ case: FollowupCase }>>;
```

每個函式內部實作策略（Day 1 預設）：

- listOpenFollowupCases / listFollowupCasesForTimeline / getFollowupStats / getFollowupCaseById → **直連 supabase**
- logFollowupAction / markLongTerm → **直連 supabase**（單表 + 1 子表寫入，可走 client、Day 1 不需 server action）
- rebookFromFollowup / recordManagerIntervention / sendLineReminder / closeNoResponse → **server action**（跨表事務 + LINE 通知 + audit 必要）

⚠️ **跟 04 的呼叫關係**：04 的 `decideAddon()` 在 deferred/safety 或 rejected/safety 場景會走「自動 INSERT followup_case」路徑，這個 INSERT 不透過本頁的 helper，而是在 04 的 decideAddon server action 內部直接寫（避免循環依賴）。本頁 helper 從 cases 已存在開始接手。04 的 `escalateToFollowup(addon_id)` 也是 04 helper 寫的（升級 normal/rejected → followup），但會 INSERT 同一張表。

---

## 4. 副作用清單

| 動作 | 副作用類型 | 細節 | 確定性 |
|---|---|---|---|
| logFollowupAction（一般） | F Cache 失效 | revalidatePath('/.../follow-up') | 確定 |
| logFollowupAction (outcome='connected_agreed') | — | **不自動建預約**（給 SA 確認 + 帶 appointment 流程） | 確定（畫面：「✅ 車主同意 → 建立預約」是獨立按鈕） |
| rebookFromFollowup | **A 跨表事務** | INSERT appointments + UPDATE case + INSERT action（雙 entity 變更必須原子） | 確定（畫面：「車主同意！建立預約回廠⋯」）|
| rebookFromFollowup | **B 通知** | 推 LINE 給車主（預約確認）+ 推主管（哪筆案件閉環） | [需確認] 推給誰 / 推什麼 event code |
| rebookFromFollowup | F Cache 失效 | revalidatePath（follow-up 看板 + appointments 看板） | 確定 |
| recordManagerIntervention | **B 通知** | 主管介入後推 LINE 給原 SA + 推 LINE 給原 RO 技師（可選） | [需確認] 推給誰 |
| recordManagerIntervention | D Audit | manager_intervention_note 是合規重點，已 typed column 記了；要不要另寫 audit_log？ | [需確認] |
| sendLineReminder | **B 通知** | 走 notification hub `notifications.dispatch({ code: 'followup.reminder_sent', ... })` | 確定 |
| sendLineReminder | E 外部 API | LINE Messaging API 由 hub 內部處理；Phase 3 才接 read receipt webhook | 確定 |
| markLongTerm | — | 純更新 case + 寫 action | 確定 |
| closeNoResponse | **B 通知** | 推 LINE 給主管「這筆案件結案無回應、失銷 NT$X」？ | [需確認] |
| **系統側自動觸發** | — | D+3 / D+10 過期 → 改 next_action_at + push 提醒給 SA？ | [需確認] **Phase 2 後 cron job 做**，Phase 1 只記 next_action_at 讓看板自己 sort、不主動 push |

⚠️ [需確認] 項目必須階段 3 跟用戶確認。

**Phase 1 落地策略**（依 side-effect-checklist.md Day 1 預設）：

- ✅ Phase 1 做：基本 CRUD + 狀態機 + 看板顯示 + 時間軸 + 統計
- ✅ Phase 1 做：rebookFromFollowup 的**跨表事務**（必做，否則案件結了預約沒建會掉單）
- ⏸ Phase 2 做：所有 LINE 通知（不阻塞主流程，Phase 1 純資料、看得到就行）
- ⏸ Phase 2 做：cron job 自動推 next_action_at 過期提醒
- ⏸ Phase 3 後：LINE webhook 回讀回執、外部 SMS gateway

---

## 5. 頁面骨架

| 頁面 | 路徑（建議） | 類型 | 範本 |
|---|---|---|---|
| **增項閉環看板**（本頁主入口） | `/parts/aftersales/follow-ups` | **客製 tab page**（不適用 canonical） | 自製 client component `follow-ups-board.tsx` |
| 詳情 modal / drawer | （inline expand）| 卡片展開 timeline + action row | 不另開頁，沿用 HTML 的 case-card 展開模式 |
| 主管介入記錄表單 | modal | form | 自製 `manager-intervention-modal.tsx` |
| 建立預約跳轉 | redirect → `/parts/aftersales/appointments/new?from_followup=<case_id>` | — | 01 appointments 提案接收 query param |

⚠️ **本頁不能直接套 canonical items-board / item-detail-view**：

- 視覺核心是「**卡片堆疊 + 安全分組 + 內嵌時間軸展開**」+ tab + stat dashboard，三個 tab 內各自不同視覺
- 直接寫成 `<Tabs>` + 三個獨立 sub-component
- 每張 case-card 用 `<details>` / state 控展開、展開後內嵌 timeline + action row
- 統計 tab 用 4 個 stat card + 兩個 list card（Top 5 失銷項目 + SA 績效）

頁面結構骨架：

```
[top banner: 🔴 N 個安全等級項目待主管介入 + 立即處理 button]
[tab bar: 待追蹤 (8) | 追蹤時間軸 | 整店統計]

=== Tab 1: 待追蹤看板 ===
[qbar: SA / 安全等級 / 追蹤狀態 + 匯出]
[sec: 🔴 安全等級（主管必須介入）]
  <CaseCard safety>
    [header: 🔴 名稱 / 車主車型工單SA / 金額 / D+N ⚠ 主管介入]
    [body (展開後):
       [tech-finding 摘要]
       [timeline: D0 → D3 → 主管介入 → D10 (預定)]
       [action-row: 🔴 主管介入記錄 | ✅ 車主同意 → 建立預約 | 長期追蹤]
    ]
  </CaseCard>
[sec: 一般項目 (6 件)]
  <CaseCard>
    [header: 🟡 名稱 / 車主車型工單SA / 金額 / D+N 進度]
    [body (展開後):
       [timeline: D0 → D3]
       [action-row: 記錄聯繫結果 | ✅ 車主同意 → 建立預約 | 發 Line 提醒]
    ]
  </CaseCard>

=== Tab 2: 追蹤時間軸 ===
[qbar: 搜尋 / 期間 / 結果 + 查詢]
[table: 建立日 | 車主車型 | 項目 | 金額 | 進度 | 結果 | 操作]

=== Tab 3: 整店統計 ===
[stat-grid: 本月失銷金額 | 已閉環回收 | 待追蹤 | 長期追蹤]
[2-col card:
   [最常失銷項目 Top 5（rank list）]
   [SA 個人閉環績效]
]
```

---

## 6. nav_nodes（雙 brand）

```sql
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES
  ('ducati', '<ducati-aftersales-parent>', 3, <n>, '增項閉環', 'replay_circle_filled', '/parts/aftersales/follow-ups', 'react_route', true, false),
  ('indian', '<indian-aftersales-parent>', 3, <n>, '增項閉環', 'replay_circle_filled', '/parts/aftersales/follow-ups', 'react_route', true, false);
```

建議擺位：售後管理群組底下，緊接 04 追加項目記錄之後（兩者語意相連、04 是上游 sender / 05 是下游 receiver）。

⚠️ 本頁也跟 **10_預警告警** 有交集（HTML banner 「→ 庫存缺料告警」按鈕），但本頁不直接擁有缺料告警 entity；那是 alerts 模組的事。10 提案會建獨立的 `inventory_shortage_alerts`，本頁只在 banner 提供 cross-link button。

---

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/repair-order-followups.ts` |
| 新增 | `src/domain/repair-order-followups.constants.ts`（case_kind / status / action_kind / outcome enum 字典） |
| 新增 | `src/lib/aftersales/followup-actions.ts`（server actions：rebook / recordManagerIntervention / sendLineReminder / closeNoResponse） |
| 新增 | `src/app/(workspace)/parts/aftersales/follow-ups/page.tsx`（server component） |
| 新增 | `src/app/(workspace)/parts/aftersales/follow-ups/_components/follow-ups-board.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/follow-ups/_components/case-card.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/follow-ups/_components/timeline-tab.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/follow-ups/_components/stats-tab.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/follow-ups/_components/manager-intervention-modal.tsx` |
| Migration | 建 `repair_order_followup_cases` + `repair_order_followup_actions` + 8 條 RLS（每表 4 條） |
| nav_nodes | 雙 brand 各 INSERT 一筆 |

---

## 8. Verification（落地完手測）

1. **與 04 的整合驗證**：在 04 頁面 reject 一個 safety_critical 的 addon → 自動產生 followup_case → 跑來本頁看是否出現在「🔴 安全等級」分組
2. **與 04 的雙向 FK 驗證**：`SELECT a.id, a.followup_case_id, c.source_addon_id FROM repair_order_addons a JOIN repair_order_followup_cases c ON c.source_addon_id = a.id` → 雙向對得上
3. **rebookFromFollowup 跨表事務**：car 主同意 → 點建立預約 → 確認 1) appointments 多一筆 2) case.status='rebooked' 3) actions 多一筆 'rebooked' system action，三者必須同時成立或同時失敗
4. **狀態機完整性**：open → manager_intervened → rebooked（happy path）+ open → long_term + open → closed_no_response 三條路徑都跑一次
5. **safety_level 分組視覺**：safety_critical 必走紅色卡 + 強制顯示「主管介入記錄」按鈕；normal 不顯示
6. **時間軸 next_action_at 排序**：看板按 next_action_at ASC 排，過期的（< now）置頂標紅
7. **整店統計加總**：本月失銷金額 = SUM(estimated_fee WHERE status NOT IN ('rebooked'))；已閉環回收 = SUM(estimated_fee WHERE status='rebooked'); recovery_rate = rebooked_count / total
8. **RLS 雙 brand 隔離**：用 ducati user session 查 → 看不到 indian 的 case；反之亦然
9. **jsonb metadata 機制**：把一筆 action 的 `metadata.call_duration_sec=180` 寫進去 → 詳情頁能讀出來
10. tsc --noEmit / eslint 0 errors
11. 手測：每個 tab 切換 / case 展開收合 / 主管介入 modal / 建立預約跳轉 / LINE 提醒按鈕

---

## 9. 開放問題（階段 3 拍板）

> ⚠️ **這頁的 Phase 3 應該跟 04 提案一起問**，因為兩者 schema 是綁定的。

### 9.1 schema 邊界（跟 04 連動）

- [ ] **denormalize 範圍**：`item_name` / `estimated_fee` / `safety_level` / `customer_id` / `vehicle_id` 都從 addon snapshot 過來，要不要全 denormalize 到 followup_cases？
  - **選 A 全 denormalize**（推薦）：看板 query 不用 join 5 張表、即使原 addon 後續被刪也能保留歷史失銷紀錄
  - **選 B 全部 ID + join**：schema 純淨，但看板每次 query 要 join 3 張表 + sa name + customer name
- [ ] **followup_actions 通路是否要 enum constraint**：`channel: phone | line | sms | onsite | system` — 要不要 DB 層 CHECK，還是純應用層約束？

### 9.2 副作用 [需確認]

- [ ] **rebookFromFollowup 推誰 LINE**：車主（預約確認）+ 原 SA + 主管？三者哪幾個？
- [ ] **recordManagerIntervention 推誰**：原 SA 一定要知道；主管自己呢（已執行不用通知）；原 RO 技師需要嗎？
- [ ] **closeNoResponse 是否要推主管**：失銷案件結案要不要讓主管知道，還是只進統計？
- [ ] **D+3 / D+10 過期是否要 cron push 提醒**：Phase 1 看板 sort 就好不主動 push？還是 Phase 1 就要每天 8AM 推「今天有 N 筆待提醒」摘要給 SA？
- [ ] **是否寫 audit_log**：每次狀態變更 / 主管介入 是否要另寫 audit_log 表（除了 followup_actions 之外）？— 還是 followup_actions 本身就是 audit log，不需要重複？

### 9.3 名稱 / 路徑

- [ ] 路徑 `/parts/aftersales/follow-ups` 可以嗎？還是要 `/parts/aftersales/addon-loop` / `/parts/aftersales/lost-sales`？
- [ ] `case_kind = 'manual_escalate'` 命名（04 的 escalateToFollowup 用的 kind）— 對嗎？還是要 `'manual'` / `'sa_escalated'`？
- [ ] `status = 'long_term'` 中文翻什麼（看板顯示用）：「長期追蹤」？「下次回廠提醒」？
- [ ] domain helper 檔名 `repair-order-followups.ts` vs `aftersales-followups.ts` vs `followup-cases.ts`？

### 9.4 權限邊界

- [ ] 哪些角色能 logFollowupAction：所有 SA 都能、還是只能改自己 assigned 的？
- [ ] 哪些角色能 recordManagerIntervention：限定 'service_manager' / 'store_manager' role？
- [ ] 哪些角色能 markLongTerm / closeNoResponse：限定主管？還是 SA 也行？
- [ ] 整店統計 tab 限定主管 / 直營店長以上？還是所有 SA 都能看？

### 9.5 與 10 預警告警的邊界（跨提案）

- [ ] HTML banner 有「→ 庫存缺料告警」按鈕，但庫存缺料告警是 10 提案的 `inventory_shortage_alerts`，**不是本頁的 followup_case**。Phase 3 要確認：兩者**完全不共表**（推薦）、還是合用一張 `alert_cases` 表用 kind 區分？
  - **選 A 完全不共表**（推薦）：本頁只管 addon 衍生的失銷追蹤；10 管庫存缺料；兩者語意不同（一個是客戶決策結果、一個是供應鏈狀態）
  - **選 B 合表**：跨域 alert 用同一張看板，schema 多一個 `alert_source` 欄位區分

---

## 10. Out of Scope (Phase 1)

- LINE / SMS / Email 實際發送（Phase 2 接 notification hub）
- D+3 / D+10 自動 cron push（Phase 2）
- LINE webhook 接讀回執（Phase 3）
- 預約確認後的回流追蹤（如果建了預約但客戶又放鴿子，case 自動 reopen？）— Phase 2 後做
- 整店統計 materialized view 優化（Phase 1 純 query 加總，量大時再優化）
- 跨店 / 跨 brand 主管儀表板（Phase 2）
- Top 5 失銷項目 = 已 group by item_name 的近似分群，未來要做「失銷類別 taxonomy」需要新表（Phase 2+）
- AI 預測哪些 case 可能轉回廠（Phase X，需要歷史資料訓練）
