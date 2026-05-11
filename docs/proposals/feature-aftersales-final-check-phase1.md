# 提案：售後 — 06 竣工複檢（Final Check / QC）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/06_竣工複檢_v1.html`
> 日期：2026-05-11
> 階段：Phase 1 結構分析（待 Phase 2 架構提案 / Phase 3 拍板）
>
> 姊妹分析：
> - `feature-aftersales-overview-phase1.md`（00_導覽總覽）
> - `feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）
> - `feature-aftersales-appointments-phase1.md`（01_預約管理看板）
> - `feature-aftersales-precheck-sa-phase1.md` — **PI 主表 `pre_inspections` schema 主場**
> - `feature-aftersales-precheck-ro-phase1.md` — **PI → RO transfer 契約**
> - `feature-aftersales-ro-phase1.md` — **RO 主表 `repair_orders` schema 主場**
> - `feature-aftersales-ro-lines-phase1.md` — **`repair_order_labor_items` / `repair_order_part_items` schema**（本頁讀工項 status）
> - `feature-aftersales-addons-phase1.md`（04_追加項目）
> - `feature-aftersales-addon-loop-phase1.md`（05_增項閉環）
>
> **本頁的位置**：售後 pipeline 倒數第二關。所有工項 / 零件落定後、結帳之前的最後品檢閘門。閘門通過 → RO `status='待結帳'` + 觸發取車通知 → 客戶來店 → 08 結帳收款。

---

## 0. TL;DR — 跟 04 預檢單共表 vs 拆表？

**結論建議：拆表 `final_inspections`，不跟 04 共用 `pre_inspections`。但 schema 形狀（主表 + 子表 + 簽名 + status）跟 04 對稱、明顯是「同一家族」**。

→ 本頁主張新建 4 張表：
- `final_inspections`（主檔，類似 `pre_inspections` 的對稱物）
- `final_inspection_line_checks`（逐項複檢，FK → ro_lines / labor_items / part_items）
- `final_inspection_test_drive_checks`（試車檢查項）
- `final_inspection_clean_checks`（清潔檢查項）

理由詳見 §6。重點：
1. **業務語意完全不同**：04 是「車剛進廠、要不要修、修什麼」；06 是「修完了沒、品質 OK 嗎」。共用 `phase` 只是把兩個 entity 硬塞同表、欄位 NULL 率會爆。
2. **欄位重疊率 < 15%**：扣掉 brand_id / store_id / customer_id / vehicle_id / 簽名這些「任何單據都有」的共通欄，剩下幾乎沒有重疊。
3. **生命週期 & FK 上游不同**：PI 上游是 `appointments`，可能取消、不一定有 RO；FI 強上游是 `repair_orders`，沒 RO 就沒 FI、且 RO 必須已「維修完成」才能開 FI。
4. **跟 RO 的閘門關係不對稱**：PI 是 RO 的「父」（PI confirm → 建 RO）；FI 是 RO 的「子 / 閘門」（RO 工項 done → 開 FI；FI fail → RO 退回維修中；FI pass → RO 待結帳）。

**但 design language 對稱**：兩頁都是「5 個 step / 主表 + 子檢查 + 簽名 + status 機」，可在 `src/domain/inspections.ts` 共用工具函式（status helper / signature 處理 / step progress 計算），typescript 層面用 `BaseInspection<T>` interface 對齊。

---

## 1. 結構摘要（entities / actions / kpis / implied_pages）

### entities

```yaml
- FinalInspection（複檢主檔，對稱 PreInspection）
  fields:
    - id uuid PK
    - brand_id text
    - subsidiary_id uuid FK → subsidiaries
    - store_id uuid FK → organizations
    - fi_code text                    # FI-YYMMDD-NNN（business key、給技師查單用）
    - issue_date date
    - sequence_no int
    - repair_order_id uuid FK → repair_orders (NOT NULL, UNIQUE)  # 一張 RO 一張 FI（會不會多次重開？見 [需確認] Q1）
    - inspector_id uuid FK → employees                # 複檢員（陳建明）
    - inspector_role_snapshot text                    # 「資深技師」職級快照（簽核當下，給授權審核留 audit）
    - mileage_in int                  # 進廠里程（從 RO 帶）
    - mileage_after_test_drive int    # 試車後里程（人工輸入）
    - test_distance int               # 計算欄（after - in）
    - test_drive_started_at timestamptz
    - test_drive_route text           # 「廠區周邊」
    - test_drive_technician_id uuid FK → employees
    - test_drive_note text
    - clean_personal_items_note text  # 「客戶個人物品確認」
    - final_conclusion_note text      # 「複檢結論備註（選填）」
    - status text NOT NULL DEFAULT 'in_progress'  # in_progress / pending_signature / signed / rework / completed / cancelled
    - has_failure boolean             # 任一 line_check failed → 觸發退回維修中
    - rework_count int DEFAULT 0      # 退回幾次（同一張 FI 可能 fail 退回後再做）
    - inspector_signature_url text    # 複檢員電子簽名
    - signed_at timestamptz
    - signature_proof jsonb           # 防竄改時間戳 / hash / 設備 fingerprint
    - next_service_mileage int        # 下次保養里程提示
    - next_service_date date          # 下次保養日期提示
    - next_service_items text         # 建議保養項目
    - sa_handover_note text           # SA 交車說明備註
    - notify_methods_used jsonb       # { line: {sent_at, delivery_id}, sms: {...}, call: {...} } — 哪幾種通知都發了
    - metadata jsonb DEFAULT '{}'
    - created_by uuid, created_at timestamptz, updated_at timestamptz

