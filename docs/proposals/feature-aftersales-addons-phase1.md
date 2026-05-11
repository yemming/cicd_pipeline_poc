# 提案：售後工單模組 — 追加項目記錄（Addons）（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/04_追加項目記錄.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組目前只在 Ducati nav 樹下；Indian 視業務決定再補）
> 姊妹頁：
> - `feature-aftersales-overview-phase1.md`（00_導覽總覽）
> - `feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）
> - `feature-aftersales-appointments-phase1.md`（01_預約管理看板）
> - `feature-aftersales-ro-phase1.md`（02_正式工單 RO，**上游 parent**）
> - `feature-aftersales-ro-lines-phase1.md`（03_維修項目零件明細，**本頁的 line item SSOT**）
> - 05_增項閉環_完整子模組（**本頁的下游 receiver**；尚未開 Phase 1 提案）
>
> 🎯 **本提案的核心議題（caller 特別要求評估）**：
> 1. addon 的 line items 是否跟 03 的 ro_lines **共表** (`repair_order_*_items` + `source='addon'`)？還是**另開** `repair_order_addons_items`？
> 2. addon 跟 **05 增項閉環** 是什麼關係？04 哪些欄位該存在 addon entity / 哪些該存在 05 的閉環追蹤 entity？

---

## 0. 頁面定位（最重要）

這頁是 **RO 維修進行中（status='in_progress'），技師發現額外問題 → 提議追加項目 → 等車主決策**的記錄頁。性質介於 **list view + 決策流程編輯器**：

- 上游：02_正式工單 RO 已建立、03_維修項目零件明細已填、RO 進入「維修中」狀態
- 本頁職責：
  1. **技師建議卡片列表**（每張卡 = 一個追加提議）：項目名稱 / 類型（工項/零件/零件+工）/ 安全等級（一般/⚠️安全相關/🔴安全警示）/ 估計費用 / 確認方式 / 技師說明 + 狀態（待確認/車主同意/暫緩/拒絕）
  2. **新增追加項目 form**（技師填寫送出）
  3. **車主決策操作**：✅ 同意 / ⏸ 暫緩 / ❌ 拒絕→增項閉環 / 📦 庫存備料
  4. **費用變動摘要**（原始 + 追加 = 預估總金額，含稅）
- 下游：
  - **同意** → 寫入 03 的 `repair_order_labor_items` / `repair_order_part_items` (`source='addon'`)、庫存自動預留備料
  - **拒絕 / 暫緩 + 安全等級** → 觸發 05_增項閉環追蹤（變成跨工單長期追蹤案件，會出現在 05 的「待追蹤看板」）
  - **同意 + 有零件** → 觸發 `06_出庫管理_維修領料`（HTML 頂部 banner 已明示按鈕）
  - 06_竣工複檢 / 08_結帳收款 → 同意的追加項目併入 grand_total

**核心特徵**：

1. **這是一個「決策過程」記錄，不只是 line item 本身**：每個追加項目都有「技師建議 → 車主決策 → 結果」的時間軸（技師、時間、確認方式、車主決策、決策時間、拒絕原因），這些 envelope 欄位塞進 `repair_order_*_items` 會把 line table 弄髒
2. **狀態機**：`pending` (待確認) → `agreed` / `deferred` / `rejected`，狀態變化會 trigger 跨表副作用（庫存預留 / 增項閉環）
3. **安全等級**（safety_level）是 05 增項閉環的關鍵分流軸：🔴 安全警示**拒絕 / 暫緩**才會升級為「主管必須介入」的 case；一般項目拒絕只是失銷記錄
4. **類型可變**（工項 / 零件 / 零件+工）：一個 addon **可能對應 0、1、2 條 line item**：
   - 純工項 → 1 條 labor line
   - 純零件 → 1 條 part line
   - 零件+工 → 1 條 labor + 1 條 part（HTML 看不出來這時候費用怎拆，可能 envelope 只記估價、明細拆兩條）
   - 「拒絕」的 addon → **0 條 line item**（沒寫進 RO，但 envelope 留紀錄變失銷）
5. **確認方式**（電話口頭 / 現場本人 / Line 文字）是法務 / CRM 觸點，要存
6. **HTML 沒有「主管授權」 / 「估價超 N 元要審核」流程**，但業務上很可能 Phase 2 要加（跟 04 預檢的「主管聯絡」呼應）

**在售後流程中的定位**：**Phase 4.5「維修中追加處理頁」**。位於 03（初始明細）跟 06（竣工複檢）之間，是 RO 在維修中的**動態調整入口**。

⚠️ **本頁的關鍵設計決策**（Phase 2/3 拍板必選）：addon 跟 ro_lines / 05 增項閉環的「共表 vs 拆表」邊界。詳見 §3。

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

**主 entity（本頁負責 CRUD，建議新建）**：

```
repair_order_addons（追加項目 envelope）
  fields:
    - id uuid PK
    - brand_id text
    - ro_id uuid FK → repair_orders   # NOT NULL，addon 必歸屬一張 RO
    - addon_no int                     # 顯示用 #1 / #2（同 ro_id 內遞增）

    # 技師提議內容（建議時填）
    - name text                         # 項目名稱（例：後避震器油封更換）
    - addon_type text                   # 'labor' | 'parts' | 'labor_and_parts'
    - safety_level text                 # 'normal' | 'safety_related' | 'safety_critical'  ← 三段對映 HTML 的（一般/⚠️/🔴）
    - estimated_fee numeric(12,2)       # 技師當下估價（snapshot；同意後才真正算成 line subtotal）
    - tech_reason text                  # 技師說明（例：後避震器漏油，繼續騎乘恐導致避震功能失效）
    - proposed_by uuid FK → employees   # 提議技師
    - proposed_at timestamptz           # 提議時間（HTML 顯示 10:23）

    # 車主決策過程（決策時填）
    - confirm_method text               # 'phone' | 'onsite' | 'line'  ← 業務 / 法務 / CRM 軌跡關鍵
    - customer_decision text            # 'pending' | 'agreed' | 'deferred' | 'rejected'
    - customer_decision_at timestamptz
    - decided_by_sa_id uuid FK → employees  # 由哪位 SA 確認車主決策
    - decision_note text                # 車主回應原文 / SA 整理（例：「下次再處理」）

    # 拒絕 → 增項閉環的串接（rejected 或 deferred+safety 時填）
    - followup_case_id uuid             # FK → repair_order_followup_cases（05 提案要建的表，本提案先預留）
                                        # null = 暫不追蹤（一般項目拒絕，純失銷記錄不入閉環）
                                        # not null = 已立案進入 05 看板

    # 庫存預留（agreed 後填）— 跟 03 ro_lines 的 part_items 連動
    - reserved_at timestamptz           # 點 ✅ 同意後庫存自動預留的時點
    - reserved_movement_id uuid         # FK → inventory_movements (type='reserve_for_addon')

    - metadata jsonb DEFAULT '{}'::jsonb
      # 預期 keys：
      #   tech_finding_photo_url: string[]  # 技師發現照片（Phase 2 後）
      #   customer_call_recording_url: string  # 電話確認錄音（法規要求才存）
      #   suggested_part_no: string         # 技師建議料號（type='parts/labor_and_parts' 時）
      #   alt_options: object[]             # 替代方案（A：原廠 NT$3200 / B：副廠 NT$2400）
      #   recommended_from: 'pre_inspection_item_id'  # 來源（若 SA 預檢已標但當時車主沒答，這次又被技師再次發現）
      #   pricing_breakdown: { labor_fee, parts_fee }  # type='labor_and_parts' 時的拆分快照

    - created_by uuid, created_at, updated_at

  relationships:
    - { to: repair_orders, kind: 'fk' (ro_id) }
    - { to: employees, kind: 'fk' (proposed_by / decided_by_sa_id) }
    - { to: repair_order_followup_cases, kind: 'fk' (followup_case_id, 跨 05 提案) }
    - { to: inventory_movements, kind: 'fk' (reserved_movement_id) }
