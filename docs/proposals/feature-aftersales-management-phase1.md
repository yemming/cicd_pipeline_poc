# 提案：售後工單模組 — 售後管理（車間即時看板 + 系統設定）（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/07_售後管理模組_v2.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組目前只在 Ducati nav 樹下；Indian 視業務決定再補）
> 姊妹頁（同模組）：
> - `docs/proposals/feature-aftersales-overview-phase1.md`（00_導覽總覽 — 模組首頁 / sprint dashboard）
> - `docs/proposals/feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）
> - `docs/proposals/feature-aftersales-appointments-phase1.md`（01_預約管理看板 — 流程第 1 站、含淺版技師負載條）
> - `docs/proposals/feature-aftersales-ro-phase1.md`（02 RO 工單）
> - `docs/proposals/feature-aftersales-precheck-{ro,sa}-phase1.md`、`feature-aftersales-ro-lines-phase1.md`、`feature-aftersales-addons-phase1.md`、`feature-aftersales-addon-loop-phase1.md`、`feature-aftersales-final-check-phase1.md`

---

## 0. 頁面定位（最重要 — 釐清「售後管理模組」字面歧義）

⚠️ **字面歧義警告**：「售後管理模組」名稱聽起來像是 module overview / module landing（容易跟 `00_導覽總覽` 混淆），實際上**完全不是**。這頁有自己明確的業務 scope，是一個獨立的「**車間即時運營看板 + 售後部門系統設定中心**」二合一頁面。

### 拆 HTML 結構後的真面目

頁面用兩級導航切兩大區塊：

```
售後管理模組 (07)
├─ 一級：即時看板（live）           ← 車間運營 dashboard
│   ├─ 二級：🔧 工位看板（bay）       工位狀態 / 計時 / 使用率 / 周轉率
│   └─ 二級：👨‍🔧 派工看板（dispatch） 技師狀態 / NADA 三指標（效率/生產力/利用率）/ 手動派工
│
└─ 一級：⚙️ 系統設定（setting）     售後部門 master data + 規則
    ├─ Tab A：員工人員名冊            售後部門 employees + 職級權限對照表
    ├─ Tab B：工單編號設定            P1（業務類型）+ P2（付款性質）+ 流水號規則
    └─ Tab C：崗位折扣設定            各職級折扣上限 + 超限審批流
```

### 它是什麼 / 它不是什麼

| 維度 | 答案 |
|---|---|
| 是 module landing 嗎？ | ❌ 不是。Module landing 是 `00_導覽總覽`（模組 README + sprint dashboard）。 |
| 是技師排班嗎？ | ❌ 不是。沒有班表 / 請假 / 排休 概念，只有「今日狀態」（施工中/待命/休息）。 |
| 是車間負載看板嗎？ | ✅ **是的**（一半）。「工位看板」+「派工看板」就是車間負載即時 view（read-only dashboard）。 |
| 是售後 master-data 設定中心嗎？ | ✅ **也是的**（另一半）。員工名冊 / 工單編號規則 / 折扣權限 = 三張 master data setting page。 |
| 是 wizard / 多步驟單據？ | ❌ 不是。 |
| 是 list view + page view 的 CRUD 頁？ | 部分是（員工名冊 / 工單編號 P1 P2）；其他是 dashboard + form-style setting。 |

**性質歸類**：**dashboard + multi-tab setting hub**（雙性格頁面）。**部分套 design pattern（list view 那幾張）+ 部分客製（dashboard read-only view）**。

### 它跟 `00_導覽總覽` 的關係

| 維度 | 00_導覽總覽 | 07_售後管理（本頁） |
|---|---|---|
| 性質 | landing / README / sprint 進度 | 運營 dashboard + 設定中心 |
| 內容 | 9 張章節卡 + KPI scorecard + Day2/3/4 sprint 卡 + 待開發頁面清單 | 工位即時狀態 + 技師三指標 + 員工/編號/折扣設定 |
| 寫入？ | ❌ 純展示 | ✅ 設定 tab 有 CRUD（員工 / P1 P2 / 折扣率） |
| 在 sidebar 的位置 | 模組首頁（最上面） | 模組底部「管理 / 設定」群組（跟 11/12 設定頁同層） |
| 重疊度 | 0%（性質完全不同） | — |

### 它跟 `01_預約管理看板` 的關係

兩頁都有「技師負載」概念，但**作用 / 細節層級不同**：

| 維度 | 01_預約看板 | 07_派工看板（本頁） |
|---|---|---|
| 技師資料粒度 | 一條「今日工作負載」橫條（負載百分比） | **每位技師一張卡 + 3 個 NADA 指標 + 即時施工項目 + 一鍵派工 button** |
| 時間軸 | 全日（含未來時段） | **此時此刻**（即時，30 秒自動更新） |
| 入口動作 | 預約管理（建立預約） | 派工（指派 RO 給技師） |
| 工位概念 | ❌ 沒有 | ✅ **本頁獨有**（工位看板 8 個 bay） |
| 副作用 | 建預約 → 推 LINE | **派工** → 改 RO 狀態 / 啟動工位 timer / 推 LINE 給技師 |
| 適用對象 | SA 接待員、店長日常排程 | 車間主管、即時運營監控 |

⚠️ 技師資料雖然兩處都顯示，但 SSOT 應該都是 `employees` + 即時運算的 `service_bay_assignments` / `technician_clock` / `repair_order_items`。**不應該各做一張表 / 重複存資料**。

### 建議路由與落地型態

```
即時看板：
  /parts/aftersales/management/bays          ← 工位看板（read-only dashboard，30 秒自動更新）
  /parts/aftersales/management/dispatch      ← 派工看板（read-only dashboard + 派工 action）