- FinalInspectionLineCheck（逐項複檢：對應 RO 工項，1m）
  fields:
    - id uuid PK
    - final_inspection_id uuid FK
    - source_kind text                # 'labor' | 'part'（複檢對的是 labor_item 還是 part_item）
    - source_labor_item_id uuid FK → repair_order_labor_items (nullable)
    - source_part_item_id  uuid FK → repair_order_part_items  (nullable)
    - section_code text               # 'engine' / 'brake' / 'elec' / 'general'（demo 顯示用的分組）
    - label text                      # 從 ro_line 帶過來的快照「引擎機油更換（Motul 5W-40）」
    - check_note text                 # 「規格符合原廠要求」/「更換後厚度 8mm，正常」
    - state text                      # 'none' / 'ok' / 'fail'
    - fail_reason text                # state=fail 時的補充描述
    - rework_assigned_to uuid FK → employees   # 退回給哪位技師重修
    - rework_at timestamptz                    # 退回時間
    - checked_at timestamptz
    - sort_order int

- FinalInspectionTestDriveCheck（試車項目，1m）
  fields:
    - id uuid PK
    - final_inspection_id uuid FK
    - check_code text                 # 't1' / 't2' / 't3' / 't4' / 't5'（種類固定 5 種）
    - label_snapshot text             # 「引擎啟動順暢，無異音」（快照）
    - state text                      # 'none' / 'ok' / 'fail'
    - note text
    - sort_order int

- FinalInspectionCleanCheck（清潔項目，1m）
  fields:
    - id uuid PK
    - final_inspection_id uuid FK
    - check_code text                 # 'c1' / 'c2' / 'c3' / 'c4' / 'c5'
    - label_snapshot text             # 「車身清潔（擦拭/無殘留油漬）」
    - state text                      # 'none' / 'ok' / 'fail'
    - note text
    - sort_order int

  relationships:
    - { to: repair_orders,             kind: 'fk' }       # 上游主鍵（強約束）
    - { to: pre_inspections,           kind: 'transitive' } # 透過 ro.pre_inspection_id 反查 PI，本表不直接 FK
    - { to: employees,                 kind: 'fk' }       # inspector_id / test_drive_technician_id / rework_assigned_to
    - { to: repair_order_labor_items,  kind: '1m via line_checks' }  # 逐項複檢的對應 source
    - { to: repair_order_part_items,   kind: '1m via line_checks' }
    - { to: customers,                 kind: 'transitive via ro' }   # 推取車通知用
    - { to: business_rules,            kind: 'rule_kind=final_check_authority' }  # 哪些職級可以簽核
    - { to: notifications_hub,         kind: 'event dispatch' }      # vehicle_pickup_ready 事件
```

### actions

```yaml
- listFinalInspections(filter)                  # 工單查詢 / 結帳前 list
- getFinalInspectionByRoId(ro_id)               # RO 詳情頁讀 FI 段
- createFinalInspection(ro_id)                  # Step 1 開始：seed 主檔 + lazy seed line_checks（從 ro_lines 拉）+ seed 5 試車項 + 5 清潔項
- setLineCheckState(line_check_id, state, fail_reason?)
- setTestDriveCheck(check_id, state, note?)
- setCleanCheck(check_id, state, note?)
- updateTestDriveMeta(fi_id, { mileage_after, route, started_at, technician_id, note })
- updateCleanPersonalItems(fi_id, note)
- sendBackToRework(fi_id, items[], note)        # 退回技師重修：建 rework 任務、標 line_check.rework_*、UPDATE ro.status='維修中'
- signFinalInspection(fi_id, signature_data)    # 電子簽名 + 防竄改時間戳
- updateNextServiceHints(fi_id, { mileage, date, items, sa_note })
- sendPickupNotification(fi_id, method)         # method ∈ {'line','sms','call'}；落 notify_methods_used + dispatch notification hub
- completeFinalInspection(fi_id)                # 全部簽核完 → UPDATE ro.status='待結帳'、closed_at 暫不寫（結帳那邊寫）
- reopenFinalInspection(fi_id, reason)          # 從 completed 退回 in_progress（極少數情況）

  suspected_side_effects:
    - createFinalInspection 必須驗證 ro.status IN ('維修中', '進行中') AND 所有 labor_items.status='done'（除非 [需確認] Q3 放寬）
    - sendBackToRework 改 ro.status → '維修中'、ro_line.status 不動但 fi.has_failure=true 鎖死簽核 button
    - signFinalInspection 必須通過 business_rules (rule_kind='final_check_authority') 的職級檢查（「資深技師」/「售後主管」才能簽）
    - sendPickupNotification:
        - Line：notifications.dispatch({ code: 'vehicle_pickup_ready', payload: { customer_id, ro_code, fi_code, items, amount } })
        - SMS：同上但 channel='sms'
        - Call：純記錄，不真打電話（人工執行）
    - completeFinalInspection → 副作用「UPDATE ro.status='待結帳'」是核心 transition
```

### kpis

```yaml
- 今日完成複檢數
  source: count(final_inspections WHERE issue_date=today AND status='completed')

- 待複檢 RO 數
  source: count(repair_orders WHERE status IN ('維修中','進行中') AND all(labor_items.status='done') AND NOT EXISTS fi)

- 複檢退修率
  source: count(final_inspections WHERE rework_count > 0) / count(final_inspections WHERE status IN ('completed','signed'))
        # 「品質回退率」是維修廠重要 KPI、跟技師 KPI 綁

- 平均試車距離
  source: avg(final_inspections.test_distance) GROUP BY brand_id, store_id, week

- 取車通知發送統計
  source:
    - line_sent = count(* WHERE notify_methods_used ? 'line')
    - sms_sent  = count(* WHERE notify_methods_used ? 'sms')
    - call_only = count(* WHERE notify_methods_used = '["call"]'::jsonb)

- 複檢 → 取車通知 SLA
  source: avg(notify_methods_used.line.sent_at - signed_at)   # 通常應該 < 30 分鐘
```

### implied_pages

```yaml
- kind: 'detail'                       # 主操作頁，非 list（FI 永遠從 RO 進來）
  route: '/parts/aftersales/repair-orders/[id]/final-check'
  comment: |
    - 5-step wizard（維修項目複檢 → 試車 → 清潔 → 簽核 → 取車通知）
    - 對稱 04 預檢單的 5-tab，但本頁是線性 wizard、步驟需依序推進
    - 「下一步」鈕在 step 4 卡住直到簽名完成（demo 行為）