```

**引用 entities（不歸本頁落地）**：

- `repair_orders` → 02 提案落地（本頁的 parent）
- **`repair_order_labor_items` / `repair_order_part_items`** → **03 提案落地**（本頁同意後 INSERT，`source='addon'`，**共表**，見 §3.1）
- `repair_order_followup_cases` → 05 增項閉環提案待落地（本頁拒絕/暫緩時建立）
- `pre_inspection_items` → 04_預檢單提案落地（addon 可能由預檢項目升級而來，metadata.recommended_from 反查）
- `stock_items` / `inventory_movements` → 既有庫存模組（庫存預留副作用）
- `employees` → 既有
- `items` → 零件主檔（metadata.suggested_part_no 反查）

### actions

```
# 讀取
listAddonsByRo(ro_id) → Promise<{
  addons: (RepairOrderAddon & {
    proposed_by: Employee,
    decided_by_sa: Employee | null,
    linked_labor_lines: RepairOrderLaborItem[],   # 同意後關聯的 line（source='addon' + addon_id 反查）
    linked_part_lines: (RepairOrderPartItem & { current_stock: StockSnapshot })[],
  })[],
  cost_summary: {
    original_estimate: number,           # RO 原始估價（從 02）
    addons_pending: number,              # pending + deferred 的小計
    addons_agreed: number,               # agreed 的小計
    grand_total_if_all_agreed: number,   # 全同意預估含稅總額（HTML 右下「NT$11,970」）
  },
  followup_alerts: {                     # safety_level='safety_critical' 且 customer_decision in (deferred, rejected) 的告警
    addon_id, name, safety_level, days_since_decision,
  }[],
}>

# 建立提議（技師 / SA 點「送出追加項目」）
createAddon(input: {
  ro_id, name, addon_type, safety_level,
  estimated_fee, tech_reason,
  confirm_method,                        # 預填，但車主決策時可改
  metadata?: {...}
}) → Promise<Result<{ id: string }>>
  # 副作用：純寫單表 + 通知 SA「有新追加待確認」（[需確認] 範圍）
  # customer_decision 預設 'pending'

# 修改提議（技師 typo / 估價調整）
updateAddon(id, patch) → Promise<Result>
  # 僅 customer_decision='pending' 時允許改；已決策後不准改

# 取消提議（技師建錯）
cancelAddon(id) → Promise<Result>
  # soft delete 或 status='cancelled'；customer_decision='pending' 才能取消