系統設定（一律走 design pattern §List View）：
  /parts/aftersales/management/staff         ← 員工人員名冊（list + detail/edit + 職級權限對照表）
  /parts/aftersales/management/ro-numbering  ← 工單編號設定（P1 / P2 兩張 list + combo 預覽）
  /parts/aftersales/management/discounts     ← 崗位折扣設定（form-style setting + 審批流配置）
```

替代方案（兩種，等 Phase 3 拍板挑一個）：

| 方案 | 描述 | 優缺 |
|---|---|---|
| **A. 全部塞同一個 URL，用 tab 切** | `/parts/aftersales/management` 一個頁、`?tab=bays|dispatch|staff|numbering|discounts` 切 | 跟 HTML 原稿一致、tab 切換無 reload；但麵包屑 / 權限 / sidebar 高亮難做 |
| **B. 拆 5 個獨立路由（推薦）** | 上面列的 5 個路由各自一個頁，sidebar 在「售後管理」下展開 5 個子節點 | 跟 DealerOS 的 design pattern 一致、列表頁 + 詳情頁可標準化、權限可細分；HTML 原稿的「即時看板↔設定」一級切換用 sidebar group 取代 |
| **C. 兩個 URL（看板 1 個 + 設定 1 個）** | `/management/live`（內含 bay + dispatch tab）+ `/management/settings`（內含 3 個 setting tab） | 折衷；看板兩塊強相關放一起、設定三塊強相關放一起 |

**Phase 1 強烈推薦 B**（5 個獨立路由）：理由是 staff / ro-numbering / discounts 都是清楚的 master data list / setting page、走 design pattern 才能 reuse `<DataGrid>`、列表 + 詳情、column visibility、Excel 匯出全套機制；而 bays / dispatch 兩個 read-only dashboard 各自獨立路由也更乾淨（未來權限可分開、能直接 deep-link 給店長手機看板）。

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

本頁觸及的實體比想像中多，因為一頁含「即時看板（讀其他模組資料）+ 三張獨立 master data 設定」：

```
A. 工位（service_bays） ← 本頁新增 entity
   fields:
     - id uuid PK
     - brand_id text
     - code text                 (B1 / B2 ... 顯示用 + URL key)
     - name text                 (例「機電工位 1」)
     - bay_type text             (機電 / 電裝 / PDI / 多功能)  ← 候選 enum
     - purpose text              (「一般機電維修保養」)
     - is_active boolean         (offline = false)
     - sort_order int
     - metadata jsonb
     - created_at / updated_at
   relationships:
     - { to: organizations, kind: 'fk' }   # 屬於哪個門店 (level=2)，雙門店時必要
     - { to: subsidiaries,  kind: 'fk' }   # 法人歸屬

B. 工位指派（service_bay_assignments） ← 本頁新增 entity（橋接表）
   fields:
     - id uuid PK
     - brand_id text
     - bay_id uuid FK → service_bays
     - repair_order_id uuid FK → repair_orders (RO)
     - repair_order_item_id uuid FK → repair_order_items (細項)
     - technician_id uuid FK → employees
     - status text               (assigned / in_progress / urgent / done)
     - started_at timestamptz    (技師打卡開始時間，timer 計算起點)
     - completed_at timestamptz
     - metadata jsonb
   relationships:
     - { to: service_bays,       kind: 'fk' }
     - { to: repair_orders,      kind: 'fk' }
     - { to: repair_order_items, kind: 'fk' }
     - { to: employees,          kind: 'fk' }

C. 技師打卡 / 工時（technician_clock_logs） ← 本頁新增 entity
   fields:
     - id uuid PK
     - brand_id text
     - technician_id uuid FK → employees
     - bay_assignment_id uuid FK → service_bay_assignments
     - work_date date
     - clocked_in_at timestamptz
     - clocked_out_at timestamptz
     - status text               (working / break / idle / off)
     - actual_minutes int        (實際施工分鐘)
     - sold_minutes int          (銷售工時 = Σ LU × 6 分鐘，從 RO line 的 labor_units 累計)
     - available_minutes int     (可用工時 = shopDailyHours × 60，或打卡實際時段)
     - metadata jsonb