- kind: 'list'                          # 次要列表（給技師日報 / 主管巡視）
  route: '/parts/aftersales/final-checks'
  comment: |
    - 列當日 / 本週所有 FI
    - 篩選：status / 複檢員 / 退修次數 > 0 / 試車距離異常
    - 主要 columns：fi_code / ro_code / 車主 / 複檢員 / 退修次數 / status chip / 簽核時間
    - 點 row → 跳 RO 詳情 final-check tab（不是獨立詳情頁）

- kind: 'setting'                       # 配套設定（複檢項目模板 / 簽核權限）
  route: '/parts/setup/final-check-templates'  OR  business_rules 內
  comment: |
    - 試車 5 項 / 清潔 5 項 是「全 demo 共用、可被店長改」的 template
    - 走 business_rules (rule_kind='final_check_template')
    - 簽核授權職級走 business_rules (rule_kind='final_check_authority')
```

---

## 2. 跟 04 預檢單共表 vs 拆表 — 完整評估

> 用戶要求專門評估這條。下面三段我把利弊講透，給用戶 Phase 3 做決定。

### 2.1 共表方案 — 把 `pre_inspections` 改成 `inspections`、加 `phase` 欄位

**做法**：

```sql
ALTER TABLE pre_inspections RENAME TO inspections;
ALTER TABLE inspections ADD COLUMN phase text NOT NULL DEFAULT 'precheck';
-- phase IN ('precheck', 'final_check')

-- 04 預檢的 row：phase='precheck'
-- 06 複檢的 row：phase='final_check'
```

子表也同樣方式：`inspection_line_checks` / `inspection_test_drive_checks`（precheck 不會用）/ `inspection_clean_checks`（precheck 不會用）/ 既有 5 張 PI 子表（final_check 不會用）。

**優點**：
- DRY、status 機 / 簽名邏輯 / step progress 一份 code
- `src/domain/inspections.ts` 一支 facade 帶完整個家族
- 「同店一天有幾張單在流動」一次 query 撈完
- 共用 RLS / 共用 audit / 共用 sequence_no 邏輯

**缺點 — 為什麼最終不推薦**：

1. **欄位 NULL 率爆炸**：
   - PI 專用欄（precheck 時必填、final_check 時永遠 NULL）：`appointment_id` / `purposes` / `customer_complaint` / `env_check_note` / `warranty_snapshot` / `estimated_*` 4 欄 / `lu_rate` / `customer_signature_url` / `customer_signature_proof_url` / `linked_ro_id`（共 13+ 欄）
   - FI 專用欄（final_check 時必填、precheck 時永遠 NULL）：`repair_order_id` / `mileage_after_test_drive` / `test_distance` / `test_drive_*` 4 欄 / `clean_personal_items_note` / `inspector_signature_url` / `rework_count` / `has_failure` / `next_service_*` 3 欄 / `sa_handover_note` / `notify_methods_used`（共 14+ 欄）
   - **共通欄只有 ~10 個**（brand_id / subsidiary_id / store_id / code / issue_date / sequence_no / customer_id / vehicle_id / inspector_id / status / metadata / timestamps）— 重疊率約 10/37 = **27%**
   - 27% 重疊用 phase + NULL columns 強塞 → 表「形狀失焦」、報表 query 必加 `WHERE phase=...`、IDE auto-complete 全是雜訊

2. **status 機混在一起 → 容易誤改**：
   - PI: `draft / in_progress / pending_signature / confirmed / cancelled`
   - FI: `in_progress / pending_signature / signed / rework / completed / cancelled`
   - 共用 `status` 欄位、12 個狀態（去重後）、實際上是兩個獨立狀態機。`status='confirmed'` 只對 PI 有意義、`status='rework'` 只對 FI 有意義。CHECK constraint 寫成 `(phase='precheck' AND status IN (...)) OR (phase='final_check' AND status IN (...))` — 越寫越長。

3. **子表的 phase 污染更慘**：
   - `inspection_line_checks` 只有 FI 用；`inspection_quote_items` 只有 PI 用。要在 join 處處 filter。
   - 或者真的拆 4 張子表（PI 用 5 張 + FI 用 3 張），但主表共用 → 子表跟主表的 phase 一致性靠應用層保證、容易出 bug。

4. **未來擴張不對稱**：
   - 14 取車後追蹤、入廠後再次環檢… 都各有獨立形狀，每次都要 ALTER TABLE inspections ADD COLUMN + 把整表 NULL 率推更高
   - 「同一張表存所有 inspection 變體」是 NetSuite EAV 風格反例，spec-to-feature `field-classification.md` §反例那條就是在講這個

5. **業務語意上 PI 跟 FI 真的不是同一回事**：
   - PI = 「車剛進廠、要不要修、修什麼、要多少錢」— 結束於「PI confirmed 並產 RO」
   - FI = 「修完了沒、品質 OK 嗎、可不可以交車」— 結束於「FI completed 並轉待結帳」
   - 兩者中間隔了整個 RO 維修週期（可能幾天）；不是「同一單據兩個階段」、是「兩個獨立單據」

### 2.2 拆表方案（推薦） — 新建 `final_inspections` + 3 張子表

**做法**：

- 新建 4 張表（主 + line_checks + test_drive_checks + clean_checks）
- schema 形狀「對稱」PI，但欄位獨立、status 獨立、FK 上游獨立
- TypeScript 層用 `BaseInspection` interface 對齊共通欄；`src/domain/final-inspections.ts` 跟 `src/domain/pre-inspections.ts` 並列、共享 utils（`src/lib/inspections/shared.ts`：簽名處理 / step 進度 / sequence_no helper / RLS 樣板）

**優點**：
- 每張表 NULL 率低、形狀緊湊
- status 機獨立、CHECK constraint 簡單
- 報表 query 不用每次 filter phase
- 兩個 entity 各自演化、不互相牽絆
- 跟既有的 `pre_inspections` 一致風格、未來看 schema 一目了然

**缺點**：
- 共通 helper 要自己抽（但 ~50 行、不是負擔）
- 「同店一天所有 inspection」要 UNION ALL 兩張表
- DDL 複本（但本來就有 5 張子表了、再多 3 張不算誇張）

### 2.3 第三方案 — 共用主表「inspections」、拆子表

折衷做法：主表共用、子表獨立（pre_inspection_* / final_inspection_*）。

**評估**：解決了「子表 phase 污染」，但 §2.1 §1.〜§4. 的缺點全部都還在。半套不徹底、不推薦。

### 2.4 推薦

→ **§2.2 拆表方案**。Phase 3 用戶可以否決。

---

## 3. 跟 RO 的閘門關係（重點，用戶特別要求）

### 3.1 開單前置條件（createFinalInspection 的閘門）

| 條件 | 強度 | 訊息 |
|---|---|---|
| `repair_orders.status IN ('進行中', '維修中')` | 強 | 「RO 必須在進行中或維修中狀態才能開複檢」 |
| 所有 `repair_order_labor_items.status='done'` | 強（demo 預設） | 「尚有 N 個工項未完成，不能進入複檢」 |
| 所有 `repair_order_part_items.issue_status IN ('issued', 'partial')`（不允許 'pending' / 'missing'） | 中 | 「尚有零件未領料完成，請先處理」（[需確認] Q3：嚴格 / 放寬） |
| 該 RO 沒有 active FI（status NOT IN ('cancelled')）| 強 | 「本工單已有進行中的複檢單 FI-XXXX」 |
| 簽核時：複檢員職級在 `business_rules (rule_kind='final_check_authority').config.allowed_role_codes` 內 | 強 | 「您的職級未獲授權執行竣工複檢簽核」（demo 第 4 步 auth-fail block） |

### 3.2 RO `status` 切換（FI 是 RO 的驅動方）

```
RO 開單後：              status = '進行中' / '維修中'
       │
       │ 所有 labor_items.status='done'
       ▼
