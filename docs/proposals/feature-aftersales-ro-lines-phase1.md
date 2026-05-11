# 提案：售後工單模組 — 維修項目／零件明細（RO Lines）（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/03_維修項目零件明細.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組目前只在 Ducati nav 樹下；Indian 視業務決定再補）
> 姊妹頁：
> - `feature-aftersales-overview-phase1.md`（00_導覽總覽）
> - `feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）
> - `feature-aftersales-appointments-phase1.md`（01_預約管理看板）
> - `feature-aftersales-ro-phase1.md`（02_正式工單 RO，**上游 parent，本頁的 ro_id 來源**）
>
> ⚠️ **庫存串接副作用警示**：本頁是售後模組裡**第一個會跟 `stock_items` / `inventory_*` 寫互動**的頁面。所有「自動扣庫」「領料單」「退料」「水位告警」副作用都在這頁觸發 — 副作用清單請特別關注 §3 / §4。

---

## 0. 頁面定位（最重要）

這頁是 **RO 的明細子表編輯頁（line items editor）**，性質介於 list view + form view 之間：

- 上游：02_正式工單 RO（`repair_orders.id` 已建立）→ SA 從 RO 詳情頁點「維修項目／零件明細」進入本頁，URL 帶 `ro_id`
- 本頁職責：在 `ro_id` 底下維護**兩張子明細**
  1. **工項明細**（labor items）— 工項名稱 / 工時 LU / 工時費 / 備註
  2. **零件明細**（part items）— 料號 / 品名 / 數量 / 單價 / 小計 / 庫存徽章
  以及**費用彙總**（工時費 + 零件費 + 稅 5% + 折扣 → 總計）、**庫存提示**（庫存偏低告警）
- 下游：
  - 04_追加項目 / 05_增項閉環 → 都會再 INSERT 同樣兩張 line item 表（共用 entity）
  - 06_竣工複檢 → 讀本頁的工項清單做完工檢核
  - 08_結帳收款 → 讀本頁 + 04/05 的所有 line items 加總成最終帳單
  - **`stock_items` / `inventory_movements`** → 零件 line 觸發領料 / 扣帳 / 退料（核心副作用，見 §3）

**核心特徵**：

1. **兩張子明細表共生**（labor / parts），各自有 CRUD（新增 / 編輯 / 刪除一列），不可只做其中一張
2. **零件明細的庫存欄不是 free text**，是從 `stock_items` query 出來的即時值（HTML mock 寫 `✅ 庫存:8` / `⚠️ 庫存:1`）— 這意味著進本頁要 fetch 零件主檔 + stock_items join，**這是售後模組第一次跟庫存模組產生資料依賴**
3. **費用彙總是純計算欄**（工時費 sum + 零件費 sum + 稅 5% + 折扣 %）→ 不用獨立 entity，作為 derived value 即時算或快照存
4. **儲存明細**是頁面唯一寫入入口（右上 navy button），底下沒有狀態切換 / 流程推進 button — RO 狀態仍由 02 / 06 / 08 控制
5. **折扣（%）+ 折扣原因**會影響最終金額，但 HTML 把它放在「費用彙總」卡右下小區塊 → 應該存在 `repair_orders` 主檔（不是 line 層級），影響 RO 整體
6. **HTML 沒明示「領料」/「扣庫」button** — 但下游頁面（06 完工 / 08 結帳）必然要扣帳。**Phase 1 必須決定**：扣帳是 (a) 儲存明細時即時扣 (b) 06 完工後扣 (c) 08 結帳時扣，三種時點對庫存報表 / 還料流程影響完全不同

**在售後流程中的定位**：**Phase 4「維修項目落地」的核心執行頁**。RO 在 02 建立時是空殼（只有 ro_code + 預估金額快照），03 是真正把「要做什麼工 / 要用什麼料」填進去的地方。一旦 03 有零件 line，**就觸發庫存模組的關注**（誰扣 / 何時扣 / 缺料怎麼辦）。

⚠️ **本頁是 RO 跟庫存模組的串接橋**。Phase 2 拍板時，「扣帳時點 + 領料流程」必須先跟 user 對齊，後續 04 / 05 / 06 / 08 才能正確銜接。

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

主 entity（本頁負責 CRUD、但 schema 跨多頁共用）：

```
repair_order_labor_items（工項 line）
  fields:
    - id uuid PK
    - brand_id text
    - ro_id uuid FK → repair_orders   # NOT NULL，line 必歸屬一張 RO
    - line_no int                      # 顯示用 #1 / #2 / #3（同 ro_id 內遞增）
    - source text                       # 'initial' / 'addon' / 'followup'  ← 區分本頁建 vs 04/05 加進來
    - name text                         # 工項名稱（例：Desmo 12,000km 定期保養）
    - labor_units numeric(6,2)          # 工時 LU（標準工時，例 2.5）
    - labor_fee numeric(12,2)           # 工時費（NT$2,500）
    - note text                         # 備註（例：含 Desmo 閥清潔）

    - technician_id uuid FK → employees # 派工技師（HTML mock 未顯示但下游 06 / 工時表必用，先預留）
    - status text                       # pending / in_progress / done / cancelled
    - completed_at timestamptz          # 技師打卡完成時間（從打卡 module 寫進來）

    - labor_rate_rule_id uuid           # 走 work_order_prefix_rules / business_rules 的工時費率 SSOT；HTML 沒明示但編號 P1 不同（MN/RP/WC/AC/OT）+ 職等可能有不同工時費，必須查表
    - metadata jsonb DEFAULT '{}'::jsonb
      # 預期 keys：
      #   item_template_id: uuid       # 從「標準工項目錄」帶入時反查（reuse / 報表）
      #   warranty_covered: bool        # WC 工項時標記，影響 GL 入帳科目
      #   recommended_from: 'pre_inspection' | 'addon' | 'tech'   # 來自哪個環節
    - created_by uuid, created_at, updated_at

  relationships:
    - { to: repair_orders, kind: 'fk' (ro_id) }
    - { to: employees,     kind: 'fk' (technician_id) }
    - { to: business_rules / work_order_prefix_rules, kind: 'lookup' (labor_rate_rule_id) }


