# 提案：售後工單模組 — 預檢單 SA 環檢（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/04_預檢單_SA環檢_v3.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組目前只在 Ducati nav 樹下；Indian 視業務決定再補）
> 姊妹頁：
> - `docs/proposals/feature-aftersales-overview-phase1.md`（00_導覽總覽）
> - `docs/proposals/feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）
> - `docs/proposals/feature-aftersales-appointments-phase1.md`（01_預約管理看板）
> - `docs/proposals/feature-aftersales-ro-phase1.md`（02_正式工單 RO）
> - `docs/proposals/feature-aftersales-ro-lines-phase1.md`（03_維修項目零件明細）
> - **本頁 + `feature-aftersales-precheck-ro-bridge-phase1.md`（04_RO 串接版） 共享同一張 `pre_inspections` 主表**（理由見 §0 與 §6）

---

## 0. 頁面定位（最重要）

這頁是售後 pipeline 的 **Phase 2「SA 預檢單」的主體 5 步流程頁**，**不是傳統 List / Detail / Setting**，而是 **長表單 wizard（單筆 entity、5 個 tab 線性流程，含中段可回頭切換）**：

```
[01 預約管理看板] — 預約「預檢」鈕觸發 → 在 pre_inspections 表 INSERT 一張、進本頁
        ↓
[04 預檢單 SA 環檢 v3] ← 你在這裡（PI = Pre-Inspection 編號 PI-YYMMDD-NNN）
  Tab 1 環車檢查（SA 接車當下完成）
  Tab 2 來意詢問（SA 接車當下完成）
  Tab 3 技師深入檢查（車輛進場後技師另端填寫，SA 可隨時回看）
  Tab 4 報價（SA 彙整 SA 段 + 技師段，可手動加項）
  Tab 5 確認簽名（SA + 車主第一次簽名，車況交接）
        ↓ 確認後
[02 正式 RO 工單]  — 把預檢單資料只讀帶入，SA 選 P1/P2 前綴後正式開立
```

**核心特徵**：

1. **唯一身分**：一張 `pre_inspections` row 就是一次預檢、`pi_code = PI-YYMMDD-NNN`（business key、人讀得懂、給車主看）、跟 `id uuid` 並存
2. **跨角色協作**：Tab 1-2 是 SA 接待當下填、Tab 3 是技師車間填、Tab 4-5 又回到 SA — 三段時間點不同、責任人不同、UI 同一張 entity。**這是本頁跟典型「detail page」最大的差異**
3. **進度條 + footer 控制流**：底部固定 footer 顯示「環檢進度 X/8」、進度條 20%/40%/60%/80%/100% 推進、下一步 button 隨 tab 變動 — 整頁互動是 **wizard pattern**（非 free-form 編輯）
4. **數據是「快照 + 推進」的混合**：保固狀態快照進 PI（pi 行內固定）、客戶標籤可寫回 `customer_tags`（跨單據共用）、車主簽名 + SA 簽名後 PI 進入「鎖定可轉 RO」狀態
5. **下游觸發**：Tab 5 確認簽名 → 同時 (a) `pre_inspections.status = 'confirmed'`、(b) 寫 `appointments.metadata.linked_pre_inspection_id`、(c) 引導到 04_RO 串接版的 transfer overlay → 開立 RO

**在售後流程中的定位**：**Phase 2 整個診斷單的容器**。Phase 1 的預約只記「客戶帶車進來」，Phase 3 的 RO 是「正式合約」，**中間這 5 個 tab 就是從「車進廠」到「合約成立」的完整診斷紀錄**。所有後續會被引用的「車況交接點」（哪裡刮傷、車主說什麼、技師發現什麼、報價多少、是否簽字同意）—— SSOT 都在這張 PI 上。

⚠️ **PI 是售後模組的「真相起點」**：RO 開立後就鎖定 PI（不允許改），任何後續糾紛、保固爭議、追加項目 / 增項閉環的「原點」都要追溯到 PI。設計上必須當作 **不可變的事件紀錄**（confirm 後 immutable，類似會計分錄）。

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

主 entity（**本頁負責落地的 SSOT**）：

```
pre_inspections（PI 主檔，5 tab 的容器）
  fields:
    - id uuid PK
    - brand_id text
    - subsidiary_id uuid                  # NetSuite Subsidiary 對映
    - store_id uuid                       # 收車店（organizations level=2）
    - pi_code text UNIQUE                 # PI-260427-003（business key）
    - issue_date date                     # 開單日期（編號裡的 YYMMDD）
    - sequence_no int                     # 編號裡的 NNN

    - appointment_id uuid FK → appointments  # 來源預約（從 01 看板「預檢」鈕建立）
    - customer_id uuid FK → customers
    - vehicle_id uuid FK → vehicles
    - sa_id uuid FK → employees           # 接車 SA
    - technician_id uuid FK → employees   # Tab 3 主責技師（可空，技師接手後填）

    -- 進廠當下快照（PI 開單時固定）
    - mileage_in int                      # 進廠里程
    - warranty_snapshot jsonb             # 保固狀態快照 { is_valid, type, start_at, expires_at, mileage_limit }

    -- Tab 1 環檢備註（短文本）
    - env_check_note text                 # 「左整流罩約 5cm 刮傷⋯」

    -- Tab 2 來意 + 車主原話
    - customer_complaint text             # 車主原話（SA 如實記，不加判斷）
    - purposes text[]                     # 來廠目的（複選：定保/里程保養/Desmo/故障/改裝/疑似保固/公報召回/其他）
    - has_warranty_concern boolean        # 是否勾選「疑似保固」或「公報召回」（觸發黃色告警）

    -- Tab 4 報價快照（最終由 quote_subtotal 決定要不要 promote）
    - estimated_labor_total numeric(12,2) # SA 部分 + 技師同意項 工時費合計
    - estimated_parts_total numeric(12,2) # 零件費合計
    - estimated_tax numeric(12,2)
    - estimated_total numeric(12,2)
    - lu_rate numeric(10,2)               # 開單當下生效的 LU 單價（如 NT$1,650/hr ÷ 10 LU = 165/LU）

    -- 流程狀態
    - status text                         # draft / in_progress / pending_signature / confirmed / cancelled
    - confirmed_at timestamptz            # Tab 5 雙簽完成的時點
    - sa_signature_url text               # SA 簽名圖檔（Supabase Storage）
    - customer_signature_url text         # 車主簽名（場 / Line 截圖二選一）
    - customer_signature_proof_url text   # Line / 簡訊截圖（簽不到本人時的代替）

    -- 業務歸戶
    - linked_ro_id uuid FK → repair_orders  # 開 RO 後反向填回
    - cancelled_at / cancellation_reason

    - metadata jsonb                       # 變動中 / 單頁專用 / pi-only 顯示
    - created_by / created_at / updated_at

  relationships:
    - { to: appointments,    kind: 'fk' }   # 上游
    - { to: customers,       kind: 'fk' }
    - { to: vehicles,        kind: 'fk' }
    - { to: employees,       kind: 'fk' } x 2 (sa_id / technician_id)
    - { to: repair_orders,   kind: '0..1' } # 下游（confirm 後可能建 RO；也可能取消、就沒 RO）
    - { to: pre_inspection_damage_marks, kind: '1m' }
    - { to: pre_inspection_env_checks,   kind: '1m' }
    - { to: pre_inspection_intake_qa,    kind: '1m' }
    - { to: pre_inspection_tech_findings, kind: '1m' }
    - { to: pre_inspection_quote_items,  kind: '1m' }
    - { to: customer_tags,               kind: 'm-ref' }  # 客戶標籤共讀共寫