[FI 開單閘門 createFinalInspection]
       │
       ▼
FI step 1-3：            ro.status 不變
       │
       │ FI 任一 line_check.state='fail' → sendBackToRework
       ▼
RO.status = '維修中'   ← FI.has_failure=true、FI lock 在 step 1
RO.status_history += { from, to, reason: 'fi_rework', by, at }
       │
       │ 技師處理完、ro_line.status 重新 done
       ▼
FI line_check 再點通過 → has_failure=false → 可繼續 step 2-4
       │
       │ FI step 4 完成簽名（signFinalInspection）
       ▼
FI.status = 'signed'
       │
       │ Step 5：發取車通知（sendPickupNotification）
       ▼
FI.status = 'completed'  + UPDATE RO.status = '待結帳'
       │
       │ 客戶來店、SA 結帳
       ▼
（08 結帳收款負責 RO.status = '已關單' + RO.closed_at）
```

**核心 transition：FI completed → RO status='待結帳'**。這條是售後 pipeline 把車「從廠內」推到「等客戶」的關鍵閘門，**屬於本提案的責任、不屬於 08 結帳**（08 結帳負責「待結帳 → 已關單」）。

### 3.3 複檢未通過要回送 RO 重做？— 答：要、但「不重建 FI」、「不關 RO」、「不改 RO status 為已取消」

設計三選項：

| 選項 | 行為 | 利弊 |
|---|---|---|
| **A. 退回維修中（推薦）** | FI 保留、line_check 標 fail + rework_assigned_to、ro.status='維修中'、相關 labor_item.status 改回 'in_progress'、FI step 1 lock | 對技師最直觀、KPI（rework_count）可追蹤、不會有單據孤兒 |
| B. 取消 FI、技師端再開新 FI | fi.status='cancelled'、ro.status='維修中'、新建 fi-2 | 每次 rework 開新單、單據爆炸；統計「同一車修了多少次」要 group by ro_id |
| C. 整張 RO 從頭來 | ro.status='已取消'、重開新 RO | 太激進、不切實際（已經領了零件、入了庫存帳） |

→ **建議 A 方案**。實作要點：

1. `sendBackToRework(fi_id, line_check_ids[], note)`：批次標 line_check.state='fail' + rework_assigned_to + rework_at
2. `fi.has_failure=true`、`fi.rework_count++`、`fi.status='rework'`
3. UPDATE `ro.status='維修中'`、相關 `labor_items.status='in_progress'`（不是 'pending'、保留歷史）
4. 通知該技師（notifications hub event `final_check_rework_assigned`，payload: { ro_code, fi_code, items, fail_reasons }）
5. 技師處理完、labor_item.status 再 done → FI line_check 再點 ok → fi.has_failure 重算 → false 後 fi.status 回 'in_progress'

⚠️ **狀態 transition 的不對稱**：A 方案讓「FI rework」跟「FI in_progress」可以反覆來回切換，最終才到 'signed' → 'completed'。

### 3.4 FI 的 immutability 規則

| 狀態 | 可改欄位 | 不可改欄位 |
|---|---|---|
| in_progress / rework | line_checks / test_drive / clean / 試車 meta / 清潔備註 | fi_code / repair_order_id / issue_date / sequence_no |
| pending_signature（短暫） | 同上、但 step 已推到 4 | 同上 |
| signed | 取車通知 / next_service hints / sa_handover_note | 簽名、line_checks、step 1-3 結果 |
| completed | next_service hints（可補）/ sa_handover_note | 所有複檢結果與簽名 |
| cancelled | 無 | 所有 |

簽名後想改複檢結果 → 必須 `reopenFinalInspection(fi_id, reason)` 把狀態退回 `in_progress`、清掉簽名、走完整 sign 流程。要 audit log。

---

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `createFinalInspection` | INSERT fi 主檔 + 從 ro_lines 拉清單 seed line_checks + seed 5 試車項 + 5 清潔項 | 高 |
| `createFinalInspection` | 驗 ro.status / 所有 labor_items.status='done' / 該 RO 沒 active FI | 高 |
| `setLineCheckState(fail)` | UPDATE fi.has_failure / 觸發 issue-card 顯示 | 高 |
| `sendBackToRework` | UPDATE ro.status='維修中' + labor_items.status='in_progress' + fi.rework_count++ + dispatch notification 給技師 | 高 |
| `signFinalInspection` | 驗職級（business_rules `final_check_authority`）+ 防竄改時間戳 + UPDATE fi.status='signed' | 高（職級規則屬 [需確認] Q4） |
| `sendPickupNotification(line)` | INSERT notify_methods_used.line + dispatch notification hub event `vehicle_pickup_ready` channel=line | 高（hub 已通用） |
| `sendPickupNotification(sms)` | 同上 channel=sms | 中（SMS 通路在 hub 上是否已就緒？[需確認] Q5） |
| `sendPickupNotification(call)` | 只 INSERT notify_methods_used.call（純人工記錄、不外撥） | 高 |
| `completeFinalInspection` | UPDATE ro.status='待結帳' + fi.status='completed' + 寫 ro.status_history + （可選）updateNextServiceReminderInVehicleProfile | 中（更新車輛主檔 next_service 欄是不是要在這做？[需確認] Q6） |
| `completeFinalInspection` | 寫 audit log: who/when signed FI | 高 |
| `sendBackToRework` | 是否回頭通知 SA「車主可能要延期取車」？ | [需確認] Q7（demo 沒提，但業務有可能） |
| `signFinalInspection` | 數位簽名「依 Ducati SRV-SRB-26-014 法律效力且防竄改」— 是否真的要 hash + 時間戳鏈？ | [需確認] Q8（法務層要求？） |

⚠️ [需確認] Q1-Q8 進 Phase 3 拍板。

---

## 5. 跟其他姊妹頁的接點

| 對象 | 本頁怎麼跟它互動 |
|---|---|
| `repair_orders` (02) | **強上游**：FK + 開單前置條件 + status 雙向 transition |
| `repair_order_labor_items` (03) | 讀 status='done' 當前置；fail 時改回 'in_progress' |
| `repair_order_part_items` (03) | 讀 issue_status；FI line_check 帶入零件項 |
| `addon_items` (04 追加) | 透過 ro_lines 自動帶入（addon 通過後本來就是 ro_line） |
| `addon_loop` (05 增項) | 增項通過後也變 ro_line / labor_item，FI line_check 一樣會帶入 |
| `pre_inspections` (04 預檢) | 透過 `ro.pre_inspection_id` 反查、用於 FI 列「原始進廠主訴」對照（demo 沒顯示、但建議有） |
| `payments` / `invoices` (08 結帳) | 下游：FI completed → ro.status='待結帳' → 08 接手 |
| `vehicles` (09 人車檔案) | next_service_mileage / next_service_date → 可選擇同步寫回 vehicles.next_service_*（[需確認] Q6） |
| `customers` (09 人車檔案) | 取車通知 dispatch 對象 |
| `notifications_hub` | event `vehicle_pickup_ready`（line/sms）+ event `final_check_rework_assigned`（推給技師） |
| `business_rules` | `rule_kind='final_check_authority'` 職級檢查 + `rule_kind='final_check_template'` 試車/清潔項模板 |
| 11 取車通知設定 | 通知 template 與 channel 偏好（先後順序、模板字串）走那邊設定 |
| 12 客戶標籤主管設定 | FI 簽核授權職級可能跟那邊的「主管」設定關連 |

---

## 6. Schema 草案（Phase 2 才會寫到 migration、本提案先列）

### 主表 `final_inspections`

```sql
CREATE TABLE final_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  subsidiary_id uuid REFERENCES subsidiaries(id),
  store_id uuid REFERENCES organizations(id),

  fi_code text NOT NULL,                          -- FI-YYMMDD-NNN
  issue_date date NOT NULL,
  sequence_no int NOT NULL,

  repair_order_id uuid NOT NULL REFERENCES repair_orders(id),
  inspector_id uuid NOT NULL REFERENCES employees(id),
  inspector_role_snapshot text,                   -- 「資深技師」（簽核當下快照、給 audit）

  mileage_in int,                                 -- 從 ro 帶
  mileage_after_test_drive int,
  test_distance int,                              -- generated or app-computed
  test_drive_started_at timestamptz,
  test_drive_route text,
  test_drive_technician_id uuid REFERENCES employees(id),
  test_drive_note text,

  clean_personal_items_note text,
  final_conclusion_note text,

  status text NOT NULL DEFAULT 'in_progress',
  -- in_progress | pending_signature | signed | rework | completed | cancelled

  has_failure boolean NOT NULL DEFAULT false,
  rework_count int NOT NULL DEFAULT 0,

  inspector_signature_url text,
  signed_at timestamptz,
  signature_proof jsonb DEFAULT '{}'::jsonb,      -- { time_hash, ip, device_fingerprint, ... }

  next_service_mileage int,
  next_service_date date,
  next_service_items text,
  sa_handover_note text,

  notify_methods_used jsonb DEFAULT '{}'::jsonb,
  -- { line: { sent_at, delivery_id }, sms: { sent_at, delivery_id }, call: { recorded_at, recorded_by } }

  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (brand_id, fi_code),
  UNIQUE (repair_order_id, brand_id) WHERE status != 'cancelled'  -- 一張 RO 一張 active FI
);