D. 員工（employees） ← 全站共用、不是本頁新增；但本頁是「售後部門員工」的維護入口
   fields:
     - id uuid PK
     - brand_id text
     - code text                 (SA001 / SA002...)
     - name text
     - grade text                (售後主管 / 售後接待 / 車間技師 / 零件主管 / 零件專員)
     - work_type text            (管理 / 接待 / 機電 / 電裝 / 備料)
     - department text           ('aftersales' 過濾用)
     - has_final_check_authority boolean   ← 「竣工複檢授權」 — 跟 06_竣工複檢 是同一個欄位
     - account_user_id uuid FK → auth.users  ← 「系統帳號」
     - is_active boolean
     - metadata jsonb
   ⚠️ 本表大概率全站共用（不只售後部門），階段 3 要確認是新建還是 reuse 既有 employees / users
   ⚠️ has_final_check_authority 跟 06 共用，必須是同一張表同一個欄位（不要在 06 / 07 各自做）

E. 職級權限對照（role_permissions / RBAC SSOT）
   ⚠️ 看 HTML 表格「職級權限對照表」（預檢/RO/竣工/增項看板/折扣/管理/即時看板 × 5 個職級的 ✅/❌ matrix）
   ⚠️ 這是 RBAC 而**不是 business_rules**（依 architecture.md §3 判斷三步：boolean「能/不能」→ RBAC）
   ⚠️ 必須對映到既有 `permissions` 表 + `role_permissions` 雙寫 / 走 `src/domain/rbac.ts` facade
   架構決策請看 architecture.md §3 + skill 紀律「不要把 boolean 授權塞 business_rules」

F. 工單編號規則（ro_number_prefix_rules） ← 本頁新增 entity；或丟 business_rules
   fields（如果獨立建表）:
     - id uuid PK
     - brand_id text
     - prefix_kind text          (p1 / p2)  ← 區分業務類型 vs 付款性質
     - code text                 (MN / RP / WC / AC / PD / OT / CP / WR / IN / FR)
     - name text                 (「定保 Maintenance」)
     - acct_category text        (income / claim / internal / gray) ← 只 P1 用
     - target_audience text      (「僅搭配 WC 使用」) ← 只 P2 用
     - description text
     - is_reserved boolean       (HTML 上「（預留自定義A）」)
     - sort_order int
     - is_active boolean
     - metadata jsonb
   ⚠️ 替代：走 business_rules + rule_kind='ro_number_prefix'，把上面欄位塞 config jsonb（單頁專用、不需 FK）。階段 3 拍板。
   ⚠️ 不論落哪、必須跟 02_正式工單RO 同一個 SSOT — RO 建立時取碼會 read 這個表

G. 工單編號流水序（ro_number_sequences） ← 派生 / 可選
   fields:
     - id uuid PK
     - brand_id text
     - prefix_combined text      ('MN-CP' / 'RP-CP'...)
     - work_date date
     - last_seq int              (每日歸零)
   ⚠️ 真要做防併發要 RPC + advisory_lock；POC 階段可用 supabase function 簡化、甚至先用 max(seq)+1 + retry-on-conflict

H. 崗位折扣規則（business_rules with rule_kind='aftersales_discount_authority'）
   設計：每職級一筆 row，config 內存:
   {
     "scope_grade": "售後接待",
     "max_total_discount_pct": 98,    // 全場最高折扣
     "max_goods_discount_pct": 95,    // 商品最高折扣
     "max_labor_discount_pct": 90,    // 人工費最高折扣
     "require_approval_when_exceeded": true,
     "approval_chain": ["售後主管", "店長"]
   }
   ⚠️ 走 business_rules 是 architecture.md §3 的判斷（量化值 → business_rules）
   ⚠️ 「審批流設定」（一級審批角色 / 二級審批角色 / 審批期限 / 逾期處理）→ 另一筆 rule_kind='aftersales_discount_approval_workflow' 的 config

I. 工位效率快照（bay_efficiency_snapshots） ← 派生 / 可選
   ⚠️ 「今日完成工單」「已用工時」「使用率」「周轉率」全是 aggregate
   POC：on-the-fly 用 SQL 算（不另建表）
   Phase B（量大時）：每天收盤前 snapshot 一次給歷史報表用

J. 技師人效快照（technician_efficiency_snapshots） ← 派生 / 可選，同上
   ⚠️ 「效率 Eff. / 生產力 Prod. / 利用率 Util.」（NADA 三指標）
       Efficiency  = sold_minutes / actual_minutes × 100%   目標 ≥ 125%
       Productivity = sold_minutes / available_minutes × 100%   目標 85-87.5%
       Utilization = actual_minutes / available_minutes × 100%  目標 ≥ 80%
   POC：read time 即時算（read technician_clock_logs + 當日 RO 完工項目）