```

**子 entities（5 張子表，理由見 §6 typed vs jsonb 評估）**：

```
pre_inspection_damage_marks（環車損傷標記點 ─ Tab 1 上半）
  - id uuid PK
  - pre_inspection_id uuid FK
  - view text                  # side / top（側面圖 / 鳥瞰圖）
  - position_x numeric(5,2)    # 0~100 百分比座標
  - position_y numeric(5,2)
  - label text                 # 左整流罩 / 油箱車身 / 車尾 / 前輪 / 後輪 / 前叉 / 坐墊區 / 左前車身⋯
  - severity text              # ok / warn / bad / empty（empty = 未標記，可不存）
  - note text                  # 該點補充說明
  - photo_urls jsonb           # 該點現場照片 array

pre_inspection_env_checks（環檢項目逐一確認 ─ Tab 1 下半，8 個固定項）
  - id uuid PK
  - pre_inspection_id uuid FK
  - check_code text            # exterior / lights / mirrors / front_tire / rear_tire / front_brake_pad / rear_brake_pad / chain
  - check_label text           # 「車身外觀（刮傷/凹痕/龜裂）」⋯（顯示用，可從 lookup 帶）
  - status text                # ok / warn / bad / pending（pending = 還沒檢查）
  - note text
  - sort_order int

pre_inspection_intake_qa（來意主動詢問 ─ Tab 2 下半，8 題固定 + 可延伸）
  - id uuid PK
  - pre_inspection_id uuid FK
  - question_code text         # last_service / abnormal_sound / handling_feel / brake_feel / lights_elec / leakage / accessory_wish / other
  - question_label text
  - answer text                # yes / no / na
  - sort_order int

pre_inspection_tech_findings（技師深入檢查 ─ Tab 3，N 項，可動態增減）
  - id uuid PK
  - pre_inspection_id uuid FK
  - category text              # engine / brake / tire / elec / chassis
  - title text                 # 引擎機油狀況 / 前煞車來令片 2.8mm⋯
  - diagnosis text             # 「建議更換（顏色偏黑）」
  - safety_level int           # 1=立即必修 / 2=近期建議 / 3=一般建議
  - lu numeric(6,2)
  - parts_amount numeric(12,2)
  - customer_decision text     # agree / defer / reject / none
  - decided_at timestamptz
  - is_addon boolean DEFAULT false  # 技師臨時新增（非預設項）
  - sort_order int
  - metadata jsonb

pre_inspection_quote_items（報價單合併行 ─ Tab 4）
  - id uuid PK
  - pre_inspection_id uuid FK
  - source text                # 'sa' / 'tech'（SA 段 or 技師段）
  - source_finding_id uuid FK → pre_inspection_tech_findings  # 若 source=tech 必填
  - name text
  - lu numeric(6,2)
  - labor_amount numeric(12,2)
  - parts_amount numeric(12,2)
  - subtotal numeric(12,2)
  - decision text              # 同 tech_findings.customer_decision（SA 段預設 agree）
  - sort_order int

```

引用 entities（不歸本頁落地）：

- `appointments` → 「01 預約管理看板」負責 — confirm 後寫回 `metadata.linked_pre_inspection_id`
- `customers` / `vehicles` → 「09 人車檔案」負責 — 唯讀帶入
- `customer_tags` → 「12 客戶標籤主管設定」負責預設清單（🔒 主管鎖定 / 個人新增），本頁可讀可寫個人 tag
- `employees` → master data，既有
- `business_rules`（rule_kind='lu_rate' / 'work_order_prefix'）— 本頁讀 LU 單價、不寫
- `repair_orders` → 「02 正式 RO 工單」負責 — confirm 後跳轉到開立 RO 頁

> 雙 brand：`pre_inspections.brand_id text` 是 brand-aware RLS 必備（4 條 user_has_brand RLS）。**目前 nav 只在 Ducati 樹下**（依 memory「WMS 範圍 — Ducati 不做」校準姊妹頁也是同樣狀況），Indian 是否要做要等業務點頭，Phase 4 落地時雙 brand seed 還是預設都 INSERT。

### actions

```
listPreInspections(filter: {
  brand_id: string,
  date?: string,
  status?: PIStatus,
  store_id?: string,
  sa_id?: string,
}) → Promise<PreInspection[]>
  # 通常不從這頁開啟、是給管理 / 查詢頁用（10_工單查詢 / 07_售後管理）
  # 本頁的入口是 router.push('/aftersales/pre-inspections/<id>')，不經 list

getPreInspectionById(id: string) → Promise<PreInspection & {
  damage_marks, env_checks, intake_qa, tech_findings, quote_items
}>

createPreInspection(input: {
  appointment_id: string,    # 唯一觸發點 — 從 01 預約看板「預檢」鈕
}) → Promise<Result<{ pre_inspection_id: string, pi_code: string }>>
  # 副作用：
  # - 用 appointment_id 帶出 customer / vehicle / store / 進廠里程
  # - 算 pi_code（PI-{YYMMDD}-{當日同 brand 流水})
  # - seed 8 條 env_checks（pending）+ 8 條 intake_qa（empty）
  # - 寫 appointments.metadata.linked_pre_inspection_id
  # - 切 appointments.status 到「等待中」