# 車主決策（核心 action）
decideAddon(id, decision: {
  customer_decision: 'agreed' | 'deferred' | 'rejected',
  confirm_method,
  decision_note?: string,
}) → Promise<Result>
  # 副作用密度極高，依 decision 三向分支：
  #
  # === agreed ===
  # A. 跨表事務（必原子）：
  #   1. UPDATE repair_order_addons (customer_decision, ..., reserved_at)
  #   2. 依 addon_type 寫 line items（共表，源 'addon'）：
  #      - 'labor'             → INSERT 1 條 repair_order_labor_items (source='addon')
  #      - 'parts'             → INSERT 1 條 repair_order_part_items  (source='addon')
  #      - 'labor_and_parts'   → INSERT 2 條（各一）— 費用依 metadata.pricing_breakdown 拆
  #   3. 對 part line：依 §3.1 扣帳時點（推薦 B 領料時扣）→ 此刻只 INSERT inventory_movements (type='reserve_for_addon') 預留
  #   4. UPDATE stock_items.reserved += qty（不動 on_hand）
  #   5. after() 通知技師「車主同意，請繼續維修」+ 通知採購（若缺料）
  #
  # === deferred ===
  # B. 條件分支：
  #   - safety_level ∈ (safety_related, safety_critical) → INSERT repair_order_followup_cases (case_kind='deferred')
  #     → followup_case_id 寫回本表
  #   - safety_level = 'normal' → 純更新 envelope，不入閉環
  #   - 不寫 line items（暫緩 = 還沒同意 = 不算進 RO 帳）
  #
  # === rejected ===
  # B. 跨表寫入（兩種子情境）：
  #   - safety_level = 'safety_critical' → 強制 INSERT repair_order_followup_cases (case_kind='rejected_safety')
  #                                       + 推 LINE 給主管（主管介入規則來自 05 的「🔴 必介入」）
  #   - safety_level = 'safety_related' → INSERT repair_order_followup_cases (case_kind='rejected_advisory')
  #                                       + D+3 / D+10 提醒任務
  #   - safety_level = 'normal'         → 純失銷記錄（envelope 記 rejected，不入 05 看板）
  #   - 不寫 line items
  #
  # ⚠️ 三種決策都會走 after(() => notifications.dispatch(...))，event code [需確認]
  #     候選：addon.agreed / addon.deferred / addon.rejected_safety / addon.rejected_normal

# 庫存備料（agreed 後可手動 trigger 領料 — HTML 顯示「📦 庫存備料」按鈕）
prepareAddonParts(addon_id) → Promise<Result>
  # 不是「即時扣帳」，是「跳轉到 06_出庫管理_維修領料 帶 addon_id」的 UX 入口
  # 實際扣帳走 ro-lines 的 issuePartLine(part_item_id, ...)
  # → 這個 helper 可能不需要存在，UI 直接 router.push('/parts/aftersales/issuance?ro_id=X&addon_id=Y')

# 升級到 05 增項閉環（手動 trigger，給 SA 把 rejected/normal 升上去）
escalateToFollowup(addon_id, reason: string) → Promise<Result<{ followup_case_id: string }>>
  # B 跨表事務：
  #   1. INSERT repair_order_followup_cases (case_kind='manual_escalate')
  #   2. UPDATE repair_order_addons SET followup_case_id = ...
  #   3. after() 通知主管
```

**[需確認] 副作用**（Phase 3 拍板）：

| 動作 | 推測副作用 | 確定性 |
|---|---|---|
| createAddon | 通知 SA / 主管「有新追加待確認」 | [需確認] 範圍 + event code |
| decideAddon (agreed) | 即時 reserve stock 還是不 reserve？（跟 ro-lines §3.1 扣帳時點連動） | [需確認，跟 03 提案一起拍板] |
| decideAddon (agreed) | INSERT line items：addon_id 該不該存在 line 表？（共表+標籤 vs 共表+反查欄） | [需確認，§3 重點] |
| decideAddon (agreed, type='labor_and_parts') | 費用怎麼拆 labor / parts？metadata.pricing_breakdown 強制要填？ | [需確認] |
| decideAddon (deferred, normal) | 一般項目暫緩要不要入閉環？業務上「下次再說」可能要 D+30 提醒？ | [需確認] |
| decideAddon (rejected, safety_critical) | 是否強制要主管錄音 / 簽核才能登 rejected？或 SA 可以直接登？ | [需確認，可能要 RBAC `addon.reject_safety`] |
| decideAddon | 是否強制錄音 / 拍照存證（safety_critical 拒絕）？storage bucket / metadata 怎放？ | [需確認，可能涉及法規] |
| escalateToFollowup | 哪些角色可以手動升級？SA / 店長 / 主管？走 RBAC 還是 business_rules？ | [需確認] |
| cancelAddon | 技師取消已建的 addon 是否要記 audit log？soft delete 還是真刪？ | [需確認，建議 soft delete] |
| updateAddon | 已決策的 addon 是否能改 estimated_fee？業務上「車主同意 NT$3200，技師後來發現要 NT$4000」怎處理？ | [需確認，可能要新建 addon 不准改] |
| 整頁 | 全部副作用同 ro-lines 的並發控制：同一張 RO 兩個 SA 同時操作 → optimistic concurrency？ | [需確認，跟 03 一起拍板] |

### kpis

本頁本身沒有 KPI scorecard（純功能頁）。但 envelope 落地後，下游 KPI 來源：

- **05 增項閉環**：count(addons WHERE customer_decision in (deferred, rejected) AND safety_level != 'normal' AND followup_case_id IS NOT NULL)
- **05 整店統計**：失銷金額（rejected 的 estimated_fee 加總）、主管介入數、SA 追蹤回收率
- **07 售後管理**：本月追加同意率（agreed / total）、平均追加金額、安全項目拒絕率
- **08 結帳收款**：grand_total = 03 initial + 04 agreed_addons（拒絕 / 暫緩的不計）
- **庫存報表**：本頁 `reserve_for_addon` movement 的 reserved stock 統計（區分 RO 預留 vs 採購補貨在途）

⚠️ **本頁是「同意率」/「失銷率」/「主管介入率」這三個售後核心 KPI 的單一資料源**。

### implied_schema

```sql
-- addon envelope（新表）
CREATE TABLE repair_order_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  ro_id uuid NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  addon_no int NOT NULL,

  -- 提議
  name text NOT NULL,
  addon_type text NOT NULL,                        -- 'labor' | 'parts' | 'labor_and_parts'
  safety_level text NOT NULL DEFAULT 'normal',     -- 'normal' | 'safety_related' | 'safety_critical'
  estimated_fee numeric(12,2) NOT NULL,
  tech_reason text NOT NULL,
  proposed_by uuid REFERENCES employees(id),
  proposed_at timestamptz NOT NULL DEFAULT now(),

  -- 車主決策
  confirm_method text,                              -- 'phone' | 'onsite' | 'line'
  customer_decision text NOT NULL DEFAULT 'pending',-- 'pending' | 'agreed' | 'deferred' | 'rejected' | 'cancelled'
  customer_decision_at timestamptz,
  decided_by_sa_id uuid REFERENCES employees(id),
  decision_note text,

  -- 跨表反查
  followup_case_id uuid,                            -- FK → repair_order_followup_cases (05 提案)
  reserved_at timestamptz,
  reserved_movement_id uuid,                        -- FK → inventory_movements

  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (ro_id, addon_no)
);

