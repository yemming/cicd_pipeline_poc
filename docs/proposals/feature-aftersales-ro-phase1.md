# 提案：售後工單模組 — 正式工單 RO 開立確認（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/02_正式工單RO.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組目前只在 Ducati nav 樹下；Indian 視業務決定再補）
> 姊妹頁：
> - `docs/proposals/feature-aftersales-overview-phase1.md`（00_導覽總覽）
> - `docs/proposals/feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）
> - `docs/proposals/feature-aftersales-appointments-phase1.md`（01_預約管理看板）

---

## 0. 頁面定位（最重要）

這頁不是傳統 list / detail / setting，**是售後 pipeline 上一個「閘門式確認頁」（gate page）**：

- 上游：預檢單 PI（04_預檢單_RO串接 v3）已完成 → SA 按「轉 RO」進入本頁
- 本頁職責：把預檢單的所有資料**只讀帶入**、SA 只做**一件決策** → **選工單編號的兩段前綴**（P1 業務類型 + P2 付款性質），驗證合法組合
- 下游：按下「確認開立工單」→ 建 `repair_orders` row、狀態切「進行中」、跳轉到 03_維修項目零件明細 / 07_售後管理 / 進入車間 pipeline

**核心特徵**：

1. **整頁幾乎全唯讀** — 車主 / 車輛 / 進廠資訊 / 維修項目 / 預估金額全部從 `pre_inspections` + `appointments` + `customers` + `vehicles` 帶入，**SA 完全不能改**（任何要改的內容必須回上游修預檢單）
2. **唯一互動**：兩組 radio（P1 5 選 1：MN/RP/WC/AC/OT、P2 3 選 1：CP/WR/FR）+ 一顆 confirm button
3. **業務驗證集中在 11 種組合白名單**（其中 1 種 `WC-FR` 明確擋掉，1 種隱含「需主管確認」fallback），驗證是純函式、無需查 DB
4. **工單編號 = P1-P2-YYMMDD-NNN**，前綴是 SA 選的、流水號是系統發的 → **這是 RO id 的 human-readable code，跟 uuid PK 分開**
5. **編號規則跟 `work_order_prefix_rules`（00_導覽總覽提過的設定頁）連動** — 真正落地時不該 hardcode 11 種組合在 client，應該從規則表讀

**在售後流程中的定位**：**Phase 3「RO 工單成立」的觸發點**。預檢單是「診斷」、RO 是「正式接單收費的合約」。一旦開立：
- 開始可記工時、可領料、可派工
- 會計上 RO 是一個帳上 entity（後續 invoice / payment 都 FK 到它）
- 03-08 所有頁面（維修項目、追加、增項、複檢、結帳）的所有單據都 FK 到 `repair_orders.id`

⚠️ **RO 是售後模組的 core entity，本頁是它的「出生點」**。本頁不負責 RO 後續的編輯 / 結帳（那是 03-08 的責任），只負責「按下生產按鈕」這一個動作。

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

主 entity（本頁負責「建」、但生命週期由 03-08 共管）：

```
repair_orders（RO 主檔，**售後模組的 core**）
  fields:
    - id uuid PK
    - brand_id text
    - subsidiary_id uuid                  # NetSuite Subsidiary 對映（會計分錄落腳）
    - store_id uuid                       # 收車店（organizations level=2）
    - ro_code text UNIQUE                  # 例 MN-CP-260508-003，business key，列印 / 客戶看
    - prefix_p1 text NOT NULL              # MN / RP / WC / AC / OT
    - prefix_p2 text NOT NULL              # CP / WR / FR
    - issue_date date NOT NULL             # 開單日期（編號裡的 YYMMDD）
    - sequence_no int                      # 編號裡的 NNN（當日同前綴流水）

    - appointment_id uuid FK → appointments     # 來源預約
    - pre_inspection_id uuid FK → pre_inspections # 來源預檢單
    - customer_id uuid FK → customers
    - vehicle_id uuid FK → vehicles
    - mileage_in int                        # 進廠里程（從 pre_inspection 帶入快照）

    - sa_id uuid FK → employees             # 開單 SA
    - status text NOT NULL                  # 進行中 / 維修中 / 待結帳 / 已關單 / 已取消
    - opened_at timestamptz                 # 開單時間（本頁按下 confirm 的時點）
    - closed_at timestamptz                 # 關單時間（08_結帳收款 那邊更新）

    - warranty_status_snapshot jsonb        # 開單當下保固狀態快照（is_valid, expires_at, mileage_limit）
    - estimated_subtotal numeric(12,2)      # 開單當下預估金額快照（含稅，從預檢項目加總）
    - estimated_labor_units numeric(6,2)    # 預估 LU（labor units）快照

    - metadata jsonb                        # 變動中 / 單頁專用
    - created_by uuid
    - created_at / updated_at

  relationships:
    - { to: appointments,   kind: 'fk' }    # RO 反查 appointment
    - { to: pre_inspections, kind: 'fk' }   # RO 反查預檢單
    - { to: customers,      kind: 'fk' }
    - { to: vehicles,       kind: 'fk' }
    - { to: employees,      kind: 'fk' (sa_id) }
    - { to: organizations,  kind: 'fk' (store_id) }
    - { to: subsidiaries,   kind: 'fk' }
    - { to: repair_order_items, kind: '1m' }  # 03 頁負責落地，本頁不管
    - { to: addon_records,      kind: '1m' }  # 04 頁
    - { to: final_inspections,  kind: '1m' }  # 06 頁
    - { to: payments / invoices, kind: '1m' } # 08 頁