updatePreInspectionHead(id: string, patch: {
  env_check_note?, customer_complaint?, purposes?, mileage_in?, ...
}) → Promise<Result>
  # Tab 1-2 主體欄位 autosave / on-blur save

setDamageMark(pi_id: string, mark: { view, position_x, position_y, label, severity, ... })
  → Promise<Result<{ damage_mark_id }>>
  # 點圖加 dot；同一 label 重複 click 觸發 severity 循環（empty → ok → warn → bad → empty）

setEnvCheck(pi_id: string, check_code: string, status: 'ok'|'warn'|'bad')
  → Promise<Result>

setIntakeQa(pi_id: string, question_code: string, answer: 'yes'|'no'|'na')
  → Promise<Result>

addTechFinding(pi_id: string, finding: {
  category, title, diagnosis, safety_level, lu, parts_amount, is_addon: boolean,
}) → Promise<Result<{ finding_id }>>
  # 技師端新增 / 從 RO 模板帶入預設 + 自由加

setTechFindingDecision(finding_id: string, decision: 'agree'|'defer'|'reject')
  → Promise<Result>
  # 車主在 SA 旁口頭決定、SA 點 button 紀錄
  # 副作用：自動把 agree 的 finding 轉成 quote_items（source='tech'）

addSaQuoteItem(pi_id: string, item: { name, lu, parts_amount })
  → Promise<Result<{ quote_item_id }>>
  # Tab 4 SA 手動加項（如「定期保養（機油＋濾芯）」這種預檢系統沒列的）

removeQuoteItem(quote_item_id: string) → Promise<Result>

recomputeQuoteTotals(pi_id: string) → Promise<Result<{ labor, parts, tax, total }>>
  # 每次新增/移除 quote item 都觸發；存進 pre_inspections.estimated_*

signPreInspection(pi_id: string, party: 'sa'|'customer', signature: {
  signature_url?: string,
  proof_url?: string,        # 車主不在場時的 Line/簡訊截圖
}) → Promise<Result>
  # 兩方都簽完才能進 confirmPreInspection
  # 副作用：寫 sa_signature_url / customer_signature_url

confirmPreInspection(pi_id: string) → Promise<Result<{ ro_id?: string }>>
  # Tab 5 最終確認 → 鎖定 PI（status='confirmed'）
  # 預設不立即建 RO，而是轉到 04_RO 串接版的 transfer overlay
  # （RO 開立由「02 正式工單 RO」頁負責，使用者在那邊選 P1/P2 前綴後才真正 INSERT repair_orders）

cancelPreInspection(pi_id: string, reason: string) → Promise<Result>
  # 客戶決定不修了 → 軟刪、寫回 appointments.metadata.linked_pre_inspection_id=null

upsertCustomerTag(customer_id: string, tag: {
  color: 'red'|'yellow'|'green'|'blue', label, source: 'sa'|'after_sales',
}) → Promise<Result>
  # Tab 2 客戶標籤區 — 個人加（自己可移）、主管鎖（🔒 不可移）
  # 跨 PI / RO 共讀共寫，落在 customer_tags（屬「09 人車檔案」域，但本頁有寫入入口）

# 觸發點：updatePreInspectionHead / setEnvCheck / setIntakeQa / addTechFinding /
#         setTechFindingDecision / addSaQuoteItem 各自要打 server action（細粒度）
# 不要做整頁「儲存」按鈕 — wizard pattern 是邊填邊存、tab 切換就是 commit point
```

### kpis（本頁不直接展示，但會回灌到 01 看板）

```
今日預檢中 = pre_inspections WHERE issue_date=today AND status IN ('draft','in_progress','pending_signature')
今日待簽 = ... status='pending_signature'
今日已確認 = ... status='confirmed'
平均預檢耗時 = avg(confirmed_at - created_at) WHERE status='confirmed'
失銷率 = count(status='cancelled') / count(status IN ('confirmed','cancelled'))
增項閉環候選 = count(tech_findings WHERE decision IN ('defer','reject'))
  # 這個 KPI 是 05_增項閉環 模組的入口資料