CREATE INDEX ON final_inspections (brand_id, status, issue_date DESC);
CREATE INDEX ON final_inspections (repair_order_id);
CREATE INDEX ON final_inspections (inspector_id, completed_at DESC);
CREATE INDEX ON final_inspections (brand_id, completed_at DESC) WHERE status='completed';
```

### 子表（簡寫，欄位見 §1 entities）

```sql
CREATE TABLE final_inspection_line_checks      (...);  -- 對應 ro_lines / labor_items / part_items
CREATE TABLE final_inspection_test_drive_checks (...); -- 試車 5 項
CREATE TABLE final_inspection_clean_checks      (...); -- 清潔 5 項
```

### 欄位分類（typed vs jsonb）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `fi_code` | typed text UNIQUE | 業務 key、人會打、會被 query |
| `repair_order_id` | typed FK NOT NULL | 強 FK、上游主鍵 |
| `inspector_id` | typed FK NOT NULL | 報表 group by、KPI 用 |
| `inspector_role_snapshot` | typed text | 簽核當下職級快照、簡單字串、要被 audit/report 看 |
| `mileage_in / mileage_after_test_drive / test_distance` | typed int | 報表 / KPI 用 |
| `test_drive_route` | typed text | demo 只有 string；如果未來要 GPS 軌跡再 promote |
| `status` | typed text + CHECK | 狀態機、index、list filter 主軸 |
| `has_failure / rework_count` | typed | KPI 排序軸 |
| `inspector_signature_url` | typed text | 單一 URL、不像 PI 那邊還有 proof_url（PI 的 signature_proof_url 是附 webcam 截圖；FI 沒這個概念、用 signature_proof jsonb 統合） |
| `signature_proof` | jsonb | 防竄改細節形狀未定（hash 算法、device fingerprint 細節），純 audit、不 query |
| `next_service_*` 三欄 | typed | 可能在 KPI / 跟 vehicles 主檔同步寫 |
| `sa_handover_note` | typed text | 純顯示、單一字串、會 search |
| `notify_methods_used` | jsonb | 形狀 = { line: {...}, sms: {...}, call: {...} }、key 動態（未來可能加 email），純記錄不 query 軸 |
| `signed_at / completed_at / cancelled_at` | typed timestamptz | 報表排序軸 |
| `cancellation_reason` | typed text | 純記錄、單一字串 |
| `metadata` | jsonb | 變動中的擴展欄（例：複檢員 GPS 位置、複檢設備 sn、未來 IoT 數據） |

**子表 line_checks 的特別說明**：

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `source_kind` | typed text + CHECK ('labor', 'part') | 決定哪個 FK 有值 |
| `source_labor_item_id / source_part_item_id` | typed FK nullable | 二擇一、CHECK constraint 確保只有一個有值 |
| `section_code` | typed text | demo 顯示分組（engine/brake/elec/general）、可能會 group by 統計「煞車系統 fail 率」 |
| `label / check_note` | typed text | 從 ro_line 帶過來的快照、可能事後 ro_line 改了但 FI 不該變 |
| `state` | typed text + CHECK | 'none' / 'ok' / 'fail' |
| `fail_reason` | typed text | 純顯示、單一字串 |
| `rework_assigned_to / rework_at` | typed | 退回時的指派、可被 query「我有幾個 rework 待處理」 |

### RLS（雙 brand 4 條 user_has_brand）

```sql
ALTER TABLE final_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY final_inspections_select ON final_inspections FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY final_inspections_insert ON final_inspections FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY final_inspections_update ON final_inspections FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY final_inspections_delete ON final_inspections FOR DELETE USING (user_has_brand(brand_id));
-- 3 張子表 RLS：透過 fi_id 反查 brand_id，做 function 包一層 fi_brand(fi_id) 或直接 join policy
```

> ⚠️ **本提案不寫實際 migration、不執行 DDL**。落地交給 Phase 4。

### 不採共表的具體驗證

如果採共表 inspections + phase 欄位：

```sql
-- 欄位 NULL 率（用既有 PI demo 估）：
-- PI 欄位在 final_check row 為 NULL：13+ 欄
-- FI 欄位在 precheck row 為 NULL：14+ 欄
-- 共通欄：~10 個
-- → 任一 row 的 NULL 率 = (37-10-該 phase 必填)/37 ≈ 35-40%