CREATE INDEX ON repair_order_addons (brand_id, ro_id);
CREATE INDEX ON repair_order_addons (brand_id, customer_decision, safety_level) WHERE customer_decision != 'pending';
CREATE INDEX ON repair_order_addons (followup_case_id) WHERE followup_case_id IS NOT NULL;
CREATE INDEX ON repair_order_addons (proposed_by, customer_decision);

-- RLS 4 條（依 memory「多品牌 Schema Pattern」）
ALTER TABLE repair_order_addons ENABLE ROW LEVEL SECURITY;
-- repair_order_addons_{select,insert,update,delete} USING/WITH CHECK (user_has_brand(brand_id))

-- 共表的 ro_lines 要對映 addon（讓「同意後寫進 line」反查得到）：
-- 推薦：03 提案的 repair_order_labor_items / repair_order_part_items 既有 source='addon'，
--      多加一個 source_ref_id uuid 反查到 repair_order_addons.id
--      （typed column，因為要 audit、要 cascade、要 query）
ALTER TABLE repair_order_labor_items
  ADD COLUMN source_ref_id uuid;   -- when source='addon' → REFERENCES repair_order_addons(id)
                                   -- when source='followup' → REFERENCES repair_order_followup_cases(id)
                                   -- when source='initial' → NULL
CREATE INDEX ON repair_order_labor_items (source, source_ref_id);

ALTER TABLE repair_order_part_items
  ADD COLUMN source_ref_id uuid;
CREATE INDEX ON repair_order_part_items (source, source_ref_id);
```

**typed vs jsonb 分類**（依 `references/field-classification.md`）：

| 欄位 | 落腳 | 理由 |
|---|---|---|
| ro_id / brand_id / addon_no | typed | FK / RLS / 排序 |
| name / addon_type / safety_level | typed | 報表 / KPI group by 軸 / 狀態機 |
| estimated_fee | typed | 結帳 / 統計加總 |
| tech_reason / decision_note | typed | text，業務內容核心、會被 search、不算稀疏 |
| proposed_by / proposed_at | typed | 時間序、報表（哪位技師建議最多 / 同意率） |
| confirm_method | typed | KPI 軸（電話 vs Line 同意率），enum constraint |
| customer_decision | typed | **狀態機核心**，多頁 query 軸 |
| customer_decision_at / decided_by_sa_id | typed | 時間序、報表（SA 平均處理時間） |
| followup_case_id | typed | FK 跨表反查 05 閉環，audit 用 |
| reserved_at / reserved_movement_id | typed | FK 跨表反查庫存，audit 用 |
| metadata.tech_finding_photo_url | jsonb | 稀疏（不是每筆都有照片），單頁顯示 |
| metadata.customer_call_recording_url | jsonb | 法規 / 法務才會看，稀疏 |
| metadata.suggested_part_no | jsonb | 稀疏（純工項 addon 沒有），且最終會 promote 到 part_items.part_no（同意後）|
| metadata.alt_options | jsonb | 變動形狀（A/B/C 方案數量不定）|
| metadata.recommended_from | jsonb | 純記錄來源環節 |
| metadata.pricing_breakdown | jsonb | 只有 type='labor_and_parts' 才有，稀疏 |

**依賴的 entity / 表**（需先存在或同時落地）：

- `repair_orders` — 02 提案中
- `repair_order_labor_items` / `repair_order_part_items` — 03 提案中（本頁 agreed 時 INSERT，**共表**）
- `repair_order_followup_cases` — 05 提案未開始（本頁 deferred/rejected+safety 時 INSERT）
- `pre_inspection_items` — 04_預檢提案中（metadata.recommended_from 反查）
- `stock_items` / `inventory_movements` — 既有
- `employees` — 既有

### implied_pages

| 頁面 | 路徑（建議） | 類型 | 範本 | 備註 |
|---|---|---|---|---|
| **追加項目記錄**（本頁） | `/parts/aftersales/repair-orders/[id]/addons` | **客製 list + form 編輯頁** | 不適用標準 List/Page View | 上方 banner + 卡片列表 + 新增 form + 費用變動摘要 |
| 替代路由（tab）| `/parts/aftersales/repair-orders/[id]?tab=addons` | tab 內容區 | — | 跟 02 / 03 的「RO 詳情頁分頁」決策連動 |

⚠️ **本頁不能直接套 canonical items-board / item-detail-view**：

- 視覺上是「卡片列表」（每張卡 = 一個 addon）+ 新增 form + 費用摘要，不是表格 list
- 但「卡片列表」可以用 `<DataGrid>` 客製化嗎？— 不建議，卡片有複合 header（圖示 + 名稱 + 多個 badge）+ 內嵌 action row（同意/暫緩/拒絕/備料）+ 展開狀態，純 grid 套不下
- 建議：寫成獨立 client component `addons-board.tsx`，視覺照 HTML 維持「卡片堆疊」

頁面結構骨架：

```
[top banner: 🔗 與庫存模組串接 + → 維修領料按鈕]
[meta row: 工單號 MN-CP-260508-003 + badge「🔄 維修中・有 N 筆追加待確認」 + 返回工單]
[alert: ⚠️ 技師發現額外問題，需要車主確認 + 確認方式說明]