```

### implied_pages

| kind | route | 範本 | 備註 |
|---|---|---|---|
| wizard / detail | `/aftersales/pre-inspections/[id]` | **特殊**（item-detail-view 改裝 / 或新建 wizard 範本） | 5 tab、底部固定 footer、進度條 |
| （無 list） | — | — | list 由 10_工單查詢 / 07_售後管理 提供 |
| （無 new）  | — | — | 入口是 01 看板「預檢」鈕，**禁止用戶手動 /new** |

⚠️ **本頁不適用標準 List + Detail design pattern**。它是 **wizard**：

- 沒有獨立的 list view（list 由 10_工單查詢 / 07_售後管理 提供，分別有不同的 filter 角度）
- 沒有 `/new` 入口（必須從 01 看板觸發、保證每張 PI 一定掛在一個 appointment 上）
- 5 個 tab 不是「平行頁籤」而是「線性流程」，要有 wizard chrome（footer prev/next、進度條、tab 完成狀態）

→ Phase 4 落地時要在 `references/page-templates.md` 補一個 **Wizard Pattern** 範本（首例）。

---

## 2. 跟姊妹頁 04 RO 串接版的關係（關鍵）

**04_預檢單_SA環檢_v3.html** 跟 **04_預檢單_RO串接_v3.html** 是同一個 PI 的兩個 demo 版本：

| 項目 | SA 環檢版（本頁） | RO 串接版（姊妹頁） |
|---|---|---|
| 包含畫面 | PI 5 個 tab | PI 5 個 tab + 轉換 overlay + RO 6 個 tab（A/B/C/D/E/F） |
| 重點展示 | PI 全流程獨立運作 | PI → RO 串接（資料自動帶入、SA 視角 / 技師視角切換、領料雙簽、複檢簽核、車主第二次簽名） |
| Tab 結構 | Tab 3 「技師深入檢查」 | Tab 3 改成「車間檢查」（語意微調） |
| 是否含 VIN 欄位 | 沒明顯顯示 | Tab 1 有獨立 VIN 欄位 ⭐ |
| 客戶標籤區 | ✅ 同 | ✅ 同（共用） |
| 終點 | 點「確認轉入 RO」彈 alert | 點「確認」→ transfer overlay → 跳到 RO 工單畫面 |

**結論：兩頁共享同一張 `pre_inspections` 主表 + 5 張子表**。理由：

1. **5 個 tab 的資料模型完全相同** — entity / field / 子表 結構 1:1
2. **RO 串接版多出來的部分都不屬於 PI** — RO 6 個 tab 是 `repair_orders` + `ro_lines` + `parts_issues` + `qc_inspections` 的事，**會落在 02 RO / 03 維修項目 / 06 竣工複檢 等姊妹提案**
3. **語意微調（「技師深入檢查」vs「車間檢查」）只是 label**，落 DB 是同一個 `pre_inspection_tech_findings` 表
4. **VIN 欄位**屬 `vehicles` 表，本頁從 vehicle 帶入即可，PI 自己不存（避免雙寫）

→ **本提案的 schema 涵蓋兩頁所有 PI 段需求**。RO 串接版的 RO 段交給 02 / 03 / 06 提案處理（其中 02 已存在 `feature-aftersales-ro-phase1.md`）。

→ **04 串接版 phase 1 提案**（`feature-aftersales-precheck-ro-bridge-phase1.md`）的職責縮減為：**「PI confirm 後的 transfer overlay + 跳轉契約」**，不重複落 PI 的 schema。

---

## 3. 副作用清單（高機率正確 / 需確認 / 推測）

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `createPreInspection` | INSERT pre_inspections + seed 8 env_checks + seed 8 intake_qa + UPDATE appointments.metadata.linked_pre_inspection_id + 切 appointments.status → '等待中' | 高機率正確 |
| `setTechFindingDecision('agree')` | 自動 INSERT 對應的 `pre_inspection_quote_items`（source='tech'、source_finding_id=this）+ `recomputeQuoteTotals` | 高機率正確 |
| `setTechFindingDecision('defer'/'reject')` | 不建 quote_item；標記為「失銷追蹤候選」（05 增項閉環的入口）；safety_level=1 + reject 需推 LINE 給售後主管 | [需確認] 推播誰、什麼條件 |
| `addSaQuoteItem` | INSERT quote_items + recomputeQuoteTotals | 高機率正確 |
| `signPreInspection(party='customer', proof_url=...)` | 收 Line/簡訊截圖時自動加 `metadata.signature_substitute=true` + 推 LINE 給售後主管知悉「車主未在場簽名」 | [需確認] 是否需主管介入 |
| `confirmPreInspection` | UPDATE status='confirmed'、confirmed_at=now、鎖定整張 PI（後續任何子表 INSERT/UPDATE 都拒）、寫 KPI 快照、推 LINE 給接手技師「PI 已 confirm、可啟動 RO」 | 高機率正確、推播對象需確認 |
| Tab 2 勾「疑似保固」或「公報召回」 | 顯示 amber 告警 banner（僅 UI）+ 未來 RO 開立時自動勾「保固索賠類型」候選 | 推測（HTML 只顯示告警，沒明說 RO 帶入） |
| `cancelPreInspection` | UPDATE status='cancelled' + 解除 appointments.metadata.linked_pre_inspection_id + 推 LINE 給 SA | [需確認] |
| `upsertCustomerTag` | 寫 customer_tags（跨 PI 共讀）；🔒 主管 tag 不可由本人移除（policy 層擋） | 高機率正確 |
| 客戶標籤主管預設清單 | 從 「12 客戶標籤主管設定」設定頁讀；本頁只展示與選用 | 高機率正確 |
| LU 單價（NT$165/LU、即 NT$1,650/小時 ÷ 10 LU/小時） | 從 `business_rules`（rule_kind='lu_rate'）讀，本頁 hardcode 是 demo；落地要查 rule | 高機率正確 |

⚠️ **[需確認] 項目要在 Phase 3 跟用戶釐清**（共 5 點）：
1. 失銷追蹤推播時機（safety_level=1 的 reject 是否立即通知售後主管？還是日結？）
2. 簽名替代（截圖）的審核流程（是否要主管覆核？預檢就 confirm 還是需主管放行？）
3. 取消 PI 是否要推 SA / 主管 / 技師（怎樣的取消是「客戶反悔」vs「SA 寫錯重開」）
4. 保固 / 召回告警是否自動帶到 RO 的索賠類型勾選（HTML 沒明說）
5. confirm 後是否真的整張 PI immutable，還是有「補登」窗口（如車主臨時想加項）

---

## 4. ⭐ Typed vs JSONB 評估（本頁的關鍵設計問題）

> **這是用戶特別點出來要評估的核心問題**：環檢項目（8 項固定 + 損傷標記點 N 個 + 技師檢查項 N 個 + 來意問答 8 項）量大、結構各異，要 typed columns 還是 jsonb 收？

### 4.1 決策原則重述（依 `field-classification.md`）

- **會被 SQL WHERE / ORDER BY / 報表 group by 用** → typed
- **形狀穩、會被三頁以上用** → typed
- **變動中 / 單頁專用 / 純顯示** → jsonb

### 4.2 各區塊評估

#### A) Tab 1 上半 — 環車損傷標記點（位置 dot）

| 性質 | 選擇 | 理由 |
|---|---|---|
| 量級 | 一張 PI 約 5-15 個 dot | — |
| 是否報表用 | ❌ 不會 group by 「哪個位置最常出現損傷」這種 | — |
| 是否跨頁查 | ✅ RO / 結帳 / 增項閉環 / 售後管理都可能要看「進廠時哪裡有損傷」 | 跨多頁 |
| 結論 | **typed 子表 `pre_inspection_damage_marks`** | 跨多頁共讀、需要按 PI 拉出全部 dot 清單、嚴重程度要 filter（只看 bad 的）→ 子表比 jsonb array 好 |

→ **不丟 metadata jsonb**，因為查詢「這台車進廠時哪裡破」會穿透到結帳階段、會被 RO 拍照證據引用。

#### B) Tab 1 下半 — 環檢項目逐一確認（8 項固定）

| 性質 | 選擇 | 理由 |
|---|---|---|
| 量級 | 固定 8 項（外觀 / 燈光 / 後照鏡 / 前後輪胎 / 前後煞車 / 鏈條） | — |
| 是否報表用 | ✅ 會 — 「本月幾台車前輪胎被標 bad」是售後管理關心的事 | 統計 |
| 是否跨頁查 | ✅ RO 開立時要帶 bad 的項到「客戶反應 / 技師診斷」、複檢時對照 | 跨多頁 |
| 是否新增 / 移除項目 | ❌ 8 項是固定 SOP；如果未來改成 10 項是「設定變更」級別的事 | — |
| 結論 | **typed 子表 `pre_inspection_env_checks`** + `check_code` lookup（從 `business_rules`/`master-data` 讀） | 固定 SOP、統計需求、跨頁帶入 → 子表 |

→ **8 項用 `check_code` enum 化、不要 hardcode 中文 label**，未來主管要改項目（如新增「儀表 / 啟動器」）就改 lookup。

#### C) Tab 2 上半 — 來廠目的（複選 8 項）

| 性質 | 選擇 | 理由 |
|---|---|---|
| 量級 | 一張 PI 約 1-3 個目的（複選） | — |
| 是否報表用 | ✅ 強烈會 — 「本月定保 vs 故障維修 vs 改裝」是售後 KPI 核心 | 統計主軸 |
| 結論 | **typed column `purposes text[]`** 或 **typed 子表 `pre_inspection_purposes`** | 看複選 cardinality |

→ **選 `purposes text[]`（typed array）**，因為複選 + 平均才 1-3 個 + 不需要每個目的多帶 metadata。子表只在「每個目的還要存何時加上 / 誰加的」才需要。

#### D) Tab 2 中段 — 車主原話（textarea）

| 性質 | 選擇 | 理由 |
|---|---|---|
| 量級 | 一個 PI 一段、< 500 字 | — |
| 是否報表用 | ❌ 純記錄、不 group by | — |
| 結論 | **typed column `customer_complaint text`** | 形狀穩、單欄、跨頁帶到 RO 「客戶反應意見」 |

#### E) Tab 2 下半 — SA 主動詢問（8 題固定 yes/no/na）

| 性質 | 選擇 | 理由 |
|---|---|---|
| 量級 | 固定 8 題 | — |
| 是否報表用 | ⚠️ 部分會 — 「異常聲響 yes 的比例」、「想加裝改裝配件 yes 的數量」 | 商機分析 |
| 是否跨頁查 | ⚠️ 部分會 — 「想加裝改裝配件」會傳到 12_失銷追蹤 / 銷售模組 | — |
| 結論 | **typed 子表 `pre_inspection_intake_qa`** + `question_code` enum | 結構穩、有統計、有跨模組關注 |

#### F) Tab 3 — 技師深入檢查（N 項，可動態增減）

| 性質 | 選擇 | 理由 |
|---|---|---|
| 量級 | 一張 PI 5-20 項，量大 | — |
| 是否報表用 | ✅ 強烈會 — `safety_level` 分布、`category` 分布、`decision` rate（同意率 / 暫緩率 / 拒絕率）都是售後管理 KPI | 多軸統計 |
| 是否跨頁查 | ✅ 必然 — 直接落到 RO 維修項目（agree）/ 失銷追蹤（defer/reject）/ 增項閉環 / 結帳 / 售後 | 全 pipeline |
| 結論 | **typed 子表 `pre_inspection_tech_findings`** | **量大 + 多軸統計 + 全 pipeline 引用 → 子表是唯一合理選擇** |

⚠️ 重點：技師檢查項是這頁的「資料密集區」，**絕對不能丟 jsonb array**。雖然單張 PI 結構像 array、但：
- 後續模組要 `JOIN pre_inspection_tech_findings ON pre_inspection_id` 拉「所有 defer 的項」
- 失銷追蹤要 `WHERE decision IN ('defer','reject') AND safety_level = 1`
- 增項閉環要 `WHERE decision='defer' AND DATE(decided_at) <= now() - INTERVAL '3 days'`
- 這些 query 在 jsonb 上能跑但慢、且 NO type 提示、誤打 key 不會 fail

#### G) Tab 4 — 報價單合併行

| 性質 | 選擇 | 理由 |
|---|---|---|
| 量級 | SA 段 + 技師同意項加總，5-20 行 | — |
| 是否報表用 | ✅ 報表會用 `source='tech' AND decision='agree'` 統計「技師建議採納率」 | 統計 |
| 是否跨頁查 | ✅ 帶到 RO 維修項目（會被 03 維修項目零件明細 引用） | 下游 |
| 結論 | **typed 子表 `pre_inspection_quote_items`** + 帳合 typed columns 在主表 | 跟技師檢查同理由 |

→ 主表存 `estimated_labor_total / estimated_parts_total / estimated_tax / estimated_total`（快照、reporting 直接 sum 主表更快）；明細存子表給 audit。

#### H) 保固狀態（Tab 1 上方綠色 banner）

| 性質 | 選擇 | 理由 |
|---|---|---|
| 量級 | 4 個欄位（is_valid / type / start_at / expires_at + 里程限制） | — |
| 是否報表用 | ⚠️ 偶爾 — 「本月在保固期內進廠的比例」 | 弱統計 |
| 是否跨頁查 | ✅ 會 — RO 索賠類型勾選會用、結帳的折扣會用 | — |
| 是否形狀穩 | ⚠️ 還在演化 — 未來可能加入「保固類型 enum 擴張」「里程限制 enum」 | 形狀未定 |
| 結論 | **typed column `warranty_snapshot jsonb`**（jsonb 但放在 typed 主表上） | 形狀未完全穩、單頁專用快照、跨頁讀但只讀整包不 group by 內部 key |

→ 這是 **「typed column 但內容是 jsonb」** 的合理用法：欄位本身穩定（一定有保固快照）、內容結構未完全穩。將來如果 `is_valid` 被 4 頁以上 query，promote 成 `warranty_is_valid boolean` 即可。

#### I) 客戶標籤（Tab 2 全寬區塊）

| 性質 | 選擇 | 理由 |
|---|---|---|
| 屬主 | `customers` 表的屬性，不是 PI 的屬性 | — |
| 結論 | **獨立表 `customer_tags`**（外部表，本頁只是寫入入口之一） | 「12 客戶標籤主管設定」+ 「09 人車檔案」共讀 |

→ **不要把 tags 存在 `pre_inspections.metadata`**，否則 tag 變更時 N 張 PI 都要回頭改。Tag 屬人不屬單。

#### J) 簽名 / 上傳截圖

| 性質 | 選擇 | 理由 |
|---|---|---|
| 量級 | 一張 PI 最多 3 個 URL（SA 簽名 + 車主簽名 + 替代截圖） | — |
| 是否報表用 | ❌ | — |
| 結論 | **typed text column** (`sa_signature_url` / `customer_signature_url` / `customer_signature_proof_url`) | 欄位穩、單 URL、不會增減 |

→ 如果未來變成「多次簽名歷史」（如修改後重簽）才升 `pre_inspection_signatures` 子表。

#### K) 真的丟 `metadata jsonb` 的東西

只有以下純粹「單頁專用 / 變動中 / 純顯示」的：

- `metadata.ui_progress_persist`：tab 切換進度（如果要 server-side 記錄使用者最後停在哪 tab，用來「斷線恢復」）
- `metadata.line_alerted_supervisor`：是否已推過 LINE 給主管的標記
- `metadata.demo_seed`：demo 資料標記（POC 階段方便清資料）
- `metadata.signature_substitute`：車主沒在場用截圖代替的標記
- `metadata.recall_bulletin_no`：勾「公報召回」時記錄 NDCS 公報號碼（如 SRV-SRB-26-014）— 還在討論要不要結構化

### 4.3 結論彙整

> **環檢項目 / 來意問答 / 技師檢查 / 報價行 / 損傷標記點 — 全部走 typed 子表，不丟 jsonb array。**
>
> **唯一例外**是保固狀態（warranty_snapshot）— typed column 但內容是 jsonb，因為形狀還在演化、且只當整包讀寫不 group by 內部 key。
>
> jsonb metadata 只保留給「UI 狀態 / 推播標記 / demo seed 標記」這類真正單頁用的元資料。

**為什麼這頁要這樣**：

1. 量級不小（5+8+8+10+15 ≈ 一張 PI 約 50 個資料點），但每類量級可控、結構穩
2. 整條售後 pipeline 後續 5 個模組（RO / 維修項目 / 失銷追蹤 / 增項閉環 / 售後管理 / 結帳）都要 query 這頁的子資料 — **跨頁引用是「子表」決策的最重決定因子**
3. 報表需求明確：safety_level 分布、category 分布、purpose 分布、decision rate 都是售後管理 KPI 核心
4. PI confirm 後 immutable → 子表的 audit 性質強過動態性

**反例（如果丟 jsonb 會怎樣）**：

```sql
-- 想知道「本月所有 PI 中技師建議但客戶拒絕的高風險項」
-- 子表版（easy）
SELECT pi_id, title, diagnosis FROM pre_inspection_tech_findings
WHERE decision='reject' AND safety_level=1 AND DATE(created_at) >= '2026-05-01';