-- 報表 query 必須加 phase filter：
SELECT count(*) FROM inspections WHERE phase='final_check' AND status='completed';  -- 而不是 SELECT count(*) FROM final_inspections WHERE status='completed';
```

---

## 7. Domain Helper 規劃（Phase 4 才建檔）

預計檔案：

```
src/domain/final-inspections.ts            -- 主 facade（'use server'，async only）
src/domain/final-inspections.constants.ts  -- enum: FIStatus / LineCheckState / TestDriveCheckCode / CleanCheckCode / NotifyMethod
src/lib/inspections/shared.ts              -- 共用工具：sequence_no / signature proof / step progress（PI / FI 共享）
```

> ⚠️ **重點規範**（依 SKILL 紀律 / 已踩雷三次）：
> - `final-inspections.ts` 走 `'use server'` → 只 export async function；所有 const / enum / type alias 移到 `.constants.ts`
> - UI 一律 `import { signFinalInspection } from '@/domain/final-inspections'`，禁止 `import { createClient } from '@/lib/supabase/...'`
> - Day 1 內部直連 supabase；推 LINE / SMS 副作用先 `after(() => notifications.dispatch(...))` 包起來、event code 用 placeholder

預計 API：

```ts
// reads
listFinalInspections(filter): Promise<FinalInspection[]>
getFinalInspectionByRoId(ro_id): Promise<FinalInspection | null>
getFinalInspectionWithChecks(fi_id): Promise<FinalInspectionWithChecks>