```

### actions

```
工位看板（read-mostly）:
  listBays(filter)                                → Promise<Bay[]>
  getBayWithCurrentAssignment(bay_id)             → Promise<{ bay, assignment, technician, ro_summary }>
  computeBayKpis(date)                            → Promise<{ free, busy, urgent, offline, total_usage_rate, ... }>
  assignBay(bay_id, ro_item_id, technician_id)    → Promise<Result>  ← 派工
    [副作用：建 service_bay_assignments / 啟動 timer / 推 LINE / 改 RO line 狀態]
  startBayWork(assignment_id)                     → Promise<Result>  ← 開始打卡
  completeBayWork(assignment_id)                  → Promise<Result>  ← 完工交棒 → RO 推進到「等待竣工複檢」
    [副作用：寫 technician_clock_logs / 改 RO 狀態 / 連動 06_竣工複檢的 queue]
  setBayOffline(bay_id, reason)
  reopenBay(bay_id)
  upsertBay(input)                                ← 設定 tab 才會用（新增 / 編輯工位）
  updateShopDailyHours(hours)                     ← 「每日可用工時 8/9/10/12」設定

派工看板（read + dispatch）:
  listTechniciansToday(date)                      → Promise<TechWithStatus[]>
    （含 efficiency / productivity / utilization 三指標即時算）
  dispatchTo(technician_id, ro_item_id, bay_id?)  → Promise<Result>
    [副作用：建 assignment / 改 RO line / 推 LINE 給技師 / 啟 timer]
  setTechnicianBreak(technician_id) / setBack
  recomputeNadaKpis(date)                         → 通常在 listTechniciansToday 內部跑、不單獨呼叫

員工名冊（標準 CRUD）:
  listStaff(filter: { department, grade, is_active })
  getStaffById(id)
  addStaff(input)
  updateStaff(id, patch)
  toggleStaffFinalCheckAuth(id)                   ← 「竣工複檢授權」switch
    （HTML 規定「售後主管預設擁有竣工複檢授權，無法取消」→ helper 內部驗證、不是 UI 層）
  deactivateStaff(id) / reactivateStaff(id)
  ⚠️ 跟 06_竣工複檢 共用 has_final_check_authority 欄位、跟 RBAC role_permissions 共用「職級權限對照表」

工單編號設定（標準 CRUD）:
  listPrefixRules(kind: 'p1' | 'p2')
  upsertPrefixRule(input)
  reorderPrefixRules(kind, ordered_ids[])
  getCombinedExamples()                           ← 「常用組合範例」純展示、由 p1 × p2 笛卡兒積算
  getNextRoNumber(prefix_p1, prefix_p2, date)     ← RO 建立時取碼用（02_正式工單RO 會呼叫）
    [副作用：寫 ro_number_sequences、回傳 'MN-CP-260429-001']
  ⚠️ 跟 02_正式工單RO 共用同一份規則 SSOT

崗位折扣設定（business_rules CRUD via rules helper）:
  listRulesByKind('aftersales_discount_authority', filter)
  upsertRules(rules[])                            ← 一次寫所有職級（HTML 是 5 列同時編輯）
  getApprovalWorkflow()                           ← 取出 rule_kind='aftersales_discount_approval_workflow' 那筆
  upsertApprovalWorkflow(config)
  ⚠️ 「提交審批流設定」按鈕 → 是 workflow config 變更要送審批；POC 階段可先直存、Phase B 再做 approval-of-approval-rules

派工 / 結帳 / RO 完工的折扣檢查（call from 結帳 08 + RO line 03）:
  checkDiscountAuthority(grade, kind: 'total'|'goods'|'labor', pct) → { allowed, requires_approval, approval_chain }
    [從 business_rules 的 'aftersales_discount_authority' 配置算]
```

**[需確認] 副作用**（Phase 3 拍板）：

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `assignBay` / `dispatchTo` | 推 LINE 給技師 | [需確認] |
| `completeBayWork` | 把 RO line 狀態推到「等待竣工複檢」、觸發 06 queue | [強烈推薦做] |
| `completeBayWork` | 防竄改時間戳寫 audit log | [需確認] |
| `toggleStaffFinalCheckAuth` | 同步寫 06_竣工複檢用的 role_permissions / 推 LINE 給主管 | [需確認] |
| `upsertPrefixRule` | warn 已使用前綴不可改（HTML alert 寫的） | [強烈推薦做] |
| `upsertRules` (折扣) | 變更後需重新發審批流 / 推 LINE 給審批人 | [需確認] |
| 工位「逾時」狀態（120 分鐘 → urgent） | 自動推 LINE 給車間主管 | [需確認] |

### kpis（即時看板核心）

```
A. 工位看板 KPI（4 chip + 1 dropdown）:
   - 空閒 / 使用中 / 逾時警示 / 停用 個數
   - 每日可用工時：8h / 9h / 10h / 12h 下拉

B. 工位效率統計表（合計列必含）:
   - 工位使用率 = 已用工時 ÷ 每日可用工時 × 100%   目標 ≥ 80%
   - 工位周轉率 = 今日完成工單數 ÷ 工位數量
   - 全場合計：總已用 / 總可用 / 平均使用率 / 平均周轉率