-- jsonb 版（painful + 慢）
SELECT pi.id, item->>'title', item->>'diagnosis'
FROM pre_inspections pi, jsonb_array_elements(pi.metadata->'tech_findings') item
WHERE item->>'decision'='reject' AND (item->>'safety_level')::int = 1
  AND DATE(pi.created_at) >= '2026-05-01';
-- 沒 index、type cast 痛苦、IDE 無自動完成、誤打 key 不報錯
```

---

## 5. 跨模組共讀 / 共寫盤點

| 模組 | 用 PI 什麼 | 方向 |
|---|---|---|
| 01 預約看板 | 反查 PI id（appointments.metadata.linked_pre_inspection_id）+ 切預約 status | 雙向 |
| 02 RO 工單 | 帶入 customer / vehicle / 環檢備註 / 車主原話 / 技師診斷 / 報價單 | 讀（confirm 後） |
| 03 維修項目零件明細 | 帶入 `pre_inspection_quote_items WHERE decision='agree'` 當預設 RO lines | 讀 |
| 05 增項閉環 | 取 `pre_inspection_tech_findings WHERE decision IN ('defer','reject')` 當失銷追蹤源 | 讀 |
| 06 竣工複檢 | 對照進廠 damage_marks（驗收新增損傷）+ 對照環檢項目（哪些已修復） | 讀 |
| 07 售後管理 | KPI 統計 (purposes / safety_level / decision rate / 平均預檢耗時) | 讀（aggregate） |
| 08 結帳收款 | 帶入 estimated_total + 保固快照（決定是否折扣 / 索賠） | 讀 |
| 09 人車檔案 | 寫客戶標籤回 customer_tags；vehicle.last_service_at 更新 | 寫（customer_tags / vehicles） |
| 10 工單查詢 | 列 PI list / 跨單據搜尋（VIN / 車牌 / 客戶名 / pi_code） | 讀 |
| 11 取車通知設定 | 取 SA / 車主聯絡資訊 + 預估完工時間 | 讀 |
| 12 客戶標籤主管設定 | 提供 preset tags + 🔒 鎖定規則 | 讀（customer_tag_presets） |

→ **PI 是售後模組第二多被引用的 entity**（第一是 RO）。typed 子表 + 適度 jsonb metadata 是讓所有下游模組能用簡單 JOIN 取資料的關鍵。

---

## 6. Schema 草案（Phase 2 才會寫到 migration、本提案只列）

主表 + 5 張子表 + 1 條 RLS 樣板（雙 brand 4 條 user_has_brand）：

```sql
-- 主表
CREATE TABLE pre_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  subsidiary_id uuid REFERENCES subsidiaries(id),
  store_id uuid REFERENCES organizations(id),
  pi_code text NOT NULL,
  issue_date date NOT NULL,
  sequence_no int NOT NULL,

  appointment_id uuid REFERENCES appointments(id),
  customer_id uuid REFERENCES customers(id),
  vehicle_id uuid REFERENCES vehicles(id),
  sa_id uuid REFERENCES employees(id),
  technician_id uuid REFERENCES employees(id),

  mileage_in int,
  warranty_snapshot jsonb,             -- ← typed column 但內容是 jsonb（§4.2 H）

  env_check_note text,
  customer_complaint text,
  purposes text[],                     -- ← typed array（§4.2 C）
  has_warranty_concern boolean DEFAULT false,

  estimated_labor_total numeric(12,2) DEFAULT 0,
  estimated_parts_total numeric(12,2) DEFAULT 0,
  estimated_tax numeric(12,2) DEFAULT 0,
  estimated_total numeric(12,2) DEFAULT 0,
  lu_rate numeric(10,2),

  status text NOT NULL DEFAULT 'draft',
  confirmed_at timestamptz,
  sa_signature_url text,
  customer_signature_url text,
  customer_signature_proof_url text,

  linked_ro_id uuid,
  cancelled_at timestamptz,
  cancellation_reason text,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (brand_id, pi_code)
);