// writes
createFinalInspection(ro_id): Promise<{ ok, fi_id?, error? }>
setLineCheckState(line_check_id, state, fail_reason?): Promise<Result>
setTestDriveCheck(check_id, state, note?): Promise<Result>
setCleanCheck(check_id, state, note?): Promise<Result>
updateTestDriveMeta(fi_id, patch): Promise<Result>
sendBackToRework(fi_id, line_check_ids[], note): Promise<Result>
signFinalInspection(fi_id, signature_data): Promise<Result>
updateNextServiceHints(fi_id, patch): Promise<Result>
sendPickupNotification(fi_id, method): Promise<Result>
completeFinalInspection(fi_id): Promise<Result>
reopenFinalInspection(fi_id, reason): Promise<Result>
```

---

## 8. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 | 備註 |
|---|---|---|---|---|
| FI 主操作頁（5-step wizard） | `/parts/aftersales/repair-orders/[id]/final-check` | 非標準（wizard、不是 list/detail） | 自製 step-based component | 5 個 step linear、step 4 卡簽名、step 5 卡通知 |
| FI 列表（次要） | `/parts/aftersales/final-checks` | List View | `parts/setup/items/_components/items-board.tsx` + DataGrid | 給技師日報 / 主管巡視 |
| FI 設定 — 簽核授權職級 | `/admin/business-rules?kind=final_check_authority` | 進既有 business_rules 設定 UI | （重用既有 business_rules board） | rule_kind='final_check_authority' |
| FI 設定 — 試車/清潔項模板 | `/admin/business-rules?kind=final_check_template` | 同上 | 同上 | rule_kind='final_check_template' |

> ⚠️ 主操作頁是 5-step wizard、**不適用 list/detail 標準範本**（這點跟 04 預檢 SA 環檢頁、04 RO 串接 transfer overlay 同樣）。本頁要自製 stepper 元件（reuse 04 預檢頁的 stepper 邏輯）。

---

## 9. nav_nodes（雙 brand、Phase 4 才動）

FI 是 **流程內頁、不在 sidebar 列表**。實際 sidebar 入口在：
- `RO 詳情頁` 的「複檢」按鈕（labor_items 全 done 後 enable）
- `工單查詢` 列表（10 工單查詢）內 row action「進入複檢」（status='維修中' 且工項都 done）

FI 列表頁 `/parts/aftersales/final-checks` 可能要進 sidebar（雙 brand）— 但這要看 Phase 3 用戶要不要這條獨立入口、是只當 master view 還是不做。

→ **本 phase 1 提案不規劃 nav_nodes 動作、Phase 2 提案再決定**。

---

## 10. 開放問題（Phase 3 拍板）

- [ ] **Q1**：一張 RO 可以有幾張 active FI？
   - (a) 只能一張、active FI 期間 RO 永遠對應同一張，rework 在同張內循環
   - (b) 每次 rework 都建新 FI、舊 FI 標 cancelled、技師端能看到歷史「修了三次才過」
   - 推薦 (a) — 對技師最直觀、KPI rework_count 算單張內次數
- [ ] **Q2**：複檢未通過、退回維修中時，哪些 labor_items.status 要改回 'in_progress'？
   - (a) 只有 fail 的 line_check 對應的 labor_item
   - (b) 全部 done 的 labor_item 都改回 in_progress（保守、避免漏）
   - 推薦 (a) — 精準、技師只看到要處理的
- [ ] **Q3**：開 FI 前 part_items.issue_status 要嚴格？
   - (a) 嚴格：所有 part_items.issue_status='issued' 才能開 FI
   - (b) 放寬：允許 'partial'（部分零件未到、技師決定是否繼續複檢）
   - (c) 完全不檢查：part_items 是「行政手續」、不擋 FI
   - 推薦 (b)
- [ ] **Q4**：簽核授權職級規則放哪？
   - (a) `business_rules` rule_kind='final_check_authority'、config: `{ allowed_role_codes: ['senior_tech', 'service_manager'] }`
   - (b) RBAC `role_permissions` 新增 `final_check.sign` permission code
   - 推薦 (b) — 簽核是 boolean「能 / 不能」、走 RBAC SSOT（依 architecture.md §3 規則）；但角色名 mapping「資深技師」/「售後主管」要建在 roles 表
- [ ] **Q5**：取車通知 SMS 通路是否已就緒？
   - notification hub 已 line 通；SMS 通路要看 §notifications memory「LINE 已 live、Google Chat 等 Workspace 帳號」— 看起來 SMS 沒接過
   - 若沒接：先實作 line + call（人工記錄）兩個 method、sms 留 placeholder + 「未啟用、請通知工程師」
- [ ] **Q6**：completeFinalInspection 是否同步寫回 `vehicles.next_service_mileage` / `vehicles.next_service_date`？
   - (a) 寫回，車輛主檔保有「下次保養」單一事實來源
   - (b) 不寫回、車輛主檔只看歷史 FI 最新一張的 next_service_*
   - 推薦 (a) — vehicles 是 SSOT、查單比 GROUP BY FI 簡單
- [ ] **Q7**：sendBackToRework 是否通知 SA？
   - (a) 通知，SA 可能要打電話告知車主延期
   - (b) 不通知，靠 SA 在系統內看 RO.status 切回維修中
   - 推薦 (a) — 客戶體驗優先
- [ ] **Q8**：數位簽名 SRV-SRB-26-014 法律效力是否實作 hash + 時間戳鏈？
   - (a) 形式上：存 signature_url + signed_at 即可、`signature_proof` jsonb 留結構但內容 placeholder
   - (b) 實質上：SHA-256(签名圖 + signed_at + inspector_id + ro_code + 防偽 nonce)、存 hash + chain previous_hash、做 audit table
   - 推薦 (a)（POC 階段）、(b) 留給 Phase 2/3 上生產時再升級
- [ ] **Q9**：FI 是否要單獨 list 入口進 sidebar？還是只從 RO 詳情頁進？
   - (a) 不獨立、只在 RO 詳情頁 +「工單查詢」內
   - (b) 加 `/parts/aftersales/final-checks` 雙 brand sidebar 入口
   - 推薦 (a) — 流程內單據不該爬上 sidebar、否則 sidebar 爆炸
- [ ] **Q10**：試車項 / 清潔項 5+5 是「全 demo 共用且固定」還是「店長可改 template」？
   - (a) 固定：寫死在 code、永遠 5+5
   - (b) 可改：走 business_rules rule_kind='final_check_template'、初始 seed 5+5
   - 推薦 (b) — 不同店 / 不同車型可能不同
- [ ] **Q11**：reopenFinalInspection（簽完後反悔重開）權限給誰？
   - (a) 售後主管以上
   - (b) 同 sign 權限的人（資深技師 + 售後主管）
   - 推薦 (a)
- [ ] **Q12**：取車通知與 11 取車通知設定的整合邊界？
   - 11 那邊是 template 設定（誰、哪個 channel、什麼時段、模板字串）
   - 本頁是「按下按鈕的當下 dispatch 一次」
   - 是否要做「定時提醒」（24 hr 後沒取車自動再推一次）？— 屬 11 那邊還是本頁？推薦交 11

---

## 11. Critical Files（Phase 4 才動）

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/final-inspections.ts` |
| 新增 | `src/domain/final-inspections.constants.ts` |
| 新增 | `src/lib/inspections/shared.ts`（FI / PI 共用 utils） |
| 新增 | `src/app/(workspace)/parts/aftersales/repair-orders/[id]/final-check/page.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/repair-orders/[id]/final-check/_components/fi-wizard.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/repair-orders/[id]/final-check/_components/fi-line-checks.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/repair-orders/[id]/final-check/_components/fi-test-drive.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/repair-orders/[id]/final-check/_components/fi-clean.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/repair-orders/[id]/final-check/_components/fi-sign.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/repair-orders/[id]/final-check/_components/fi-notify.tsx` |
| 新增 | `src/app/(workspace)/parts/aftersales/final-checks/page.tsx`（FI list） |
| 新增 | DB migration: create final_inspections + 3 子表 + RLS + sequence_no advisory lock 邏輯 |
| 修改 | `src/domain/repair-orders.ts` — 加 `transitionRoToReadyForPayment` 與 `transitionRoBackToInProgress` 兩個 transition helper |
| 修改 | RBAC `permissions` 表 — 新增 `final_check.sign` / `final_check.create` / `final_check.send_back_to_rework` / `final_check.reopen` |
| 修改 | `business_rules` seed — `rule_kind='final_check_template'` 初始 5+5 項 |
| 可能 | `src/lib/notifications/events.ts` — 新增 event code `vehicle_pickup_ready` / `final_check_rework_assigned` |