[sec-title: ➕ 追加項目列表]
  <AddonCard 1: 待確認> ── action row [✅同意][⏸暫緩][❌拒絕→閉環][📦備料]
  <AddonCard 2: 車主同意>
  <AddonCard 3: 拒絕 → 已升 05>      ── 顯示 followup_case_id link
  ...

[card-blk: 📝 新增追加項目（form）]
  項目名稱 / 類型 / 安全等級 / 估計費用 / 確認方式 / 技師說明
  [送出追加項目]

[card-blk: 📊 費用變動摘要]
  原始工單金額 + 追加小計 = 預估總金額（含稅）
```

---

## 2. 在售後流程中的定位摘要

| 階段 | 對映 HTML | 對映 entity | 串接關係 |
|---|---|---|---|
| Phase 1 預約進廠 | 01 | appointments | 上游 |
| Phase 2 SA 預檢 | 04_v3 | pre_inspections + pre_inspection_items | 上游（addon 可由預檢項目升級而來）|
| Phase 3 RO 成立 | 02 | repair_orders | 上游 parent |
| Phase 4 維修項目落地 | 03 | repair_order_*_items (source='initial') | 上游兄弟 |
| **Phase 4.5 追加項目記錄**（本頁） | **04** | **repair_order_addons (envelope) + repair_order_*_items (source='addon') 共表** | **本頁負責 envelope CRUD + 同意時寫共表 + 拒絕時觸發 05** |
| Phase 4.6 增項閉環 | 05 | repair_order_followup_cases | 下游 receiver |
| Phase 5 竣工複檢 | 06 | final_inspections | 讀 03 + 04 agreed 工項 |
| Phase 6 結帳關單 | 08 | payments / invoices | 讀 03 + 04 agreed 全部 line 結算 |

**核心定位**：本頁是售後模組的 **Phase 4.5「維修中追加處理頁」**，性質為**決策過程記錄器 + line items 寫入閘**。是「技師現場發現問題 → 車主決策 → 進 RO 或進閉環」的單向漏斗。

---

## 3. 核心議題：共表 vs 拆表（caller 特別要求評估）⚠️

### 3.1 addon 跟 03 ro_lines：**共表 + envelope 補強**（推薦）

**三種方案比較**：

| 方案 | 描述 | 優點 | 缺點 |
|---|---|---|---|
| **A. 純共表（紀律派）** | 不建 envelope 表。所有 addon 直接寫進 `repair_order_*_items`，用 `source='addon'` 標記 + metadata 塞「決策過程」（tech_reason / confirm_method / customer_decision / safety_level） | schema 最少；line 永遠是 SSOT，08 結帳超簡單 | metadata 變成業務邏輯主體（safety_level / customer_decision 要 query），違反「jsonb 給變動 / 稀疏 / 單頁專用」原則；**「拒絕」addon 怎辦？line 不存在但 envelope 該留紀錄做失銷統計** → 拒絕的 addon 也得寫 line 然後標 status='rejected'？line 表會被污染 |
| **B. 純拆表（純潔派）** | `repair_order_addons_items` 完全獨立表，跟 03 的 ro_lines 不共生。同意後 **複製** 一份 line 到 addons_items；08 結帳要 union 三張表（labor + parts + addons） | addon envelope 跟 line 不混；安全 | line 數據碎在兩處，08 / 06 / 07 都要 union 查；違反「rules 一張表打天下」精神延伸；source='addon' 標記失去意義 |
| **C. 共表 + envelope 補強**（推薦） | **envelope（repair_order_addons）** 記決策過程；**line（repair_order_*_items）** 共表，`source='addon'` + 新增 `source_ref_id` typed column 反查 envelope。**「拒絕」的 addon 只有 envelope、沒 line**（envelope 完全可以獨存） | envelope 跟 line 各司其職（流程 vs 帳）；下游報表照樣只查 ro_lines；envelope 表體積小、只進來 query 失銷 / KPI；雙向反查清楚 | 多一張表 + 一個 ADD COLUMN |

**選 C 的理由**：

1. **「拒絕」addon 是失銷記錄的核心**，但拒絕意味著「沒有對應的 line item」。如果走 A，要在 line 表新增「rejected line」概念污染 03 提案的乾淨 status machine；如果走 B，line 跟 envelope 分離。C 讓 envelope 獨存代表決策事件、line 只在同意時生成，語意最乾淨。
2. **estimated_fee 跟 line 的 labor_fee + subtotal 是兩個世代**：技師估價時可能 NT$3200，但同意後實際開立 line 可能依公司定價表轉成 NT$2800（labor）+ NT$580（part）。envelope 留住技師原始估價（重要的 KPI：估準率），line 留實際開立金額（結帳真實值）。混在一張表會 overwrite。
3. **`source` + `source_ref_id` 是延展性開關**：05 增項閉環之後也可能寫 line（`source='followup'` + `source_ref_id` 指 followup_case_id）；未來保固索賠 ro_lines 可能 `source='warranty'`；這個欄位是售後模組所有 line 來源的反查 SSOT。
4. **重用 ro-lines 提案的 11 個 helper**：addPartItem / addLaborItem / issuePartLine / returnPartLine 一行不改，只是被 decideAddon 內部 call（傳 source='addon' + source_ref_id=addon.id）。零重複實作。

→ **Phase 2 提案時推薦走 C。** Phase 3 拍板要跟 user 確認此邊界。

### 3.2 addon 跟 05 增項閉環：**1:1 reference**（推薦）

**05 增項閉環的本質**（從 HTML 看）：

- 看板：列出所有「車主拒絕 / 暫緩」的 **safety 等級項目**（一般項目不入）
- 時間軸：D0（建立失銷）→ D+3（SA 一次提醒）→ 主管介入（必）→ D+10（SA 二次聯繫）→ 長期追蹤
- 結案出口：✅ 車主同意 → 建立預約 → 觸發新 RO + 04 重來；或 標記長期追蹤 / 已聯繫無回應

**05 的 entity 候選**（不在本提案範圍，但要對齊）：

```
repair_order_followup_cases（05 落地）
  - id uuid PK
  - brand_id text
  - source_addon_id uuid FK → repair_order_addons   # 1:1，反查 04
  - case_kind text                                   # 'deferred' | 'rejected_safety' | 'rejected_advisory' | 'manual_escalate'
  - status text                                      # 'open' | 'manager_intervened' | 'rebooked' | 'long_term' | 'closed_no_response'
  - manager_intervened_at / manager_intervened_by
  - rebooked_appointment_id uuid                     # 同意回廠 → 建立新 appointment
  - metadata jsonb                                   # timeline events / SA 聯繫紀錄 / 主管錄音
  - ...