CREATE INDEX ON pre_inspections (brand_id, status, issue_date);
CREATE INDEX ON pre_inspections (appointment_id);
CREATE INDEX ON pre_inspections (customer_id);
CREATE INDEX ON pre_inspections (vehicle_id);

-- 5 張子表（簡寫，欄位見 §1 entities）
CREATE TABLE pre_inspection_damage_marks (...);
CREATE TABLE pre_inspection_env_checks   (...);
CREATE TABLE pre_inspection_intake_qa    (...);
CREATE TABLE pre_inspection_tech_findings (...);
CREATE TABLE pre_inspection_quote_items   (...);

-- RLS（brand-aware，6 張表都套同樣 4 條）
ALTER TABLE pre_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY pre_inspections_select ON pre_inspections FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY pre_inspections_insert ON pre_inspections FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY pre_inspections_update ON pre_inspections FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY pre_inspections_delete ON pre_inspections FOR DELETE USING (user_has_brand(brand_id));
-- 子表 RLS：透過 pi_id JOIN 拿 brand_id（function 包一層 pi_brand(pi_id)）
```

> ⚠️ **本提案不寫實際 migration、不執行 DDL**。落地交給 Phase 4。

---

## 7. Domain Helper 規劃（Phase 4 才建檔）

預計檔案：

```
src/domain/pre-inspections.ts            -- 主 facade
src/domain/pre-inspections.constants.ts  -- enum: PIStatus / EnvCheckCode / IntakeQaCode / SafetyLevel
```

不在 `procurement.ts` / `org.ts` 等既有 facade — 售後是新領域、開新 facade。

⚠️ **重點規範**（依 SKILL 紀律）：

- `pre-inspections.ts` 走 `'use server'` → 只 export async function、所有 const / enum / type alias 移到 `.constants.ts`
- UI 一律 `import { createPreInspection } from '@/domain/pre-inspections'`，禁止 `import { createClient } from '@/lib/supabase/...'`
- Day 1 內部直連 supabase；推 LINE 副作用先 stub 成 `// TODO: dispatch(...)`、`after()` 包起來但不打 Hub