repair_order_part_items（零件 line）
  fields:
    - id uuid PK
    - brand_id text
    - ro_id uuid FK → repair_orders
    - line_no int
    - source text                       # 'initial' / 'addon' / 'followup'

    - part_no text                       # 料號（67620871B；business key，從 stock_items / items 來）
    - part_id uuid FK → items / parts    # 零件主檔 PK（typed，避免料號 rename 失聯）
    - name text                          # 品名（snapshot，from items.name）
    - qty numeric(10,2)                  # 數量
    - unit_price numeric(12,2)           # 單價（snapshot；可能跟 items.current_price 漂移）
    - subtotal numeric(12,2) GENERATED    # qty × unit_price（GENERATED COLUMN 或 trigger）

    # 庫存串接欄（核心副作用面板）
    - issue_status text                  # 'pending' / 'issued' / 'partial' / 'missing' / 'returned'
    - issued_qty numeric(10,2)           # 已領出數量
    - issued_at timestamptz              # 領料時點
    - issued_by uuid FK → employees      # 領料人
    - source_stock_movement_id uuid      # 反查 inventory_movements 一筆扣帳紀錄（核心 audit 點）
    - source_warehouse_id uuid FK → organizations / warehouses  # 從哪個倉領
    - source_bin_id uuid                 # 細到 bin（如 warehouse_bins 已落地）

    - metadata jsonb DEFAULT '{}'::jsonb
      # 預期 keys：
      #   stock_at_pick: int             # 開單時快照的可用庫存（防告警誤判）
      #   alt_part_no: string            # 替代料號（缺料時改用）
      #   backorder_po_id: uuid          # 缺料 → 自動建補貨採購單時反查（與採購模組相關）
      #   warranty_covered: bool         # WC 零件時，影響廠商索賠 / GL 科目
      #   return_reason: string          # 退料原因（reason → returned）

    - created_by uuid, created_at, updated_at

  relationships:
    - { to: repair_orders,         kind: 'fk' (ro_id) }
    - { to: items / parts,         kind: 'fk' (part_id) }
    - { to: stock_items,           kind: 'lookup'（query 即時庫存、不存 FK）}
    - { to: inventory_movements,   kind: 'fk' (source_stock_movement_id) }  # 核心副作用 audit
    - { to: organizations / warehouses, kind: 'fk' (source_warehouse_id) }


（衍生 / 計算欄，可能存 repair_orders 主檔，不獨立 entity）：
  - actual_subtotal_labor = sum(labor_items.labor_fee where source ∈ allowed)
  - actual_subtotal_parts = sum(part_items.subtotal where source ∈ allowed)
  - actual_subtotal      = labor + parts
  - tax_amount           = round(actual_subtotal × tax_rate)
  - discount_percent     ← 本頁右下「折扣 %」input
  - discount_reason text ← 本頁右下「折扣原因」select：無 / VIP / 促銷 / 主管授權
  - discount_amount      = actual_subtotal × discount_percent / 100
  - grand_total          = (actual_subtotal − discount_amount) × (1 + tax_rate)

  → 建議：discount_percent / discount_reason 落 typed column 進 repair_orders；
         tax_rate 從 brand setting / 法人 setting 取（5% Ducati TW VAT）；
         其餘 subtotal / tax / grand_total 可以「即時算 + 結帳時 snapshot 一份進 repair_orders.final_*」。

```

引用 entities（不歸本頁落地）：

- `repair_orders` → 02 提案落地（本頁的 parent；本頁可能 UPDATE 它的 discount_* 欄位 + 結帳快照欄位）
- `stock_items` / `inventory_movements` → 既有庫存模組（本頁的核心副作用對象，**Phase 2 拍板要 user 確認扣帳時點**）
- `items` / `parts` → 零件主檔（既有 master data，零件查詢來源）
- `employees` → 既有（technician_id 落腳）
- `work_order_prefix_rules` / `business_rules` → 工時費率 / 工項範本可能來自這
- `warehouses` / `warehouse_bins` → 領料來源（feature-warehouse-*-phase1 已提案）

> **共用 schema 跨多頁的紀律**：04_追加項目 / 05_增項閉環 都會 INSERT 同樣的 `repair_order_labor_items` / `repair_order_part_items`，差別只在 `source` 欄位 = 'addon' / 'followup'。**這兩張表是 RO 子表體系的 SSOT**，所有後續頁面（04/05/06/08）讀寫都走同樣兩張表 + 用 `source` 篩。

### actions

```
# 進本頁時的讀取
getRoLines(ro_id) → Promise<{
  ro: RepairOrder,                              # 帶 ro_code、prefix_p1/p2、discount_*
  labor_items: RepairOrderLaborItem[],
  part_items: (RepairOrderPartItem & { current_stock: StockSnapshot })[],  # join stock_items
  cost_summary: { labor_fee, parts_fee, tax, discount_amount, grand_total },
  stock_warnings: { part_id, part_no, name, current_stock, qty_required, severity }[],
}>
  # 對每個 part_item 即時 query stock_items 拿可用庫存、算 warning
  # 對 cost_summary 即時加總（不快取）