C. 派工看板 KPI（3 chip）:
   - 施工中 / 待命 / 休息 人數

D. NADA 人效三指標（每位技師 + 全員合計）:
   - 效率 Efficiency   = sold ÷ actual × 100%   目標 ≥ 125%
   - 生產力 Productivity = sold ÷ available × 100%   目標 85-87.5%
   - 利用率 Utilization = actual ÷ available × 100%   目標 ≥ 80%
   - LU 換算公式：1 LU = 6 分鐘 → soldH = Σ LU / 10

E. 每位技師個人卡:
   - 今日工單 / 完成 / 進行中 / 銷售工時
   - 當前 RO + 當前項目（status==='working' 時顯示）
```

### implied_schema

```
service_bays                          (本頁主表 A)
service_bay_assignments               (本頁主表 B，橋接 bay × RO × technician)
technician_clock_logs                 (本頁主表 C)

employees                             (全站表 D；本頁是售後部門入口；可能既有 → 確認 / ALTER 加 has_final_check_authority + work_type)

ro_number_prefix_rules                (本頁主表 F；或丟 business_rules)
ro_number_sequences                   (本頁主表 G；POC 可後做)

business_rules + rule_kind='aftersales_discount_authority'
business_rules + rule_kind='aftersales_discount_approval_workflow'

bay_efficiency_snapshots              (Phase B；POC 階段 on-the-fly 不建表)
technician_efficiency_snapshots       (Phase B；POC 階段 on-the-fly 不建表)
```

雙 brand 必備：每張新表 `brand_id text` + 4 條 `user_has_brand()` RLS。

### implied_pages

```
kind: 'dashboard'
  route: /parts/aftersales/management/bays         （工位即時看板，read-only + assignBay action）
  route: /parts/aftersales/management/dispatch     （派工看板，read-only + dispatchTo action）

kind: 'list' + 'detail'（走 design pattern §List View / Page View）
  route: /parts/aftersales/management/staff         （員工人員名冊）
  route: /parts/aftersales/management/staff/[id]    （員工詳情 / 編輯 / 新增）
  route: /parts/aftersales/management/ro-numbering  （工單編號設定 — P1 + P2 兩個區、combo 預覽）
       ⚠️ 同頁兩個 list 段可以放在同一個 route + 上下兩張 DataGrid，不必拆 4 個路由
  route: /parts/aftersales/management/discounts     （崗位折扣 — form-style + 審批流設定）
       ⚠️ 不是典型 list/detail，是「5 列同時編輯」+「審批流 form」、走 setting page 客製
```

⚠️ **工位 settings**（新增工位 / 改 bay name / 改 purpose）建議直接掛在 `bays` 看板頁的「+ 新增工位」+ 點工位卡的 edit 動作（小型 modal），不需要獨立路由，跟 design pattern §Page View 規則略有不同（量太小）。

---

## 2. Schema 草案（先草、Phase 3 拍板）

雙 brand RLS 全套用 `user_has_brand()`，4 條 policy（select/insert/update/delete），不重複寫。

```sql
-- A. 工位主表
CREATE TABLE service_bays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  organization_id uuid REFERENCES organizations(id),   -- 屬於哪個 store (level=2)
  subsidiary_id uuid REFERENCES subsidiaries(id),
  code text NOT NULL,                                  -- 'B1' / 'B2' ...（URL key）
  name text NOT NULL,                                  -- '機電工位 1'
  bay_type text,                                       -- '機電' / '電裝' / 'PDI' / '多功能'
  purpose text,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (brand_id, organization_id, code)
);

-- B. 工位指派橋接表
CREATE TABLE service_bay_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  bay_id uuid REFERENCES service_bays(id),
  repair_order_id uuid,                                -- FK 補在 02 落地後
  repair_order_item_id uuid,                           -- FK 補在 03 落地後
  technician_id uuid REFERENCES employees(id),
  status text CHECK (status IN ('assigned','in_progress','urgent','done','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON service_bay_assignments (brand_id, bay_id, status);
CREATE INDEX ON service_bay_assignments (brand_id, technician_id, started_at);

-- C. 技師打卡 / 工時 logs
CREATE TABLE technician_clock_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  technician_id uuid REFERENCES employees(id),
  bay_assignment_id uuid REFERENCES service_bay_assignments(id),
  work_date date NOT NULL,
  clocked_in_at timestamptz,
  clocked_out_at timestamptz,
  status text CHECK (status IN ('working','break','idle','off')),
  actual_minutes int DEFAULT 0,
  sold_minutes int DEFAULT 0,
  available_minutes int DEFAULT 540,                   -- 預設 9h × 60
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX ON technician_clock_logs (brand_id, technician_id, work_date);

-- D. employees 表
--    ⚠️ 如果既有 → ALTER TABLE 加欄位（has_final_check_authority / work_type / department）
--    如果還沒有 → 新建（多模組共用，schema 設計要謹慎，可能要單獨拉一份 employees feature 提案）

-- F. RO 編號規則
CREATE TABLE ro_number_prefix_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  prefix_kind text CHECK (prefix_kind IN ('p1','p2')),
  code text NOT NULL,                                  -- 'MN' / 'CP' ...
  name text NOT NULL,
  acct_category text,                                  -- 'income' / 'claim' / 'internal' / 'gray'（只 P1 用）
  target_audience text,                                -- P2 專用
  description text,
  is_reserved boolean DEFAULT false,                   -- '（預留自定義A）'
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE (brand_id, prefix_kind, code)
);

-- G. RO 流水序（POC 階段可不建、簡單寫一個 supabase function 算）
CREATE TABLE ro_number_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  prefix_combined text NOT NULL,                       -- 'MN-CP'
  work_date date NOT NULL,
  last_seq int DEFAULT 0,
  UNIQUE (brand_id, prefix_combined, work_date)
);