```

**兩者關係 — 1:1 reference**：

- 一個 addon `customer_decision in (deferred, rejected)` 且 `safety_level != 'normal'` → INSERT 一筆 followup_cases，雙向 FK：
  - `addons.followup_case_id` → followup_cases.id
  - `followup_cases.source_addon_id` → addons.id
- 一般項目（safety_level='normal'）的拒絕：**只更新 addon envelope，不入 05 看板**。05 看板只查 `followup_case_id IS NOT NULL` 的部分。
- 05 案件結案後若「車主同意回廠」→ **建一筆新 appointment + 新 RO**（不是改舊 RO 的 addon），舊 addon 維持 rejected 狀態（這是該次決策的歷史快照）。

**為什麼 1:1 而不是 1:N**：

- 一個追加項目對應一個追蹤案件，業務上不會「同一個 addon 拒絕了開兩個追蹤」
- 反之 1:1 讓 05 看板的「來源工單 / 來源 addon」永遠 traceable，不會走丟

⚠️ **05 提案時若要走別的設計**（例如 followup_cases 不 reference addon，而是 reference RO + 自由文字描述）→ 本提案要回頭調整 `addons.followup_case_id` 設計。**Phase 3 拍板時 04+05 應該一起問**。

### 3.3 反向影響 03 提案：建議補一個 ALTER

03 提案的 `repair_order_labor_items` / `repair_order_part_items` 目前只有 `source text` 欄位，沒有反查 envelope 的欄位。本提案推薦：

```sql
ALTER TABLE repair_order_labor_items
  ADD COLUMN source_ref_id uuid;   -- polymorphic FK by source
CREATE INDEX ON repair_order_labor_items (source, source_ref_id);

ALTER TABLE repair_order_part_items
  ADD COLUMN source_ref_id uuid;