# CRUD（每張子表各四個）
addLaborItem(input: { ro_id, name, labor_units, labor_fee, note?, technician_id?, source? })
  → Promise<Result<{ id: string }>>
  # 副作用：無（純寫單表）

updateLaborItem(id, patch) → Promise<Result>
  # 副作用：無（純寫單表；但若改 labor_fee 會影響 grand_total，UI 即時重算）

deleteLaborItem(id) → Promise<Result>
  # 副作用：可能有（若已 completed_at != null 不該刪、要轉「取消」）

addPartItem(input: { ro_id, part_no, qty, unit_price?, source? }) → Promise<Result<{ id: string }>>
  # 副作用候選（[需確認]）：
  #   - 是否即時扣 stock_items 預留（reserve）？
  #   - 是否寫一筆 inventory_movements (type='reserve' 或 'issue')？
  #   - 是否觸發水位告警（庫存 < 安全水位 → 推 LINE 給採購）？
  # Day 1 預設：純寫單表（不扣 stock），扣帳延後到「正式領料」action

updatePartItem(id, patch) → Promise<Result>
  # 副作用：若改 qty，需重新評估 stock 預留 / 扣帳量差異
  # Day 1：純寫單表

deletePartItem(id) → Promise<Result>
  # 副作用：若 issue_status='issued' 不該直接刪、應走「退料」流程；
  #         若 issue_status='pending' 純刪即可

# 庫存串接專用 actions（HTML 沒明示按鈕，但下游必然要做 — Phase 2 拍板）
issuePartLine(part_item_id, { warehouse_id, bin_id?, actual_qty? }) → Promise<Result>
  # 副作用 A（跨表事務必須原子）：
  #   1. UPDATE repair_order_part_items SET issue_status='issued', issued_qty, issued_at, issued_by, source_*
  #   2. INSERT inventory_movements (type='issue_to_ro', ro_id, part_id, qty=-actual_qty, warehouse_id)
  #   3. UPDATE stock_items SET on_hand = on_hand - actual_qty WHERE part_id AND warehouse_id
  #   4. 若 stock_items.on_hand < safety_stock → after() 推 LINE 給採購
  #   5. 寫 audit log
  # → 必須走 server action / supabase RPC，client 不能直接做

returnPartLine(part_item_id, { reason, return_qty }) → Promise<Result>
  # 副作用（A 跨表事務）：
  #   1. UPDATE part_items SET issue_status='returned', metadata.return_reason
  #   2. INSERT inventory_movements (type='return_from_ro', qty=+return_qty)
  #   3. UPDATE stock_items SET on_hand = on_hand + return_qty
  #   4. 寫 audit log

# 整體儲存（右上「儲存明細」button 對映）
saveRoLines(ro_id, { discount_percent, discount_reason }) → Promise<Result>
  # 純更新 repair_orders.discount_* 欄位 + updated_at
  # 不觸發 line CRUD（line 各自有 add/update/delete action）
  # 可能觸發 revalidatePath('/parts/aftersales/repair-orders/[id]')

# 庫存查詢輔助（client 在 zhuang 零件下拉時用）
searchPartsForRo(ro_id, query) → Promise<{ part_no, name, current_stock, unit_price }[]>
  # 從 items + stock_items join；可帶 warehouse 過濾