ro_prefix_rules（編號規則 / 組合白名單；候選對映既有 work_order_prefix_rules / 或走 business_rules）
  # 11 種合法組合 + 1 種被擋（WC-FR）的 hardcode 必須挪到 DB
  # 詳見「實作落腳」討論
```

引用 entities（不歸本頁落地）：

- `pre_inspections / pre_inspection_items / pre_inspection_tabs` → 04_預檢單 負責
- `appointments` → 01_預約管理看板 負責
- `customers / vehicles / warranty_status` → 09_人車檔案 負責
- `employees / work_order_prefix_rules` → 既有 / 系統設定區 負責

> 雙 brand 考量：
> - `repair_orders.brand_id` 用於 RLS，**brand_id ≠ subsidiary_id**（依 memory「會計維度語意校準」）
> - 真正掛統編 / 走 NetSuite Subsidiary 是 `subsidiary_id` 欄位 — 後續 RO 的 invoice / GL 分錄都靠這個落腳
> - 雙 brand 共用同一張 `repair_orders` 表 + 同一條 helper，差別只在 RLS

### actions

```
# 進本頁時的讀取
getRoDraftFromPreInspection(pre_inspection_id) → Promise<RoDraft>
  # 把預檢單 + appointment + customer + vehicle + 維修項目摘要組成 draft（不寫 DB）
  # SA 看到的整頁唯讀資料都是這個 draft

# 唯一寫入動作
confirmRepairOrder(input: {
  pre_inspection_id: string,
  prefix_p1: 'MN' | 'RP' | 'WC' | 'AC' | 'OT',
  prefix_p2: 'CP' | 'WR' | 'FR',
}) → Promise<Result<{ id: string, ro_code: string }>>
  # 1. 驗證 P1+P2 組合（查 ro_prefix_rules / business_rules）
  # 2. 取當日同前綴流水號（PG sequence / SELECT max + 1 / advisory lock）
  # 3. 組 ro_code = P1-P2-YYMMDD-NNN
  # 4. INSERT repair_orders（含 metadata、warranty_status_snapshot、estimated_*）
  # 5. 更新 appointments.status / pre_inspections.status
  # 6. 推 LINE 給 SA / 技師 / 客戶（[需確認]）
  # 7. 回傳 id 讓 UI router.push 到 03 維修項目頁

# 純函式（client 端先檢、UI 鎖按鈕；最終仍由 server 再驗一次）
validatePrefixCombo(p1, p2) → 'valid' | 'invalid' | 'needs_supervisor'
  # 11 種 valid + WC-FR invalid + 其餘 needs_supervisor