CREATE INDEX ON repair_order_part_items (source, source_ref_id);
```

意義：

| source | source_ref_id 指向 | 寫入時機 |
|---|---|---|
| 'initial' | NULL | 03 頁面 CRUD |
| 'addon' | repair_order_addons.id | 04 decideAddon (agreed) |
| 'followup' | repair_order_followup_cases.id | 05 案件「車主同意回廠」後若不開新 RO 而是補進舊 RO（少見但業務上可能）|
| 'warranty' | warranty_claims.id（未來保固模組） | warranty 模組 |

→ **Phase 2 提案落地時，03 跟 04 必須一起 migration**（一條 CREATE TABLE addons + 兩條 ALTER COLUMN source_ref_id）。或 03 提案先補 source_ref_id 欄位，04 提案晚一步建 addons 表。

---

## 4. 副作用清單（彙整）

| 動作 | 副作用類型 | 細節 | 確定性 |
|---|---|---|---|
| listAddonsByRo | F Cache | 進頁 fetch；revalidatePath 在 CRUD 後觸發 | 預設處理 |
| createAddon | 無 / B 通知 | 純寫單表 + 可能推 LINE 給 SA「有新追加待確認」 | [需確認] 通知範圍 |
| updateAddon | 無 | 純寫單表（限 pending） | 確定 |
| cancelAddon | D Audit | soft delete + 記誰取消、何時 | [需確認] |
| **decideAddon (agreed)** | **A 跨表事務（必原子）** | UPDATE addons + INSERT ro_lines (source='addon') + INSERT inventory_movements (reserve) + UPDATE stock_items.reserved | **確定 + [需確認] reserve 時點（跟 03 §3.1 連動）** |
| **decideAddon (agreed)** | **B 通知** | 推 LINE 給技師「車主同意請繼續維修」；推 LINE 給採購（若缺料） | **[需確認] 範圍 + event code** |
| decideAddon (deferred) | A 跨表（條件） | safety_level != 'normal' → INSERT followup_cases | 條件確定 + [需確認] safety_level='normal' 暫緩要不要 D+30 提醒 |
| **decideAddon (rejected, safety_critical)** | **A 跨表 + B 通知 + C 業務規則** | INSERT followup_cases (case_kind='rejected_safety') + 推 LINE 給主管 + 可能要求錄音 / 簽核 | **確定 + [需確認] RBAC `addon.reject_safety` + 錄音強制？** |
| decideAddon (rejected, safety_related) | A 跨表 | INSERT followup_cases (D+3/D+10 提醒任務) | 確定 + [需確認] 提醒任務怎排（n8n? cron?）|
| decideAddon (rejected, normal) | D Audit | 純失銷記錄，不入閉環 | 確定 |
| prepareAddonParts | F UX | 跳轉到 06 領料頁，沒副作用 | 確定 |
| escalateToFollowup | A 跨表 + B 通知 | 手動把 normal 失銷升 05；通知主管 | [需確認] RBAC |
| 整頁 | A 並發 | 同 RO 兩個 SA 同編：optimistic concurrency / advisory lock？ | [需確認，跟 03 一起] |
| 整頁 | E 外部 | NetSuite GL：addon agreed 後 line 進 GL，依 RO prefix_p1/p2 拆科目 | [Phase 3 後再做] |
| 整頁 | E 外部 | LINE Pay 預收訂金（safety_critical 同意後要不要先收訂金）？ | [Phase 4 後再做，可能不做] |

⚠️ **本頁副作用密度跟 03 同級**（庫存 + 通知 + 業務規則 + RBAC + audit + 並發 + 跨閉環）。Phase 2 提案前要先確認：

1. 03 ro-lines 的 §3.1 扣帳時點選了哪個方案（A/B/C）→ 本頁 decideAddon (agreed) 內部行為跟著走
2. 05 增項閉環的 entity 是否已落地或同時落地 → followup_case_id FK target 才能成立
3. 既有 inventory_movements 是否有 `reserve_for_addon` 這個 type（或可擴展）

---

## 5. 建議落地型態（給 Phase 2 / Phase 3 用戶拍板）

| 方案 | 描述 | 適合場景 |
|---|---|---|
| **A. 最小可用版** | envelope 表（repair_order_addons）+ CRUD + decideAddon 但**所有副作用先 stub**（agreed 時不寫 ro_lines、不 reserve stock；rejected 不入 05）+ 純 UI 列表 | 用戶要快速串通 02→03→04→05→06→08 雛形先看完整骨架 |
| **B. 推薦版** | A + decideAddon (agreed) 寫 ro_lines (共表，source='addon', source_ref_id) + 不 reserve（跟 03 推薦的「領料時扣」對齊）+ rejected/deferred 寫 followup_cases (假設 05 同步落地) + 通知留 placeholder | 推薦。把 04↔03↔05 串接最重要的環節打通；通知 / 自動補單 / 主管錄音先 hook 留 placeholder |
| **C. 完整版** | B + 通知 LINE 給技師/主管/採購 + 主管錄音 storage 上傳 + 自動 D+3/D+10 提醒任務 + 主管授權 RBAC + 並發鎖 | 過度設計，應在 05 + RBAC + n8n 提醒 + storage policy 都成熟後再做 |

**Phase 1 推薦傾向 B**（但 05 必須先 / 同時落地，否則 followup_case_id 沒地方指）：

- DB 層：`repair_order_addons` 新表 + `ro_lines` 兩張表 ADD COLUMN `source_ref_id` + RLS
- Helper：`src/domain/aftersales-addons.ts`（或併入 `src/domain/aftersales.ts` 看 03 提案怎切）
  - listAddonsByRo / createAddon / updateAddon / cancelAddon / decideAddon / escalateToFollowup
- UI：`/parts/aftersales/repair-orders/[id]/addons` client view（卡片列表 + 新增 form + 費用摘要）
- 跟 03 共用 ro-lines 的 helper（addLaborItem / addPartItem）— 在 decideAddon 內部 call
- 副作用先留 hook：通知 / 主管錄音 storage / 自動提醒任務 placeholder

### 雙 brand 考量

- `brand_id` 從 ro_id 反查 / session 取
- RLS 4 條
- nav_nodes：本頁是 RO 詳情頁的子路由，**不獨立進 nav 樹**（從 RO 詳情頁進入；可能跟 03 ro_lines 共用 tab 容器）
- 雙 brand 政策差異：「safety_critical 拒絕要不要主管錄音」可能 Ducati 嚴格、Indian 寬鬆 → 走 `business_rules` (rule_kind='addon_rejection_policy')

---

## 6. 已避開的陷阱（紀律檢查）

- ✅ **明確區分 envelope（決策過程） vs line（帳上實體）**，不混塞 metadata
- ✅ **共表 + source + source_ref_id**（呼應「規則類用 business_rules 一張表」的精神延伸到 line 表）
- ✅ **拒絕 addon 不寫 line item**，避免污染 03 的乾淨 status machine
- ✅ **estimated_fee 是技師原始估價的 snapshot**，跟 line 的實際金額分離（保留「估準率」KPI 資料源）
- ✅ **safety_level 是 typed enum**，不丟 metadata（KPI / 看板 query 軸）
- ✅ **confirm_method 是 typed enum**，不丟 metadata（法務 / CRM 軌跡）
- ✅ **跟 05 的 1:1 reference 設計**，避免「同一 addon 拒絕了開兩個追蹤」的歧義
- ✅ **意識到 type='labor_and_parts' 會生 2 條 line**，metadata.pricing_breakdown 預留費用拆分快照
- ✅ **意識到「同意後可改估價」是業務反例**（建議不准改、要改開新 addon）
- ✅ **意識到 reserve_for_addon 是新 movement type**（既有 inventory_movements 可能要擴 enum）
- ✅ **沒擅自決定通知 event code**（addon.agreed / addon.rejected_safety 都留 [需確認]）
- ✅ **沒擅自決定 D+3/D+10 提醒由誰排程**（n8n cron / db trigger / Next 16 after()？留 05 拍板）
- ✅ **意識到雙 brand 政策差異**（safety 拒絕的主管介入規則走 business_rules）
- ✅ **沒 commit、沒動 nav_nodes、沒動 DB、沒寫 code**（依任務指示停在 Phase 1）

---

## 7. Phase 2 應該問用戶的問題（給下一階段預留）

> ⚠️ 本任務不執行 Phase 2，僅列出供下次 session 使用。

1. **共表 vs 拆表**（§3.1 三選一）：A 純共表 / B 純拆表 / **C 共表+envelope**（推薦）？影響整個售後 line 體系。
2. **`source_ref_id` 是 03 提案補做還是 04 提案補做**？建議 03 提案先補欄位（typed column ADD COLUMN），04 提案晚一步建 addons 表。
3. **跟 05 增項閉環 entity 1:1 設計確認**：`addons.followup_case_id` ↔ `followup_cases.source_addon_id` 雙向 FK，05 看板只查 `followup_case_id IS NOT NULL`，是否同意此邊界？
4. **type='labor_and_parts' 費用拆分**：metadata.pricing_breakdown 強制填？還是給預設拆 50/50？或 SA 同意時補填？
5. **safety_critical 拒絕的主管介入**：強制流程嗎（要主管登入錄音才能登 rejected）？走 RBAC `addon.reject_safety` 還是純 business_rules 政策？
6. **通知 event code**：`addon.proposed` / `addon.agreed` / `addon.rejected_safety` / `addon.rejected_advisory` / `addon.deferred_safety` — 哪些 Day 1 要推、推給誰？
7. **deferred 暫緩的「一般項目」要不要入閉環**？業務上「下次再說」可能要 D+30 自動提醒？或純失銷？
8. **D+3/D+10 提醒任務的排程機制**：n8n cron / supabase pg_cron / 都不做先靠人工？這題會反推 05 提案。
9. **庫存預留時點**：跟 03 §3.1 連動。如果 03 選 B（領料時扣），04 decideAddon (agreed) 是不是只記 `reserved_at`、不真的扣 stock？或仍寫 inventory_movements (type='reserve_for_addon') 預留 reserved 欄？
10. **同意後可否改估價**：「車主同意 NT$3200 → 實際維修發現要 NT$4000」走 (a) 新增另一個 addon (b) 改舊 addon 走重新同意 (c) 直接調 ro_lines 不通知車主？
11. **路由**：`/parts/aftersales/repair-orders/[id]/addons` 獨立子路由，還是 `[id]?tab=addons` tab 內嵌？跟 03 一起決定。
12. **權限邊界**：誰能 create addon（技師?SA?都可?）、誰能 decide（只 SA?店長?都可?）、誰能 escalateToFollowup（SA 都可還是只主管）→ 影響 `PERMISSIONS.AFTERSALES_ADDON_*` 設計。

---

## 8. 結論（給 caller 用）

本頁是售後工單模組的 **Phase 4.5「維修中追加處理頁」**，性質為**決策過程記錄器**（不是 list、不是 detail、是流程閘），核心職責是接住技師現場發現的問題 → 走車主決策 → 分流到 03 的 ro_lines 或 05 的閉環追蹤：

- **主 entity**：`repair_order_addons`（envelope，新建）
- **關鍵設計（caller 特別問）**：
  - **跟 03 ro_lines**：**共表 + envelope 補強**（§3.1 方案 C 推薦）— `repair_order_*_items` 共用、`source='addon'`、新增 `source_ref_id` typed column 反查 envelope；拒絕的 addon 只有 envelope、沒 line；理由：拒絕記錄 = 失銷 KPI 核心、estimated_fee vs 實際 line 金額兩個世代不能混、source_ref_id 是售後所有 line 來源 SSOT 延展性開關
  - **跟 05 增項閉環**：**1:1 雙向 FK**（§3.2）— `addons.followup_case_id` ↔ `followup_cases.source_addon_id`；只有 safety_level != 'normal' 且 customer_decision in (deferred, rejected) 才會 INSERT 一筆 followup_cases；一般項目拒絕只是 envelope 記錄，不入 05 看板
- **反向影響 03 提案**：建議補一個 ALTER `repair_order_*_items` ADD COLUMN `source_ref_id` typed（polymorphic FK by source），04 + 03 必須一起 migration
- **核心副作用**（decideAddon 三向分支）：
  - agreed → INSERT ro_lines (source='addon', source_ref_id) + 庫存預留（跟 03 §3.1 連動）+ 通知技師
  - deferred (safety) → INSERT followup_cases (case_kind='deferred')
  - rejected (safety_critical) → INSERT followup_cases (case_kind='rejected_safety') + 強制推 LINE 給主管 + 可能要主管錄音
  - rejected (normal) → 純 envelope 失銷記錄
- **典型 typed/jsonb 設計**：safety_level / customer_decision / confirm_method 都 typed（KPI 軸 + 狀態機）；只有照片 URL / 錄音 URL / 替代方案 / pricing_breakdown 進 metadata
- **建議路由**：`/parts/aftersales/repair-orders/[id]/addons`（獨立子路由）
- **建議落地型態**：方案 B（envelope 表 + 共表寫入 line + followup_cases stub + 通知 placeholder）— **但 05 必須同時 / 先一步落地，否則 followup_case_id 沒 FK target**
- **核心依賴**：02 RO + 03 ro_lines + 05 followup_cases（同時 / 先落）+ 既有 inventory_movements（要新增 reserve_for_addon type）+ employees / items 主檔
- **雙 brand**：brand_id 從 ro_id 反查、政策（如 safety_critical 拒絕的錄音強制）走 `business_rules`；RLS 4 條 × 1 表；本頁不獨立進 nav 樹（從 RO 詳情頁進入）
- **特別注意**：本頁不能單獨落地。**04 + 03 + 05 三個提案有強制 atomic 落地關係**（共表設計 + envelope 反查 + followup_cases FK target），Phase 2 提案前要跟 user 對齊三者一起做還是分批做（分批的話順序：03 補 source_ref_id 欄 → 05 建 followup_cases → 04 建 addons + 接通）

Phase 1 到此打住，等用戶決定要不要進 Phase 2 寫完整提案。