```

**[需確認] 副作用**（Phase 3 拍板）：

| 動作 | 推測副作用 | 確定性 |
|---|---|---|
| addPartItem | (a) 即時 reserve stock / (b) 不 reserve、純寫單；二選一影響「同時兩張 RO 搶同一顆料」處理 | [需確認，三選一] |
| addPartItem | 若庫存 < qty，UI 顯示 amber 警告；是否同時推 LINE 給採購？是否自動建補貨採購單 draft？ | [需確認] |
| issuePartLine | 跨表事務（part_items + inventory_movements + stock_items）+ 水位告警 LINE | 確定（庫存模組標準作法）+ [需確認] LINE 對象 |
| issuePartLine | 若 actual_qty ≠ qty（領了不夠 / 領多了），part_items.issue_status='partial' 還是兩條 line？ | [需確認] |
| returnPartLine | 退料原因要強制填？退料是否要主管簽核？退料是否影響當張 RO 的 grand_total（重新計算）？ | [需確認] |
| deletePartItem | 已領料的 line 是否擋刪、強制走 returnPartLine？UI 應 disable 刪除按鈕？ | [需確認，但業務邏輯上應該擋] |
| deleteLaborItem | 已 completed_at 的工項是否擋刪？技師打卡完成後是否轉「取消」而非刪除？ | [需確認] |
| saveRoLines | 是否寫 audit log（discount 改動由誰、何時、原因）？折扣 > 某 % 是否需主管授權？ | [需確認] |
| 進本頁 | 是否要 lock RO（同時兩個 SA 編同一張 RO 的 lines）？optimistic concurrency 用 updated_at？ | [需確認] |
| 整頁 | WC 工單（保固索賠）的零件成本是否要計入 RO grand_total？還是另記到 warranty_claims？ | [需確認，跨 warranty 模組] |
| 整頁 | line 變動是否觸發 RO `estimated_subtotal` 跟 `actual_subtotal` 漂移 recalculate？是否 snapshot 進 metadata.recalc_history？ | [需確認] |

### kpis

本頁本身沒有 KPI scorecard（純功能頁）。但 line items 一旦落地，下游 KPI 來源：

- 06_竣工複檢：「待完工工項：count(labor_items WHERE ro_id AND status != 'done')」
- 07_售後管理：本月領料 NT$ / 缺料工單數 / 平均零件毛利率
- 08_結帳收款：actual_subtotal_* / grand_total 進入發票
- 庫存報表：本頁的 inventory_movements `type='issue_to_ro'` 是售後對庫存的扣帳口徑（與採購進貨 `type='receive'` 對應）
- 會計報表：依 RO `prefix_p1/p2` 拆分（MN/RP/AC/OT 走 AR_CUSTOMER、WC-WR 走 AR_VENDOR、*-FR 走 EXPENSE），決定本頁的工時費 / 零件費 / 折扣對映 GL 科目

⚠️ **本頁是「售後對庫存的扣帳口徑」單一來源** — 任何「本月售後消耗了多少零件、毛利多少」的口徑都從 `repair_order_part_items` × `inventory_movements (type='issue_to_ro')` 算。

### implied_schema

```sql
-- 工項 line
CREATE TABLE repair_order_labor_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  ro_id uuid NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  line_no int NOT NULL,
  source text NOT NULL DEFAULT 'initial',   -- 'initial' | 'addon' | 'followup'

  name text NOT NULL,
  labor_units numeric(6,2),
  labor_fee numeric(12,2) NOT NULL,
  note text,

  technician_id uuid REFERENCES employees(id),
  status text NOT NULL DEFAULT 'pending',   -- 'pending' | 'in_progress' | 'done' | 'cancelled'
  completed_at timestamptz,

  labor_rate_rule_id uuid,                  -- 對映 business_rules / work_order_prefix_rules
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (ro_id, line_no)                   -- 同 RO 內 line_no 不重
);

CREATE INDEX ON repair_order_labor_items (brand_id, ro_id, source);
CREATE INDEX ON repair_order_labor_items (technician_id, status);
CREATE INDEX ON repair_order_labor_items (brand_id, completed_at DESC) WHERE status='done';

-- 零件 line
CREATE TABLE repair_order_part_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  ro_id uuid NOT NULL REFERENCES repair_orders(id) ON DELETE CASCADE,
  line_no int NOT NULL,
  source text NOT NULL DEFAULT 'initial',

  part_no text NOT NULL,
  part_id uuid REFERENCES items(id),         -- 主檔 PK（即使料號 rename 也不失聯）
  name text NOT NULL,                         -- snapshot
  qty numeric(10,2) NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  subtotal numeric(12,2) GENERATED ALWAYS AS (qty * unit_price) STORED,

  issue_status text NOT NULL DEFAULT 'pending',  -- 'pending' | 'issued' | 'partial' | 'missing' | 'returned'
  issued_qty numeric(10,2),
  issued_at timestamptz,
  issued_by uuid REFERENCES employees(id),
  source_stock_movement_id uuid,               -- 反查 inventory_movements
  source_warehouse_id uuid REFERENCES organizations(id),
  source_bin_id uuid,

  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (ro_id, line_no)
);

CREATE INDEX ON repair_order_part_items (brand_id, ro_id, source);
CREATE INDEX ON repair_order_part_items (part_id, issue_status);
CREATE INDEX ON repair_order_part_items (brand_id, issued_at DESC) WHERE issue_status='issued';
CREATE INDEX ON repair_order_part_items (source_warehouse_id, issue_status);

-- RLS（依 memory「多品牌 Schema Pattern」4 條 × 2 表）
ALTER TABLE repair_order_labor_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_order_part_items  ENABLE ROW LEVEL SECURITY;

-- repair_order_labor_items_{select,insert,update,delete} USING/WITH CHECK (user_has_brand(brand_id))
-- repair_order_part_items_{select,insert,update,delete}  USING/WITH CHECK (user_has_brand(brand_id))

-- 對 repair_orders 主檔新增 typed columns（discount + tax snapshot）：
ALTER TABLE repair_orders
  ADD COLUMN discount_percent numeric(5,2) DEFAULT 0,
  ADD COLUMN discount_reason text,                    -- 'none' | 'vip' | 'promotion' | 'manager_override'
  ADD COLUMN tax_rate numeric(5,4) DEFAULT 0.05,      -- 5% Ducati TW VAT
  ADD COLUMN actual_subtotal_labor numeric(12,2),     -- snapshot @ 結帳
  ADD COLUMN actual_subtotal_parts numeric(12,2),     -- snapshot @ 結帳
  ADD COLUMN actual_grand_total numeric(12,2);        -- snapshot @ 結帳