---

## 8. nav_nodes（雙 brand、Phase 4 才動）

PI 是 **流程內頁、不在 sidebar 列表**。實際 sidebar 入口在：

- 01 預約看板的「預檢」按鈕（router.push 到 `/aftersales/pre-inspections/[id]`）
- 10 工單查詢（list view 點 row 跳轉）
- 07 售後管理（dashboard 點 KPI 卡跳轉到對應 list）

→ **本頁不 INSERT 新的 nav_node**，URL 是內部 router 跳轉而已。

但子模組 nav `售後工單` 群組底下還是要在 Phase 4 補（依姊妹 ro / ro-lines 提案的規劃）。本提案不重複列。

---

## 9. Critical Files（Phase 4 才建）

```
DB:
  - migration: create pre_inspections + 5 子表 + RLS
  - generate_typescript_types → src/lib/database.types.ts

Domain:
  - src/domain/pre-inspections.ts
  - src/domain/pre-inspections.constants.ts

Page:
  - src/app/(workspace)/aftersales/pre-inspections/[id]/page.tsx (server)
  - src/app/(workspace)/aftersales/pre-inspections/[id]/_components/pre-inspection-wizard.tsx (client wizard)
  - src/app/(workspace)/aftersales/pre-inspections/[id]/_components/tab1-env-check.tsx
  - src/app/(workspace)/aftersales/pre-inspections/[id]/_components/tab2-intake.tsx
  - src/app/(workspace)/aftersales/pre-inspections/[id]/_components/tab3-tech-findings.tsx
  - src/app/(workspace)/aftersales/pre-inspections/[id]/_components/tab4-quote.tsx
  - src/app/(workspace)/aftersales/pre-inspections/[id]/_components/tab5-signature.tsx
  - src/app/(workspace)/aftersales/pre-inspections/[id]/_components/damage-marker-svg.tsx
  - src/app/(workspace)/aftersales/pre-inspections/[id]/_components/customer-tag-panel.tsx

Templates 新增（首例）:
  - .claude/skills/spec-to-feature/references/page-templates.md 補 Wizard Pattern
```

---

## 10. Verification（Phase 4 落地完手測；Phase 1 先列）

1. **SSOT 一致性**：PI confirm 後，所有子表都鎖定（INSERT/UPDATE 應 RLS or trigger 拒絕）、`appointments.metadata.linked_pre_inspection_id` 一定指向有效 PI
2. **跨模組共讀**：02 RO 開立頁能 SELECT 帶入 PI 資料；05 增項閉環能撈 `tech_findings WHERE decision IN ('defer','reject')`
3. **typed 子表 query**：`SELECT * FROM pre_inspection_tech_findings WHERE safety_level=1 AND decision='reject'` 走 index（不是 seq scan）
4. **warranty_snapshot jsonb**：能透過 `warranty_snapshot->>'is_valid'` 讀取、且整包讀寫不丟欄位
5. **PI immutable**：confirm 後 SA 試圖改 quote_items 應被擋
6. **wizard tab 切換**：5 個 tab 各自 autosave、切走切回資料不掉
7. **LU rate 從 business_rules 讀**：不能 hardcode
8. **客戶標籤跨單據共讀**：在 PI tab 2 加 tag、回到 09 人車檔案看得到
9. **車主簽名 vs 截圖代替**：兩種路徑都能 confirm
10. `npx tsc --noEmit` / `npx eslint <touched>` — 0 errors

---

## 11. 拍板紀錄（2026-05-16 Ming 對齊完畢）

> 8 題均已拍板。之後動工依本節答案執行、不再回頭問。