-- H. 崗位折扣 → 一律走 business_rules，不另建表
INSERT INTO business_rules (brand_id, rule_kind, scope_role_code, config)
VALUES
  ('ducati', 'aftersales_discount_authority', 'aftersales_supervisor',
   '{"max_total_pct":95,"max_goods_pct":90,"max_labor_pct":85,"approval_chain":["店長"]}'::jsonb),
  -- ... 5 個職級 5 筆
  ('ducati', 'aftersales_discount_approval_workflow', null,
   '{"level1_approver":"售後主管","level2_approver":"店長","deadline":"當日內","timeout_action":"自動退回"}'::jsonb);
```

### 欄位分類（typed vs jsonb）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `service_bays.code / name / bay_type / is_active` | typed | UNIQUE / RLS / 報表 都會用 |
| `service_bays.purpose` | typed（也 OK jsonb） | 顯示用，但短文字 + 全表 row 都有 → typed 更乾淨；變動時再 promote / demote |
| `service_bay_assignments.started_at / completed_at` | typed | timer 計算根本、防竄改 |
| `service_bay_assignments.status` | typed + CHECK | 狀態機核心、不可丟 jsonb |
| `technician_clock_logs.actual_minutes / sold_minutes / available_minutes` | typed | 報表 / NADA 三指標 都會 SELECT |
| `ro_number_prefix_rules.acct_category` | typed | 報表會 group by income/claim/internal |
| 「組合範例」combos 資料 | **不存表** | 純 UI 衍生 → p1 × p2 笛卡兒積 + 預設標註欄（or jsonb metadata 標 'is_recommended_combo'） |
| 折扣規則所有欄位 | **business_rules.config jsonb** | 走 §3 規則類 SSOT |
| 「審批流」一級 / 二級 / 期限 / 逾期處理 | **business_rules.config jsonb** | 同上、單條 rule_kind |
| 工位看板 UI 偏好（每日可用工時下拉） | typed（落 store-level setting） | 店長設定值、不是個人偏好 |

---

## 3. Domain Helper 規劃

```
src/domain/aftersales-management.ts     ← 工位 / 派工 / 看板 / 技師打卡
   listBays / getBayWithAssignment / assignBay / startBayWork / completeBayWork
   setBayOffline / reopenBay / upsertBay
   listTechniciansToday / dispatchTo / setTechnicianBreak / recomputeNadaKpis
   computeBayKpis / computeTechnicianKpis

src/domain/aftersales-staff.ts           ← 售後部門員工
   listStaff / getStaffById / addStaff / updateStaff
   toggleStaffFinalCheckAuth / deactivateStaff / reactivateStaff
   ⚠️ 如果 employees 是全站表 / 是 src/domain/employees.ts 的職責 → 改放共用 helper、本檔只做 「filter by department='aftersales'」薄包裝

src/domain/aftersales-numbering.ts       ← RO 編號規則 + 取號
   listPrefixRules / upsertPrefixRule / reorderPrefixRules
   getCombinedExamples / getNextRoNumber
   ⚠️ getNextRoNumber 02_正式工單RO 會 import 過去用

src/domain/aftersales-discounts.ts       ← 走 business_rules（內部 import rules.ts）
   listDiscountAuthorities / upsertDiscountAuthority(rule_per_grade)
   getApprovalWorkflow / upsertApprovalWorkflow
   checkDiscountAuthority(grade, kind, pct) → {allowed, requires_approval, chain}
   ⚠️ 結帳 08 + RO line 03 會 import 過去用