```

**[需確認] 副作用**（Phase 3 拍板）：

| 動作 | 推測副作用 | 確定性 |
|---|---|---|
| confirmRepairOrder | 推 LINE 給開單 SA「工單 X 已開立」 | [需確認] |
| 同上 | 推 LINE 給指派技師「請開始作業並打卡」 | [需確認] |
| 同上 | 推 LINE 給客戶「您的工單已成立，可掃 QR 追蹤」 | [需確認] |
| 同上 | 寫 audit log（誰、何時、選哪個前綴、ro_code） | [需確認] |
| 同上 | 更新 `appointments.status` → 「維修中」（或保留「等待中」直到技師打卡？） | [需確認] |
| 同上 | 更新 `pre_inspections.status` → 「已轉 RO」（或保留 / 刪？） | [需確認] |
| 同上 | 若是 WC（保固索賠）→ 自動建一張「廠商索賠單草稿」？ | [需確認，與 09 / 07 模組相關] |
| 同上 | 若是 AC（事故）→ 通知財務 / 保險聯絡人？ | [需確認] |
| 流水號取得 | 當日同前綴併發開單 → race condition；需 advisory lock 或 PG sequence per (date, prefix) | [需確認流水策略] |

### kpis

**本頁本身沒有 KPI scorecard 區塊**（純功能頁、不是儀表板）。但 RO 一旦落地，會在多處被算：

- 01_預約管理看板：「維修中 4 台」 = `count(repair_orders WHERE status='維修中' AND issue_date=today)`
- 07_售後管理模組：本月 RO 數 / 平均工時 / 業務類型分布 / 保固比例
- 10_工單查詢：歷史 RO 全集查詢
- 會計報表：subsidiary × prefix_p1 × prefix_p2 的收入 / 費用拆分（MN/RP/WC/AC/OT × CP/WR/FR 的 5×3 矩陣是會計主科目對映的依據）

⚠️ **prefix_p1 + prefix_p2 不只是工單編號美觀，是會計分類軸** — 它決定 RO 的收入 / 費用怎麼認列：

| P1×P2 | 會計性質（從 HTML 文案推測） |
|---|---|
| MN-CP / RP-CP / OT-CP / AC-CP | 一般應收帳款（客戶付） |
| WC-WR | 廠商應收帳款（廠商付保固索賠） |
| WC-CP | 保固超出範圍轉客付（混合） |
| MN-FR / RP-FR / OT-FR / AC-FR | 費用認列（公關 / 返工 / 賠償；本店吸收） |
| WC-FR | ❌ 邏輯衝突（不可同時是保固又是免費） |

這意味著 prefix 兩段值會被 **GL posting 規則表** 讀（屬於 `business_rules.rule_kind='ro_gl_mapping'` 或既有會計維度模組），是「query 軸」不只是 display tag → **必須是 typed column、必須有 index `(brand_id, prefix_p1, prefix_p2, issue_date)`**。

### implied_schema

```sql
-- 主表
CREATE TABLE repair_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  subsidiary_id uuid REFERENCES subsidiaries(id),
  store_id uuid REFERENCES organizations(id),

  -- business key
  ro_code text NOT NULL UNIQUE,
  prefix_p1 text NOT NULL,           -- 'MN' | 'RP' | 'WC' | 'AC' | 'OT'
  prefix_p2 text NOT NULL,           -- 'CP' | 'WR' | 'FR'
  issue_date date NOT NULL,
  sequence_no int NOT NULL,

  -- 來源串接
  appointment_id uuid REFERENCES appointments(id),
  pre_inspection_id uuid REFERENCES pre_inspections(id),
  customer_id uuid REFERENCES customers(id),
  vehicle_id uuid REFERENCES vehicles(id),
  mileage_in int,

  -- 人員 / 狀態
  sa_id uuid REFERENCES employees(id),
  status text NOT NULL DEFAULT '進行中',  -- 進行中 / 維修中 / 待結帳 / 已關單 / 已取消
  opened_at timestamptz DEFAULT now(),
  closed_at timestamptz,

  -- 開單快照（避免上游改了影響 RO 歷史）
  warranty_status_snapshot jsonb DEFAULT '{}'::jsonb,
    -- { is_valid: bool, expires_at: date, mileage_limit: 'NORM' | int, source: 'pre_inspection' }
  estimated_subtotal numeric(12,2),
  estimated_labor_units numeric(6,2),

  -- 變動中
  metadata jsonb DEFAULT '{}'::jsonb,
    -- 預期 keys：
    --   accounting_category_resolved: 'AR_CUSTOMER' | 'AR_VENDOR' | 'EXPENSE' | 'MIXED'   -- 從 P1×P2 推
    --   supervisor_approval: { required: bool, approver_id?: uuid, approved_at?: ts }     -- needs_supervisor 組合
    --   line_notifications: [{ target: 'sa'|'tech'|'customer', sent_at, delivery_id }]
    --   warranty_claim_draft_id: uuid                                                      -- WC 自動建索賠草稿時反查

  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX ON repair_orders (brand_id, issue_date, prefix_p1, prefix_p2, sequence_no);