---

## 12. Verification（落地完手測，Phase 5 跑）

1. **開單前置**：未完成 labor_items 的 RO 不能開 FI（按鈕 disable + tooltip）
2. **同步 ro.status**：開 FI 不改 ro.status；fail → rework 改 ro.status='維修中'；completed 改 ro.status='待結帳'
3. **rework 循環**：fail 後標 line_check.rework_assigned_to + ro_line.status 回 'in_progress'、技師處理後再點 ok 能解鎖 step 2-4
4. **rework count 累計**：rework_count 在 fi.has_failure: false → true 時 +1（同次 fail 多項不重複算）
5. **簽核授權**：未獲授權職級看不到 sign canvas、看到 auth-fail block
6. **簽名後不可改**：signed 狀態下 step 1-3 結果 readonly
7. **通知 dispatch**：sendPickupNotification(line) 後 `notification_deliveries` 多一筆 channel=line target_ref=customer line user id
8. **completeFinalInspection 原子性**：人為製造 ro.status update 失敗 → fi.status 不能跳 'completed'、rollback 整 transaction
9. **next_service 同步**（Q6 採 a）：completeFinalInspection 後 `vehicles.next_service_mileage` = fi.next_service_mileage
10. **不對稱簽名差異**：FI 只有「複檢員簽名」（一個 url）、不像 PI 有「SA + 車主 + 截圖」三個簽名
11. **雙 brand RLS**：登入 ducati 看不到 indian 的 FI、INSERT FI 帶 brand_id='indian' 被 RLS 擋
12. **tsc --noEmit / eslint** 0 errors

---

## 13. 邊界（什麼不做）

- ❌ 不重複落 `pre_inspections` schema（姊妹 precheck-sa）
- ❌ 不重複落 `repair_orders` / `ro_lines` schema（姊妹 ro / ro-lines）
- ❌ 不把「定時提醒未取車車主」做進本頁（屬 11 取車通知設定）
- ❌ 不做「複檢員 GPS 位置記錄」（IoT 範疇，太遠）
- ❌ 不做「複檢影片附件」（demo 沒提）
- ❌ 不做 02-03 詳情整合頁的 FI tab 內嵌版（FI 是獨立 wizard 頁）
- ❌ 不在 nav_nodes 加流程內頁（FI 只從 RO 詳情頁進）

---

## 14. 對 spec-to-feature SKILL 自己的回饋

跑這頁時的觀察：

1. ✅ **姊妹頁交叉引用機制有效**：03 ro-lines-phase1 已預期「Phase 5 竣工複檢 → final_inspections」、本頁就應驗該預期；不是事後對齊、是 ro-lines 寫的時候就先 reserve 了空間
2. ✅ **共表 vs 拆表的評估流程**有結構化幫助 — `field-classification.md` 的決策樹直接適用於「欄位 NULL 率」這個診斷
3. ⚠️ **Wizard-type 頁面範本缺**：spec-to-feature 範本目前是 list / detail，wizard / stepper 沒範本（04 預檢、04 PI-RO transfer overlay、06 FI、05 增項閉環都是 wizard）— 應補一條 `page-templates.md` 之 wizard 範本
4. ⚠️ **跨頁 status transition contract**：售後 pipeline 的 ro.status 被多頁切換（02 開單、03 工項做完、04 預檢轉 RO 也動、06 FI、08 結帳）— 應在某個地方畫一張「ro.status 狀態機 + 各 mutator」清單 SSOT。目前散在各姊妹頁、容易漂移