```

每個函式內部實作策略（Day 1 預設）：**supabase 直連**（小寫表單）；`assignBay` / `completeBayWork` / `dispatchTo` 因為跨多表 + 副作用，**Day 1 就走 RPC / server action**（不要先用直連 client-side 寫多表、會 race condition）。

---

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `assignBay` / `dispatchTo` | 寫 service_bay_assignments、改 RO line 狀態為 in_progress、啟動 bay timer | [強烈推薦] |
| `assignBay` / `dispatchTo` | 推 LINE 給技師「你被指派了 RO XXX」 | [需確認] |
| `completeBayWork` | 寫 technician_clock_logs、改 RO line 狀態到「等待竣工複檢」、進 06 queue | [強烈推薦] |
| `completeBayWork` | 防竄改時間戳 audit log（HTML 字面寫「打卡時間防竄改」） | [需確認 — 推薦做] |
| `toggleStaffFinalCheckAuth` | 同步寫 role_permissions（RBAC SSOT）；推 LINE 給主管 | [需確認] |
| `upsertPrefixRule` | 已被使用的前綴禁止改（HTML alert 警告） | [強烈推薦做 — 在 helper 內擋] |
| `upsertDiscountAuthority` | 「提交審批流設定」字面提示 → 需上層審批 / POC 階段先直存 | [需確認 / Phase 3 拍板] |
| 工位 120 分鐘 → urgent 狀態自動切換 | 推 LINE 給車間主管「B2 工位逾時 142 分」 | [需確認] |
| `setBayOffline` | 把當前 assignment 退回派工池、推 LINE 給技師重派 | [需確認] |

---

## 5. 頁面骨架（推薦方案 B：5 個獨立路由）

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 工位即時看板 | `/parts/aftersales/management/bays` | **客製 Dashboard**（不套 design pattern） | 自刻：KPI bar + bay grid + effi table + bayClick modal（打卡 timer） |
| 派工看板 | `/parts/aftersales/management/dispatch` | **客製 Dashboard** | 自刻：KPI bar + NADA 公式列 + tech grid + effi table |
| 員工名冊 | `/parts/aftersales/management/staff` | List View | `parts/setup/items/_components/items-board.tsx` |
| 員工詳情 / 編輯 / 新增 | `/parts/aftersales/management/staff/[id]` / `/new` | Page View | `parts/setup/items/[id]/_components/item-detail-view.tsx` |
| 工單編號設定 | `/parts/aftersales/management/ro-numbering` | **客製多 List**（P1 + P2 兩張 DataGrid + combo 預覽 + 即時預覽 bar） | 半客製：兩張 DataGrid + 上方 preview bar + 下方 combo card |
| 崗位折扣設定 | `/parts/aftersales/management/discounts` | **Setting Page**（form-style + workflow form） | 自刻：5 列 inline edit + 審批流 2×2 select form |

⚠️ **客製頁面也要套 §UX 互動規範**：所有寫入按鈕（派工 / 完工 / 提交審批流）pending 時 disabled + 文字換進行式 + 半透明。

---

## 6. nav_nodes（雙 brand）— Phase 4 才動，Phase 1 只是規劃

```sql
-- 售後管理屬於「售後工單模組」的最末群組（管理 / 設定）
-- parent 預期是 nav_nodes 裡「售後工單模組」level=2 的節點 → 在它下面新增 level=3 子群組「售後管理」
-- 雙 brand 各 INSERT 1 個群組節點 + 5 個子節點 = 12 筆

-- 群組節點（level=3）
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, page_kind, is_active)
VALUES
  ('ducati', '<aftersales-parent>', 3, 100, '售後管理', 'settings_suggest', 'group', true),
  ('indian', '<aftersales-parent>', 3, 100, '售後管理', 'settings_suggest', 'group', true);

-- 5 個葉節點（level=4，page_kind='react_route'）
-- ducati 跟 indian 各 5 筆，sort_order: 10/20/30/40/50
--   工位看板        bay_chart icon         /parts/aftersales/management/bays
--   派工看板        person_pin_circle      /parts/aftersales/management/dispatch
--   員工名冊        badge                  /parts/aftersales/management/staff
--   工單編號設定    tag                    /parts/aftersales/management/ro-numbering
--   崗位折扣設定    percent                /parts/aftersales/management/discounts
```

⚠️ Indian brand 是否要做：依 memory「WMS 範圍 — Ducati 不做」推論，**售後模組可能也只在 Ducati**。Phase 3 拍板。

---

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/aftersales-management.ts` |
| 新增 | `src/domain/aftersales-staff.ts`（或 reuse 既有 employees helper） |
| 新增 | `src/domain/aftersales-numbering.ts` |
| 新增 | `src/domain/aftersales-discounts.ts` |
| 新增 | `src/app/(workspace)/parts/aftersales/management/bays/page.tsx` + `_components/bays-dashboard.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/management/dispatch/page.tsx` + `_components/dispatch-dashboard.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/management/staff/{page.tsx, [id]/page.tsx, new/page.tsx, _components/staff-board.tsx, [id]/_components/staff-detail-view.tsx}` |
| 新增 | `src/app/(workspace)/parts/aftersales/management/ro-numbering/{page.tsx, _components/numbering-board.tsx}` |
| 新增 | `src/app/(workspace)/parts/aftersales/management/discounts/{page.tsx, _components/discounts-setting.tsx}` |
| 確認 / ALTER | `employees` 表（看是否既有、補 `has_final_check_authority` / `work_type` / `department` 欄位） |
| 共用：跟 02 連接 | `src/domain/repair-orders.ts`（建 RO 時 import getNextRoNumber） |
| 共用：跟 03 連接 | RO line 完工 → call `completeBayWork` |
| 共用：跟 06 連接 | 完工 → push 進「等待竣工複檢」queue |
| 共用：跟 08 連接 | 結帳折扣 → call `checkDiscountAuthority` |