```

**typed vs jsonb 分類**（依 `references/field-classification.md` 規則）：

| 欄位 | 落腳 | 理由 |
|---|---|---|
| ro_id / brand_id / line_no | typed | FK / RLS / 排序，必須 |
| source | typed | 多頁 group by 篩選軸（initial / addon / followup） |
| name / labor_units / labor_fee / qty / unit_price / subtotal | typed | 報表 / 結帳 / 加總都用，穩定 |
| part_no / part_id / name (snapshot) | typed | 報表 / search / 反查主檔，穩定且 unique 用 |
| status / issue_status | typed | 狀態機、多頁 query 軸、index 用 |
| completed_at / issued_at / issued_by | typed | 時間序、誰做、報表 |
| source_stock_movement_id / source_warehouse_id | typed | FK，核心 audit 反查 |
| technician_id / labor_rate_rule_id | typed | FK，必有 |
| metadata.item_template_id | jsonb | 標準工項目錄反查，稀疏（不是每筆都從 template 來） |
| metadata.warranty_covered | jsonb | WC 工單才有意義，稀疏；長遠看可能 promote 成 typed boolean（影響 GL）|
| metadata.recommended_from | jsonb | 來源環節標記，純記錄 |
| metadata.stock_at_pick | jsonb | 開單當下庫存快照，純記錄不被 query |
| metadata.alt_part_no | jsonb | 替代料號，稀疏 |
| metadata.backorder_po_id | jsonb | 缺料補貨採購單反查，跨模組關聯 |
| metadata.return_reason | jsonb | 退料原因，純文字記錄 |
| discount_percent / discount_reason | typed（在 repair_orders 主檔）| 結帳必用、報表會 group、可能要 enum constraint |
| tax_rate / actual_grand_total | typed（在 repair_orders 主檔）| 結帳快照、會計報表必用 |

**依賴的 entity / 表**（需先存在或同時落地）：

- `repair_orders` — 02 提案中（本頁所有 line 都 FK 到此）
- `items` / `parts` — 零件主檔（既有 master data）
- `stock_items` / `inventory_movements` — **既有庫存模組（本頁副作用核心對象）**
- `employees` — 既有（technician_id / issued_by）
- `organizations` (warehouse level) / `warehouse_bins` — 已落地或併行（領料來源）
- `business_rules` / `work_order_prefix_rules` — 工時費率 SSOT（Phase 2 拍板）

### implied_pages

| 頁面 | 路徑（建議） | 類型 | 範本 | 備註 |
|---|---|---|---|---|
| **RO 維修項目／零件明細**（本頁） | `/parts/aftersales/repair-orders/[id]/lines` | **客製多 table 編輯頁** | 不適用標準 List/Page View | 兩張 DataGrid + 右側 cost summary card + stock warning card |
| 替代路由（如選 tab 內嵌）| `/parts/aftersales/repair-orders/[id]?tab=lines` | tab 內容區 | — | 跟 02 提案的「RO 詳情頁是否多 tab」決策連動 |

⚠️ **本頁不能直接套 canonical items-board / item-detail-view**：

- 不是「一張表的 list view」（兩張表共生）
- 不是「單一 entity 的 detail view」（沒有「KV grid」段，是兩張 grid + cost summary）
- 不過 **兩張子表的編輯可以用 `<DataGrid>` 元件**（CLAUDE.md §List View 規格 §5）— 列 inline edit / row actions 都直接套
- 上方 `ro_code` + 客戶 / 車輛 banner 走 simplified header（不重複 RO 詳情頁的完整 KV）

建議：寫成獨立 client component `ro-lines-editor.tsx`，視覺照 HTML 的 grid-2-column 布局：

```
[left  (1fr)]                       [right (340px)]
─────────────                       ───────────────
sec-title: 🔧 工項明細  [+ 新增]      ┌─💰 費用彙總──┐
<DataGrid labor_items>              │ 工時費  $$$  │
                                    │ 零件費  $$$  │
sec-title: 🔩 零件明細  [+ 新增]      │ 稅 5%  $$$  │
<DataGrid part_items>               │ ─────────── │
                                    │ 總計    $$$  │
                                    │ 折扣 % [   ] │
                                    │ 折扣原因 ▼  │
                                    └─────────────┘
                                    ┌─⚡ 庫存提示─┐
                                    │ ⚠️ 缺料...  │
                                    └────────────┘
```

兩張 DataGrid 的 column 定義骨架：

```ts
// labor_items columns
[
  { id: 'line_no',   header: '#',       width: 40 },
  { id: 'name',      header: '工項名稱', editable: { type: 'text', ... } },
  { id: 'labor_units', header: '工時(LU)', editable: { ... } },
  { id: 'labor_fee', header: '工時費',   editable: { ... } },
  { id: 'note',      header: '備註',     editable: { type: 'textarea', ... } },
]
// rowActions: [編輯 / 刪除]（已 completed 的 disable 刪除）