CREATE INDEX ON repair_orders (brand_id, status, issue_date DESC);
CREATE INDEX ON repair_orders (brand_id, prefix_p1, prefix_p2, issue_date);  -- 會計報表用
CREATE INDEX ON repair_orders (pre_inspection_id);
CREATE INDEX ON repair_orders (appointment_id);

-- RLS（依 memory「多品牌 Schema Pattern」4 條）
ALTER TABLE repair_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY repair_orders_select ON repair_orders FOR SELECT USING (user_has_brand(brand_id));
CREATE POLICY repair_orders_insert ON repair_orders FOR INSERT WITH CHECK (user_has_brand(brand_id));
CREATE POLICY repair_orders_update ON repair_orders FOR UPDATE USING (user_has_brand(brand_id)) WITH CHECK (user_has_brand(brand_id));
CREATE POLICY repair_orders_delete ON repair_orders FOR DELETE USING (user_has_brand(brand_id));
```

**typed vs jsonb 分類**（依 `references/field-classification.md` 規則）：

| 欄位 | 落腳 | 理由 |
|---|---|---|
| ro_code | typed | 客戶 / 列印 / 報表 / 搜尋的 business key，必有 unique index |
| prefix_p1 / prefix_p2 | typed | 會計軸、報表 group by、有 enum constraint、index 用 |
| issue_date / sequence_no | typed | 編號規則的組件、unique constraint 用 |
| appointment_id / pre_inspection_id / customer_id / vehicle_id | typed | FK，必須 |
| status | typed | 狀態機、被多頁 query |
| opened_at / closed_at | typed | 時間序、報表 |
| mileage_in / estimated_subtotal / estimated_labor_units | typed | 報表 / 結帳要用 |
| warranty_status_snapshot | jsonb | 快照結構可能擴張（mileage_limit / 廠商代碼 / 索賠條款），變動中；不被 query |
| metadata.accounting_category_resolved | jsonb | 從 P1×P2 衍生、可隨會計規則改、不需 index |
| metadata.supervisor_approval | jsonb | 只有「需主管確認」組合才有，稀疏 |
| metadata.line_notifications | jsonb | 純記錄、非 query 軸 |
| metadata.warranty_claim_draft_id | jsonb | 等廠商索賠模組成熟再 promote |

**依賴的 entity / 表**（需先存在或同時落地）：
- `appointments` — 01 提案中（FK 到此）
- `pre_inspections` — 04 提案中（FK 到此；本頁 80% 資料來源）
- `customers` / `vehicles` — 09 提案中（FK 到此）
- `subsidiaries` / `organizations` / `employees` — 既有
- **編號規則 table / 業務規則**（11 種組合白名單）— 屬於 `business_rules` 還是既有 `work_order_prefix_rules`？見下方「實作落腳」討論

### implied_pages

| 頁面 | 路徑（建議） | 類型 | 範本 | 備註 |
|---|---|---|---|---|
| **RO 開立確認**（本頁） | `/parts/aftersales/repair-orders/new?from=<pre_inspection_id>` | **客製 gate page** | 不適用標準 List/Page View | 唯一互動是 2 組 radio + 1 顆 confirm；上半全唯讀帶入 |
| RO 列表 | `/parts/aftersales/repair-orders` | List View | items-board.tsx | 屬於 10_工單查詢 的範圍，**不在本頁落地** |
| RO 詳情 / 編輯 | `/parts/aftersales/repair-orders/[id]` | Page View | item-detail-view.tsx | 整合 03-08 內容（多 tab：項目 / 追加 / 增項 / 複檢 / 結帳），是另一支大頁、**不在本頁落地** |

⚠️ **本頁不能套 canonical items-board / item-detail-view**：
- 沒有「新增 modal」（編號規則太核心、不能 modal 開）
- 沒有「編輯 / 停用 / 刪除」三按鈕（gate 性質、只有 confirm）
- 上半部不是 KV grid（是「預檢摘要 + 維修項目摘要 + 保固狀態 banner」幾個自定 section）

建議：寫成獨立 client component `repair-order-confirm-view.tsx`，視覺照 HTML 的 navy header card + info-grid + items-preview + prefix-row + combo-result + confirm-btn 五段，但 token 全套 design pattern 規格（color、字級、按鈕高度）— 不要照 HTML 的 native button height（52px）跟特殊圓角，套 design pattern 的 `h-[30px] rounded` 即可。

---

## 2. 在售後流程中的定位摘要

| 階段 | 對映 HTML | 對映 entity | 串接關係 |
|---|---|---|---|
| Phase 1 預約進廠 | 01 | appointments | 上游源頭 |
| Phase 2 SA 預檢 | 04 v3 | pre_inspections | 本頁 80% 資料來源 |
| **Phase 3 RO 成立**（本頁） | **02** | **repair_orders（建立）** | **本頁負責生成** |
| Phase 4 維修項目 | 03 / 04 / 05 | repair_order_items / addons / followups | FK → ro.id |
| Phase 5 竣工複檢 | 06 | final_inspections | FK → ro.id |
| Phase 6 結帳關單 | 08 | payments / invoices | FK → ro.id、closed_at 在這更新 |

**核心定位**：本頁是 RO 的「出生點」。**整個售後模組 03-08 的所有單據都 FK 到本頁建立的 `repair_orders.id`**。從 ID 引用密度看，RO 是售後模組裡跟 customer / vehicle 並列的三大 root entity 之一。

---

## 3. 業務規則：11 種前綴組合的落腳（**Phase 1 重點討論**）

HTML 第 87-99 行寫死了 11 種組合：

```
MN-CP ✅  MN-FR ✅                                  (定保：客付 / 免費)
RP-CP ✅  RP-FR ✅                                  (機修：客付 / 免費)
WC-WR ✅  WC-CP ✅  WC-FR ❌                        (保固：廠商付 / 轉客付 / 不可免費)
AC-CP ✅  AC-FR ✅                                  (事故：客付 / 免費)
OT-CP ✅  OT-FR ✅                                  (其他：客付 / 免費)
```

15 種組合中：11 valid + 1 invalid + 3 (WR 配 MN/RP/AC/OT) **HTML 沒列**（fallback「需主管確認」）。

**這份規則表的兩個落腳候選**（Phase 2 拍板）：

### 候選 A：走既有 `work_order_prefix_rules`

00_導覽總覽提到「系統設定 → 工單編號規則」已 v2 完成、屬於 `employees / work_order_prefix_rules / position_discount_rules` 群組。若該表已有「前綴定義」欄位，就把 P1×P2 組合表加進去 / 擴它的 schema。

- ✅ 好處：跟既有設定頁對齊、SSOT 單一
- ❌ 風險：該表 schema 未知，可能跟現規格設計衝突；得先讀它

### 候選 B：走 `business_rules` + `rule_kind='ro_prefix_combo'`

```json
{
  "rule_kind": "ro_prefix_combo",
  "config": {
    "p1": "WC",
    "p2": "FR",
    "verdict": "invalid",
    "reason": "保固索賠不可免費施工，邏輯衝突"
  }
}
// 11 valid + 1 invalid + 3 needs_supervisor = 15 筆 row
```

- ✅ 好處：跟 architecture.md「規則類用 `business_rules` 一張打天下」紀律對齊、跟採購權限 / 盤點規則用同一張表
- ❌ 風險：跟既有 `work_order_prefix_rules` 重複；POC 階段 SSOT 漂移

### Phase 1 建議

**先讀 `work_order_prefix_rules` schema 再拍板**。Phase 2 提案時：

1. 如果該表有「前綴 + 合法組合」欄位 → 候選 A，直接擴
2. 如果該表只管「前綴文字本身（MN/RP/WC/AC/OT 的中文名）」不管組合 → 候選 B，組合走 `business_rules`、文字仍由 `work_order_prefix_rules` 提供

⚠️ **不要在 client 端寫死 11 種組合 hardcode 進 helper**（POC 階段也禁止）— 雙 brand 可能有不同政策（Indian 可能允許 WC-FR 當公關活動、Ducati 不允許），規則必須是「資料」不是「程式」。

> 紀律檢查：依 SKILL § 紀律 / 禁區 第 4 條，看到「為 role 設定能 / 不能 boolean 授權」要走 RBAC。**本規則不是 role 授權、是業務組合白名單** → 走 `business_rules` / 既有規則表是正確的，不該走 RBAC。✓

---

## 4. 建議落地型態（給 Phase 2 / Phase 3 用戶拍板）

| 方案 | 描述 | 適合場景 |
|---|---|---|
| **A. 最小可用版** | 一頁 client component + 一支 `confirmRepairOrder` helper、組合規則 hardcode 在 helper、暫不做副作用 | 用戶要快速接通 04→02→03 pipeline 雛形 |
| **B. 推薦版** | 規則進 DB（候選 A 或 B 之一）、`src/domain/repair-orders.ts` helper、唯一寫入動作含 audit log，LINE 通知用 placeholder（等 04 / 03 落地後同步串） | 推薦。把核心 entity 結構先穩好，後續 03-08 都靠它 |
| **C. 完整版** | 含 LINE 通知 3 個目標、自動建廠商索賠草稿（WC）、自動通知財務（AC）、流水號用 advisory lock 防併發 | 過度設計、應在 03-08 都落地後再做副作用 |

**Phase 1 推薦傾向 B**：

- DB 層：`repair_orders` 表 + RLS + 規則表落腳
- Helper：`src/domain/repair-orders.ts` 提供 `getRoDraftFromPreInspection / validatePrefixCombo / confirmRepairOrder`
- UI：`/parts/aftersales/repair-orders/new` client view（從 `?from=<pre_inspection_id>` 取草稿）
- 副作用先留 hook：寫一條 `after(() => notifications.dispatch(...))` 但 event code 先 placeholder

### 雙 brand 考量

- `repair_orders.brand_id` 從 session 取、不寫死 'ducati'
- 規則表也雙 brand 各一筆（Indian 可能政策不同）
- nav_nodes 雙 brand INSERT；Indian 那筆視業務需求 `coming_soon=true`
- ro_code 流水 sequence：`(brand_id, issue_date, prefix_p1, prefix_p2)` 4 軸 unique（不是 `(date, prefix)` 2 軸），確保 Ducati MN-CP-260508-003 跟 Indian MN-CP-260508-003 並存

### 流水號取得策略（Phase 2 必拍）

三選一：

1. **PG sequence per (brand_id, date, p1, p2)** — 純淨但要動態建 sequence、複雜
2. **`SELECT max(sequence_no)+1 FROM repair_orders WHERE ...` + advisory lock** — 簡單、靠 lock 防 race
3. **client gen + unique constraint retry** — 樂觀並發、撞了重抓、UX 較差

推薦 2（advisory lock）：簡單、跟既有 supabase 操作習慣一致、race 機率本來就低（同店同分鐘同前綴並發開單機率近 0）。

---

## 5. 已避開的陷阱（紀律檢查）

- ✅ **不把 11 種前綴組合 hardcode 在 client / helper**（規則進 DB、雙 brand 政策可差異化）
- ✅ **brand_id ≠ subsidiary_id**（會計分錄掛 subsidiary，前綴影響的是科目對映不是統編）
- ✅ **沒把 03-08 的 entity 攬進本提案**（repair_order_items / addons / payments 全交給對應頁面落地）
- ✅ **沒套 canonical items-board / item-detail-view**（gate 性質頁、套不上）
- ✅ **意識到 prefix_p1/p2 是會計軸不只是 display**（必須 typed column、要 index、5×3 矩陣是 GL mapping 依據）
- ✅ **意識到開單快照 vs 上游變動**（warranty_status_snapshot / estimated_subtotal 快照在 jsonb / typed，避免預檢單改了影響 RO 歷史）
- ✅ **意識到流水號併發**（race condition / advisory lock）
- ✅ **意識到雙 brand 政策差異**（規則表雙 brand 各一筆、流水 unique 含 brand_id）
- ✅ **意識到 RO 是 03-08 共同 FK 目標**（不可 metadata 化、必須 typed PK + business key）
- ✅ **沒 commit、沒動 nav_nodes、沒動 DB、沒寫 code**（依任務指示停在 Phase 1）

---

## 6. Phase 2 應該問用戶的問題（給下一階段預留）

> ⚠️ 本任務不執行 Phase 2，僅列出供下次 session 使用。

1. **編號規則落腳**：候選 A（擴 `work_order_prefix_rules`）/ 候選 B（走 `business_rules` rule_kind='ro_prefix_combo'）？需先讀 `work_order_prefix_rules` schema 才能決定。
2. **狀態機**：confirmRepairOrder 後 `appointments.status` 切到「維修中」還是保留「等待中」直到技師打卡？`pre_inspections.status` 改 「已轉 RO」還是維持？
3. **副作用範圍**：confirm 時是否推 LINE 給 (a) SA (b) 指派技師 (c) 客戶？三個目標哪些 Day 1 做、哪些 Day N 補？
4. **「需主管確認」組合**：HTML 沒列的組合（如 RP-WR、AC-WR、OT-WR）UI 顯示什麼？是 disable 還是 warning + 走主管簽核 flow？
5. **流水號策略**：PG sequence / advisory lock / 樂觀重試 三選一？
6. **RO 詳情頁範圍**：`/parts/aftersales/repair-orders/[id]` 是「巨大整合頁」（多 tab 整合 03-08）還是「殼頁」（只顯示 ro_code + status + 跳轉到 03 / 06 / 08 對應子頁）？這影響 03-08 的頁面骨架設計。
7. **雙 brand 範圍**：Indian 要不要也做售後？規則表是否雙 brand 各一筆？
8. **路由命名**：`/parts/aftersales/repair-orders/new?from=<pi_id>` 還是 `/parts/aftersales/pre-inspections/<pi_id>/confirm-ro`（resource-nested URL）？
9. **WC 自動建廠商索賠草稿**：選 WC-WR 時是否自動 INSERT 一張 `warranty_claims` 草稿？這跟既有 warranty 模組（feature-warranty-*-phase1.md）強相關。
10. **estimated_subtotal 快照口徑**：開單當下 sum 預檢項目的金額快照進 `repair_orders.estimated_subtotal`？還是每次 query 動態算？快照避免「預檢單事後改價影響 RO 歷史」、但會跟 03 維修項目編輯後的 actual_subtotal 漂移；漂移是 OK 的（estimated 是預估、actual 是實際）。

---

## 7. 結論（給 caller 用）

本頁是售後工單模組的 **Phase 3「RO 成立閘門」**，性質為**客製 gate page**（不是 list / detail / setting），核心職責是把預檢單轉成 RO 工單：

- **主 entity**：`repair_orders`（**售後模組 core**，03-08 都 FK 到它）
- **唯一寫入 action**：`confirmRepairOrder({ pre_inspection_id, prefix_p1, prefix_p2 })`
- **唯一 SA 決策**：選 P1（5 選 1）+ P2（3 選 1）的工單編號前綴
- **核心業務規則**：11 種合法組合 + 1 種擋掉 + 3 種「需主管確認」fallback → **必須進 DB 不能 hardcode**
- **核心觀察**：`prefix_p1 × prefix_p2` 不只是工單編號美觀，是 **5×3 會計分類矩陣**，決定收入 / 費用怎麼認列（AR_CUSTOMER / AR_VENDOR / EXPENSE / MIXED）
- **建議路由**：`/parts/aftersales/repair-orders/new?from=<pre_inspection_id>`
- **建議落地型態**：方案 B（DB 層 + helper + client view + 副作用先留 hook）
- **核心依賴**：04 預檢單、09 人車檔案、編號規則表（既有 `work_order_prefix_rules` 或 `business_rules`）都需先在或同步落地
- **雙 brand**：brand_id 從 session 取、規則表雙 brand 各一筆、流水 unique 含 brand_id；Indian 視業務決定是否同步開放
- **特別注意**：流水號併發要 advisory lock；warranty / estimated 都用 snapshot 鎖在開單時點；RO 後續編輯不在本頁、屬於 03-08 各自頁面職責

Phase 1 到此打住，等用戶決定要不要進 Phase 2 寫完整提案。