---

## 8. Verification（落地完手測 — Phase 5 用）

1. **工位看板 SSOT 驗證**：在 02_正式工單RO 建立一張 RO、派工到 B2 → 工位看板的 B2 從 free 變 busy + timer 啟動 + 技師頭像出現 → 過 120 分鐘 timer 仍跑 → 卡片變 urgent（紅色）
2. **派工看板跨模組共讀**：同上 → 派工看板上「陳建明」的「當前 RO」要顯示這張新建的 RO 編號 + 「進行中」+1
3. **NADA 三指標即時算**：技師打卡 8h、做 sold 9.5h / actual 7.2h → Eff=132% Prod=119% Util=90%（公式驗證）
4. **完工 → 06 串接**：在工位看板點完工交棒 → RO 狀態到「等待竣工複檢」→ 06_竣工複檢看板出現這張 RO
5. **員工名冊 final-check 授權 ↔ 06**：toggle 一個技師的「竣工複檢授權」on → 06_竣工複檢的簽核人下拉多了這個技師
6. **工單編號 ↔ 02 串接**：在工單編號設定加一筆 P1 'XX'、回 02_正式工單RO 建單時下拉應出現 'XX'
7. **折扣審批 ↔ 08 串接**：在折扣設定把 SA 全場上限改 90% → 08_結帳收款時 SA 試圖打 88 折 → 不擋；打 85 折 → 需審批彈窗、審批人 = 「售後主管」
8. **business_rules 統一**：用 SQL 確認 `aftersales_discount_authority` / `aftersales_discount_approval_workflow` 都在 business_rules 表（不在新表）
9. **雙 brand RLS**：Ducati 帳號看不到 Indian 的 bay / staff / discount rule
10. **jsonb metadata 升降級**：先建 `service_bays.metadata.color_theme = 'navy'` 純顯示、確認 list / detail 都能讀；之後若 3 頁以上用 → 一條 ALTER promote 成 typed column
11. `npx tsc --noEmit` / `npx eslint <touched>` 0 errors
12. 手測：bay grid 點擊 → 看 modal + timer；派工看板「指派工單」按鈕 → 走 pending → 成功 banner；員工 list 三段（filter / inline create / detail edit）；P1 P2 兩張表 CRUD；折扣 5 列 inline edit + 審批流 submit pending UI

---

## 9. 開放問題（Phase 3 拍板）

- [ ] **路由結構**：選方案 A（單頁多 tab）/ B（5 個獨立路由 — 推薦）/ C（看板 1 + 設定 1）？
- [ ] **employees 表處理**：是新建還是 reuse 既有？如果 reuse 既有，本頁是否變成「filter by department='aftersales' 的薄包裝」？
- [ ] **`has_final_check_authority` 與 RBAC 的關係**：放 employees 表 typed column / 還是放 role_permissions SSOT / 還是兩處同步雙寫（依 architecture.md §3，這是 boolean 授權 → 應該走 RBAC，但 06 已假設它是 employees 上的欄位）？
- [ ] **工單編號規則 SSOT**：獨立建表 `ro_number_prefix_rules` 還是塞 `business_rules` + rule_kind='ro_number_prefix'？
- [ ] **派工 / 完工副作用**：是否推 LINE 給技師、是否寫 audit log、120 分鐘 urgent 是否推 LINE 給主管？
- [ ] **「即時看板每 30 秒自動更新」**：用 supabase realtime subscribe 還是 client polling？POC 階段建議 polling、Phase B realtime
- [ ] **NADA KPI**：on-the-fly 算 / 還是每天 snapshot？POC 推薦 on-the-fly
- [ ] **Indian brand 是否同步建**：售後模組是 Ducati only 還是雙 brand？（依現有姊妹頁慣例似乎只做 Ducati）
- [ ] **折扣審批流變更要不要先審批**：HTML 字面「提交審批流設定」暗示要、POC 階段是否簡化先直存？
- [ ] **「每日可用工時」屬於 store-level setting 還是 brand-level**：8/9/10/12 下拉值寫哪裡（會影響日報 KPI 分母）？
- [ ] **工位 settings 是否獨立路由**：建議掛在 `/management/bays` 看板裡的 modal、不另開路由 — 拍板 OK？
- [ ] **`LU` 制度**：銷售工時換算 1 LU = 6 分鐘是 NADA 標準、需要在 RO line 03 補 `labor_units` 欄位才算得出 sold_minutes — 跟 03 連動點確認