// part_items columns
[
  { id: 'line_no',    header: '#',     width: 40 },
  { id: 'part_no',    header: '料號',   sortable: true },        // 從 stock_items modal 選、不 inline edit
  { id: 'name',       header: '品名' },
  { id: 'qty',        header: '數量',   editable: { ... } },
  { id: 'unit_price', header: '單價',   editable: { ... } },
  { id: 'subtotal',   header: '小計' },                           // GENERATED, readonly
  { id: 'stock',      header: '庫存',   sortable: false },        // chip 顯示即時 stock_items
  { id: 'issue_status', header: '領料狀態' },                     // chip: pending/issued/returned
]
// rowActions: [編輯 / 領料 / 退料 / 刪除]（依 issue_status disable）
```

---

## 2. 在售後流程中的定位摘要

| 階段 | 對映 HTML | 對映 entity | 串接關係 |
|---|---|---|---|
| Phase 1 預約進廠 | 01 | appointments | 上游 |
| Phase 2 SA 預檢 | 04 v3 | pre_inspections + pre_inspection_items | 上游（pre_inspection_items 是本頁的「建議來源」） |
| Phase 3 RO 成立 | 02 | repair_orders | **本頁的 parent，提供 ro_id** |
| **Phase 4 維修項目落地**（本頁） | **03** | **repair_order_labor_items / repair_order_part_items（建立）** | **本頁負責生成 + 觸發庫存扣帳** |
| Phase 4.5 追加項目 | 04（追加） | 同上兩張表（source='addon'） | 共用 entity |
| Phase 4.5 增項閉環 | 05 | 同上兩張表（source='followup'）+ 增項簽核 | 共用 entity |
| Phase 5 竣工複檢 | 06 | final_inspections | 讀本頁工項 status |
| Phase 6 結帳關單 | 08 | payments / invoices | 讀本頁 + 04/05 全部 line 結算 |

**核心定位**：本頁是售後模組的 **Phase 4「維修項目落地頁」**，性質為**客製多 table 編輯頁**。是 RO 從「空殼」變「實體訂單 + 帳單初稿」的轉換點。**整個售後模組 04/05/06/08 都依賴本頁建立的 line items 資料結構**（用 `source` 欄位區分來源），本頁也是 **RO 跟庫存模組第一個資料交握點**。

---

## 3. 庫存串接副作用（本頁的核心 — Phase 2/3 必拍板）⚠️

本頁是售後模組裡**第一個會跟 `stock_items` / `inventory_movements` 寫互動**的頁面，三組副作用必須拍板：

### 3.1 扣帳時點（三選一，user 必選一個）

| 方案 | 何時扣 stock_items.on_hand | 優點 | 缺點 |
|---|---|---|---|
| **A. 加 part_item 即時扣** | addPartItem 同時 INSERT inventory_movements (type='reserve') + UPDATE stock_items | 報表即時準、防搶料 | RO 還沒做完就動帳；刪 line 要回沖；複雜 |
| **B. 領料時扣**（推薦）| issuePartLine button → 才扣 stock_items + 寫 movement | 跟現場操作對齊（領了才扣）；最直觀 | 需在本頁加「領料」action / button（HTML 沒明示） |
| **C. 結帳時扣**（08） | 08_結帳收款 才一次性扣 | 簡單；不用 issue/return 流程 | 庫存報表大延遲；同時 N 張 RO 排隊扣會撞；搶料無法解決 |

**Phase 1 推薦 B**（領料時扣）：
- 跟摩托車店維修廠的現場流程一致（技師到料架領料才扣帳）
- 跟既有「採購進貨 → 寫 receive movement」對稱
- 退料 flow 自然（returnPartLine 反向沖）

→ 但 HTML **沒有「領料」按鈕** — Phase 2 提案時必須補：在 part_items 的 row actions 加「領料」、「退料」按鈕，或在 RO 詳情頁加「批次領料」flow（一次領一張 RO 的所有 pending 零件）。

### 3.2 缺料處理（Phase 2/3 拍板）

HTML 已顯示「⚠️ 庫存:1」（badge amber）— UI 已 ready。背後副作用：

| 場景 | UI 提示 | 副作用候選 |
|---|---|---|
| 加 line 時 qty > on_hand | 庫存提示卡顯示 amber warning | (a) 純 UI 警告 / (b) 推 LINE 給採購 / (c) 自動建補貨採購單草稿 |
| 領料時 on_hand = 0 | 標 `issue_status='missing'` | (a) 顯示「待補料」 / (b) 自動建調撥單從別店調 / (c) 觸發採購補單 |
| on_hand < safety_stock | 庫存提示卡 | 推 LINE 給採購主管 |

→ 連動到 feature-warehouse-arch / 採購補貨模組，**Phase 2 提案要先讀現有 stock_items / inventory_movements schema**，確認 receive / issue / transfer / return 四種 movement type 都已存在。

### 3.3 退料流程（Phase 2/3 拍板）

HTML 沒提退料 UI，但業務上必有：

- 客戶取消維修 / 換錯料 → 退料
- 跨表事務：UPDATE part_items.issue_status='returned' + INSERT inventory_movements (type='return_from_ro', qty=+x) + UPDATE stock_items.on_hand
- [需確認] 退料是否影響 RO grand_total？退料原因要不要主管簽核？退料是否需上傳照片？

---

## 4. 副作用清單（彙整）

| 動作 | 副作用類型 | 細節 | 確定性 |
|---|---|---|---|
| getRoLines | F Cache | 進頁 fetch；revalidatePath 在 line CRUD 後觸發 | 預設處理 |
| addLaborItem | 無 | 純寫單表 | 確定 |
| updateLaborItem | 無 | 純寫單表 | 確定 |
| deleteLaborItem | C 業務規則 | 已 completed 的工項該擋刪 / 轉「取消」 | [需確認業務規則] |
| addPartItem | A 跨表（候選） | 即時 reserve stock_items + 寫 movement（取決 §3.1 方案） | [需確認，跟 §3.1 連動] |
| addPartItem | C 業務規則 | qty > on_hand 觸發缺料提示 + 可能推 LINE | [需確認推播範圍] |
| updatePartItem | A 跨表 | 改 qty 重新評估扣帳；改 part_no 等於 delete + add | [需確認] |
| deletePartItem | C 業務規則 | issue_status='issued' 應擋刪、強制走退料 | [需確認] |
| **issuePartLine** | **A 跨表事務（必原子）** | UPDATE part_items + INSERT inventory_movements + UPDATE stock_items + 可能水位告警 | **確定（庫存模組標準）+ [需確認] 告警對象** |
| **issuePartLine** | **B 通知** | 水位 < safety → LINE 給採購；缺料 → LINE 給 SA | **[需確認] event code + 對象** |
| **returnPartLine** | **A 跨表事務** | UPDATE part_items + INSERT inventory_movements (return) + UPDATE stock_items | **確定 + [需確認] 是否須主管簽核** |
| saveRoLines | D Audit | discount > 某% 寫 audit log（誰、何時、原因、是否經主管授權）| [需確認] |
| saveRoLines | C 業務規則 | discount_percent > limit 擋住 / 要主管授權 / 走加簽 | [需確認 limit + 流程] |
| 整頁 | C 業務規則 | WC（保固索賠）工項 / 零件成本是否計入 grand_total？保固覆蓋的 line 是否 unit_price=0、另入 warranty_claims？ | [需確認，跨 warranty 模組] |
| 整頁 | F Cache | line 變動後 RO `actual_subtotal_*` 是否 snapshot 進 repair_orders？snapshot 時點 = 結帳時 or 即時？ | [需確認] |
| 整頁 | A 並發 | 同一 RO 同時兩個 SA 編輯：optimistic concurrency (updated_at check) 還是 advisory lock？ | [需確認] |
| 整頁 | E 外部 | 同步到 NetSuite GL（依 RO `prefix_p1×p2` 對映科目）| [Phase 3 後再做] |

⚠️ **本頁副作用密度是售後模組最高的一頁**（庫存 + 通知 + 業務規則 + 並發 + 會計），Phase 2 提案前先讀 `references/side-effect-checklist.md` 校準，Phase 3 user 拍板的問題會比較多（估 6-8 題）。

---

## 5. 建議落地型態（給 Phase 2 / Phase 3 用戶拍板）

| 方案 | 描述 | 適合場景 |
|---|---|---|
| **A. 最小可用版** | 兩張 line CRUD（純寫單表，不接庫存）+ cost summary 即時算 + discount 存 RO | 用戶要快速接通 02→03→04→05→06→08 pipeline 雛形；庫存扣帳延後到 08 結帳統一處理 |
| **B. 推薦版** | A + 領料 / 退料 action（issuePartLine / returnPartLine）+ stock_items 即時 join 顯示徽章 + 缺料 amber 警告（純 UI、不推播） | 推薦。把 RO ↔ 庫存的雙向資料流先打通，業務最痛的「料卡」問題能立即解；通知 / 自動補單先 hook 留 placeholder |
| **C. 完整版** | B + 水位告警推 LINE 給採購 + 缺料自動建補貨採購單草稿 + 並發鎖 + 折扣 audit + WC line GL 拆分 | 過度設計、應在 Phase 3 + 採購 / warranty 模組都成熟後再做 |

**Phase 1 推薦傾向 B**：

- DB 層：`repair_order_labor_items` + `repair_order_part_items` + RLS + `repair_orders` 加 discount/tax/snapshot 欄
- Helper：`src/domain/ro-lines.ts` 提供 11 個 action（4 個 labor CRUD + 4 個 part CRUD + issuePartLine + returnPartLine + saveRoLines）
- UI：`/parts/aftersales/repair-orders/[id]/lines` client view（兩個 `<DataGrid>` + cost summary card + stock warning card）
- 副作用先留 hook：issuePartLine / returnPartLine 內部寫好跨表事務 + `after(() => notifications.dispatch(...))` placeholder

### 雙 brand 考量

- 所有 line 表的 `brand_id` 從 ro_id 反查 / 從 session 取（不寫死）
- RLS 4 條 × 2 表
- nav_nodes：本頁是 RO 詳情頁的子路由，**不獨立進 nav 樹**（從 RO 詳情頁 button 進入）
- 雙 brand 政策可能差異：Ducati 可能 5% VAT、Indian 可能不同；`tax_rate` 從 brand setting 取
- 領料來源倉：Ducati / Indian 各自有自己的倉，warehouse_id 透過 session.brand_id RLS 自然隔離

---

## 6. 已避開的陷阱（紀律檢查）

- ✅ **意識到本頁是售後↔庫存第一個資料交握點**，扣帳時點必須 user 拍板（不私自決定）
- ✅ **不把 labor / parts 拆兩條獨立 entity 體系**（用 `source` 欄位 + 共用 schema 跨 03/04/05 三頁）
- ✅ **意識到零件 unit_price 是 snapshot 不是 live**（避免 items.current_price 改動影響歷史 RO 帳）
- ✅ **零件 name 也快照** （part_id 主檔 rename 不影響歷史）
- ✅ **subtotal 用 GENERATED COLUMN**（避免 client 算錯 / DB 漂移）
- ✅ **discount / tax 落在 repair_orders 主檔**（不是 line 層級；line 沒 discount）
- ✅ **意識到並發**（兩個 SA 同編一張 RO 必須 optimistic concurrency 或 advisory lock）
- ✅ **意識到 WC 工單成本拆分**（保固覆蓋的 line 可能要另入 warranty_claims 不計 RO grand_total）
- ✅ **意識到 prefix_p1/p2 影響 GL**（line 的 fee/cost 入哪個 GL 科目要查 RO 主檔的 prefix）
- ✅ **沒擅自把 11 種前綴硬編進本頁** （規則仍歸 02 提案的 `business_rules` / `work_order_prefix_rules`）
- ✅ **意識到刪除已領料 / 已完工 line 是業務級錯誤**（必須擋 + 強制走退料 / 取消流程）
- ✅ **意識到副作用密度比 02 高很多**（庫存 + 通知 + 業務規則 + 並發 + 會計）
- ✅ **意識到本頁不能套 canonical items-board / item-detail-view**（多 table + cost summary 客製布局）但兩張 grid 可以用 `<DataGrid>` 元件
- ✅ **沒 commit、沒動 nav_nodes、沒動 DB、沒寫 code**（依任務指示停在 Phase 1）

---

## 7. Phase 2 應該問用戶的問題（給下一階段預留）

> ⚠️ 本任務不執行 Phase 2，僅列出供下次 session 使用。

1. **扣帳時點**（§3.1 三選一）：A 即時扣 / B 領料時扣（推薦）/ C 結帳時扣？影響整個庫存流程設計。
2. **缺料時是否自動建補貨採購單草稿**？或只純 UI 警告？跟採購模組 / 主管授權流程連動。
3. **水位告警推播範圍**：缺料 → 推 LINE 給 (a) SA / (b) 採購主管 / (c) 店長？哪些 Day 1 做？
4. **退料流程**：要不要主管簽核？退料原因要強制填？退料是否要照片佐證？退料是否影響當張 RO 的 grand_total？
5. **折扣權限**：discount_percent 上限多少？超過要主管授權嗎？走 RBAC (`PERMISSIONS.RO_DISCOUNT_OVERRIDE`) 還是 `business_rules`？ → 紀律檢查：boolean 授權 → RBAC；量化上限（>%）→ business_rules；兩者搭配。
6. **並發控制**：同 RO 兩個 SA 同編：optimistic concurrency（updated_at check）/ advisory lock / DB row lock 三選一？
7. **WC（保固索賠）line 處理**：保固覆蓋的零件 unit_price 要顯示 0、計入 RO grand_total？還是顯示原價但另入 `warranty_claims` 找廠商收款？跟 feature-warranty-cost-recovery 強相關。
8. **工時費率 SSOT**：HTML 寫死 NT$2500 / NT$600 / NT$500 — 是從 `work_order_prefix_rules`（per P1 / 職等）查 + 表格帶入，還是 SA 手填？影響 `labor_rate_rule_id` 是否真有 lookup。
9. **04 追加項目 / 05 增項閉環的關係**：兩者跟本頁共用 `repair_order_labor_items` / `repair_order_part_items`？用 `source='addon' / 'followup'` 區分？還是各自開新表？— 推薦共用（紀律：「規則類用 `business_rules` 一張打天下」精神延伸）。
10. **part_no 輸入 UX**：右上「新增零件」開 modal 從 stock_items 搜尋 + 帶入？還是 inline autocomplete？影響 part-search action 設計。
11. **路由**：`/parts/aftersales/repair-orders/[id]/lines` 獨立子路由，還是 `/parts/aftersales/repair-orders/[id]?tab=lines` 內嵌？跟 02 提案的「RO 詳情頁範圍」連動。
12. **GENERATED COLUMN 支援**：Supabase Postgres 15+ 支援 stored generated column；確認專案 PG 版本，否則 subtotal 改 trigger。

---

## 8. 結論（給 caller 用）

本頁是售後工單模組的 **Phase 4「維修項目落地頁」**，性質為**客製多 table 編輯頁**（不是 list / detail / setting），核心職責是把 RO 從空殼填成有實際工項 + 零件的訂單：

- **主 entity**：`repair_order_labor_items` + `repair_order_part_items`（跨 03/04/05 共用，用 `source` 區分）
- **核心副作用 — 庫存串接**（**本提案的重點**）：
  - **領料**（issuePartLine）：UPDATE part_items + INSERT `inventory_movements (type='issue_to_ro')` + UPDATE `stock_items.on_hand` — 跨表事務必須原子
  - **退料**（returnPartLine）：反向沖回 stock_items
  - **缺料告警**：on_hand < qty / safety_stock 時觸發 amber UI + 可能推 LINE 給採購
  - **扣帳時點三選一**（§3.1）：推薦 B（領料時扣），跟摩托車店現場操作對齊
- **次要副作用**：折扣權限 / WC 保固成本拆分 / 並發鎖 / GL 同步（後幾項 [Phase 3 後做]）
- **關鍵 typed/jsonb 設計**：subtotal 用 GENERATED COLUMN、unit_price + name 走 snapshot（避免主檔變動回溯）、discount / tax / actual_grand_total 在 `repair_orders` 主檔加 typed
- **建議路由**：`/parts/aftersales/repair-orders/[id]/lines`（獨立子路由，便於 deep link 跟 04/05 連動）
- **建議落地型態**：方案 B（兩張 CRUD + 領料/退料 + 即時庫存徽章 + 純 UI 警告 + 通知 placeholder）
- **核心依賴**：02 RO 已落地、items / stock_items / inventory_movements 既有庫存模組（**Phase 2 提案前先讀其 schema**）、employees 主檔
- **雙 brand**：brand_id 從 ro_id 反查、tax_rate 從 brand setting；RLS 4 條 × 2 表；本頁不獨立進 nav 樹（從 RO 詳情頁進入）
- **特別注意**：本頁副作用密度最高，Phase 2 提案前必讀 side-effect-checklist + 既有庫存模組 schema；Phase 3 估會有 6-8 題拍板問題（主要圍繞扣帳時點 / 缺料 / 折扣權限 / WC 拆分）

Phase 1 到此打住，等用戶決定要不要進 Phase 2 寫完整提案。