| # | 議題 | 決議 | 落地方向 |
|---|---|---|---|
| 1 | 失銷追蹤推播時機 | **D+3 提醒** | 寫 `pre_inspection_tech_findings.next_alert_at = decided_at + 3 days`；每日 cron 撈 `decision='reject' AND safety_level=1 AND next_alert_at <= now() AND alerted_at IS NULL`，推 LINE 給售後主管後寫 `alerted_at`。Notification Hub 已就緒、補新 event code `tech_finding.reject_alert`。 |
| 2 | 簽名替代覆核 | **主管覆核後放行** | 新 PI status：`pending_supervisor_review`。`signPreInspection(party='customer', proof_url=...)` 完成後 PI 進此狀態，僅 supervisor 能 `confirmPreInspection`（policy 層擋）。LINE 推主管「車主未在場、待覆核」。 |
| 3 | PI immutable 邊界 | **主管可解鎖補登** | 新 action `unlockPreInspection(pi_id, reason)`，僅 supervisor 可呼叫；UPDATE status='draft' + 寫 audit log（`pre_inspection_audit_events`）。再次 confirm 時走原流程。所有 unlock 事件 audit 永久保留、不可刪。 |
| 4 | 保固 → RO 索賠連動 | **自動勾 RO 索賠類型候選** | RO 開立頁讀 `pre_inspections.has_warranty_concern` 與 `warranty_snapshot.type`；若 true，預勾「保固索賠」checkbox + 帶入 type、SA 可手動取消。提示語：「PI 勾了疑似保固、已預選索賠類型，可取消」。 |
| 5 | 環檢 8 項 lookup | **主管 setting page**（動 lookup table） | 新 `business_rules.rule_kind='env_check_items'`，config jsonb 存 array of `{code, label, sort_order, is_active}`。新 setting page `/parts/aftersales/management/env-check-items`（inline edit / 啟停）。Wizard 改從 helper `listEnvCheckItems()` 讀、不再 hardcode `DEFAULT_CHECKS`。 |
| 6 | purposes shape | **typed 子表 `pre_inspection_purposes`** | 新表：`id / pre_inspection_id FK / purpose_code / added_by / added_at / note`。`pre_inspections.purposes text[]` 改為 deprecated（保留欄位但不寫、3 個 release 後砍）。Wizard 改用 `addPurpose / removePurpose`。 |
| 7 | warranty_snapshot promote | **升 `is_valid + expires_at + type`** | ALTER pre_inspections：ADD `warranty_is_valid boolean`、`warranty_expires_at date`、`warranty_type text`。Backfill from `warranty_snapshot` jsonb。`warranty_snapshot` 仍保留（剩 `start_at / mileage_limit / claim_history` 等次要欄位）。RLS / index 加在 `warranty_is_valid + brand_id`、給「本月在保 PI」報表用。 |
| 8 | 取消 PI 簽核 | **主管簽核（進 pending_cancel）** | 新 status `pending_cancel`。`cancelPreInspection(pi_id, reason)` 改成「請求取消」、UPDATE status='pending_cancel'，推 LINE 給主管；主管 `approveCancellation` → cancelled、`rejectCancellation` → 原 status。所有取消事件寫 audit。 |

### 落地優先序（拍板後規劃）

**Wave A — 低成本立刻落（< 2 hr）**：
- Q4：保固聯動（RO 頁 +1 useEffect、條件預勾 checkbox + amber 提示）
- Q5：env-check items 走 business_rules + 補小 setting page（4 顆按鈕：新增 / 改 label / 改順序 / 啟停）

**Wave B — 流程改動（每項 2-4 hr）**：
- Q2：`pending_supervisor_review` status + supervisor approve UI + LINE 推送
- Q3：`unlockPreInspection` action + audit table + supervisor unlock button
- Q8：`pending_cancel` status + 主管 approve / reject UI + LINE 推送

**Wave C — Schema 改 + 既有 row 遷移（4-8 hr）**：
- Q6：建 `pre_inspection_purposes` 子表 + 遷移既有 `purposes text[]` 資料 + UI 改 helper
- Q7：ALTER + backfill from jsonb + RLS / index + 改 wizard 寫入點

**Wave D — Cron 工程（4-6 hr）**：
- Q1：tech_findings 加 `next_alert_at + alerted_at` 欄位 + scheduled job + Notification Hub event code

> 上面 4 wave 加總 ~16-24 hr 工程。Ming 拍板後分次落、不要一輪全推（policy 改 + schema migration + cron 起風險太集中）。

---

## 12. 邊界（不適用的部分 / 不歸本頁）

| 不歸本頁 | 歸屬 |
|---|---|
| PI list view（多角度搜尋） | 10 工單查詢 + 07 售後管理 |
| RO 開立 / P1-P2 前綴選擇 | 02 正式工單 RO |
| 維修項目零件明細編輯 | 03 維修項目零件明細 |
| 領料雙簽 / 電子打卡 / 竣工複檢簽核 | 03 / 06 竣工複檢 |
| 客戶標籤主管預設清單管理 | 12 客戶標籤主管設定 |
| 取車通知模板 | 11 取車通知設定 |
| LU 單價設定 | business_rules（rule_kind='lu_rate'）+ master-data setting page |

⚠️ **04_RO 串接版（姊妹頁）的 PI 段不重複落 schema** — 共用本提案。它只負責「PI → RO 的 transfer overlay + 跳轉契約」+ RO 6 個 tab 的 schema 評估（後者再委派給 02 / 03 / 06）。

---

## 13. Phase 1 自評（依 SKILL 五階段紀律）

- ✅ 走完 Phase 1 動作（讀 HTML / 讀 reference / 抽 entities / actions / kpis / implied_pages）
- ✅ 雙 brand 提醒
- ✅ typed vs jsonb 評估到欄位粒度（§4 七大區塊）
- ✅ 跟姊妹頁的關係交代清楚（§2、§12 — 主張共用同表）
- ✅ 跨模組共讀盤點完整（§5 — 12 個下游模組）
- ✅ 列出 wizard pattern 是新範本需求（§1 implied_pages、§9 templates）
- ❌ 不寫 code / DB migration / 不動 git / 不動 nav_nodes / 不動 Notion（依用戶指示）

---

**Phase 1 終點。等用戶 review 後決定要不要進 Phase 2 架構提案（這份文件已經接近 Phase 2 規模、但開放問題還沒拍板）。**
