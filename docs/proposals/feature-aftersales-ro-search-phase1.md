# 提案：售後工單模組 — 工單查詢（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/10_工單查詢.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組目前只在 Ducati nav 樹下；Indian 視業務決定再補）
> 姊妹頁（同模組，共 15 張 HTML）：
> - `feature-aftersales-overview-phase1.md`（00_導覽總覽）
> - `feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）
> - `feature-aftersales-appointments-phase1.md`（01_預約管理看板）
> - **`feature-aftersales-ro-phase1.md`（02 RO 開單閘門 — RO 主表 schema 已決定）**
> - `feature-aftersales-ro-lines-phase1.md`（03 維修項目零件明細）
> - `feature-aftersales-precheck-{ro,sa}-phase1.md`、`feature-aftersales-addons-phase1.md`、`feature-aftersales-addon-loop-phase1.md`、`feature-aftersales-final-check-phase1.md`、`feature-aftersales-management-phase1.md`、`feature-aftersales-checkout-phase1.md`、`feature-aftersales-customers-vehicles-phase1.md`

---

## 0. 頁面定位（最重要 — 釐清「查詢」vs「開單」的職責邊界）

⚠️ **本頁是 RO 模組的「讀取面」、不是「寫入面」**。命名上要刻意把職責切乾淨，避免跟 `02_正式工單RO` 混淆：

### 「查詢」vs「開單」職責矩陣

| 維度 | 02_正式工單 RO（開單） | **10_工單查詢（本頁）** |
|---|---|---|
| 性質 | **客製 gate page**（單筆寫入閘門） | **List View dashboard**（多筆唯讀查詢） |
| 入口路徑 | `/parts/aftersales/repair-orders/new?from=<pre_inspection_id>` | `/parts/aftersales/repair-orders`（list root） |
| 上游 | 預檢單 PI（04） | 02 / 03 / 04 / 05 / 06 / 08 — **全部下游頁面寫入的 RO 都在這查得到** |
| 互動類型 | 2 組 radio + 1 顆 confirm | 6 個 filter + 表格 + 列尾「詳情」按鈕 + Excel 匯出 |
| 寫入 entity | INSERT `repair_orders` | ❌ **完全不寫入**（純讀） |
| 角色 | SA（單一開單員） | **跨角色**：SA / 技師 / 店長 / 客服 / 結帳 / 會計 都會用 |
| 時間軸 | 即時（單一 RO 的出生瞬間） | 歷史 + 進行中（全集合 query） |
| 在 sidebar 的位置 | 不在 sidebar（從預檢單按鈕進入） | **獨立 nav 入口**（售後群組底下、跟 01 預約看板 / 07 管理看板平級） |

**核心觀察**：本頁是 RO 模組的 **canonical list view** —— 02 是 RO 的「出生點」、本頁是 RO 的「索引館」。整個 02-08 鏈條跑完的 RO 都會匯流到這頁，是售後模組「跨角色翻舊帳 / 找單據」的單一入口。

### 它跟 07_售後管理（管理模組）的關係

| 維度 | 07_管理（即時看板） | 10_工單查詢（本頁） |
|---|---|---|
| 時間軸 | **此時此刻**（30 秒自動更新） | 歷史 + 進行中（用戶按查詢） |
| 資料粒度 | 工位 / 技師（按物理單位 group） | **RO 一張單一筆**（按單據 group） |
| 主要對象 | 車間主管 | 全部售後角色 |
| 視覺 | 卡片 / 工位平面圖 / 三指標 | **標準 List View 表格** |
| 寫入 | 派工 action | ❌ 無 |

**重疊但不衝突**：07 是「物理視角」（工位 + 技師佔用），10 是「單據視角」（RO 全集 + filter）。

### 它跟 09_人車檔案的關係

09 是「客戶 / 車輛主檔 → 反查歷次 RO」，本頁是「**RO 全集 → 跨客戶 / 車輛橫向 query**」：

| 入口 | 場景 |
|---|---|
| 09 進 RO | 「王志明的 MONSTER SP 來保養過幾次？」 — 客戶導向 |
| **10 進 RO** | 「**本月所有 WC 保固單**」/「**陳大維 SA 本月開了幾張**」/「**進行中的工單有哪些**」 — 跨客戶橫向 query |

兩頁互補，**不重複建表 / 不重複建 helper** — 都讀 `repair_orders`、差別只在 filter 軸跟入口路徑。

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

**完全不新建 entity** — 本頁 100% 讀取既有 `repair_orders`（02 落地）+ 反查 customer / vehicle / employee / appointment / pre_inspection。

讀取的欄位：

```
repair_orders（讀，02 提案已定義）
  本頁顯示 columns:
    - ro_code                          # 工單號（mono、列印格式）
    - prefix_p1 / prefix_p2            # 業務類型 chip（MN-CP / RP-CP / WC-WR 等）
    - issue_date                       # 進廠日
    - sa_id → employees.name           # SA 姓名
    - status                           # 進行中 / 維修中 / 待結帳 / 已關單 / 已取消
    - estimated_subtotal               # 預估金額（進行中時顯示）
    - actual_subtotal                  # 實際金額（已結帳時顯示，來自 03 維修項目加總或 08 結帳）
    - opened_at / closed_at            # 時間欄位（排序、跨期 query 用）
    - mileage_in                       # 進廠里程（hover 看詳情、不放表格列）
    - warranty_status_snapshot         # 顯示是否保固（chip）
    - metadata.accounting_category_resolved  # 已從 P1×P2 衍生，可直接讀
  本頁不讀的（但 detail page 才會用）:
    - warranty_claim_draft_id / line_notifications / supervisor_approval

  本頁 query 軸（需 index）:
    - (brand_id, status)
    - (brand_id, issue_date DESC)
    - (brand_id, sa_id, issue_date)
    - (brand_id, prefix_p1, prefix_p2, issue_date)
    - (brand_id, customer_id)          # 跨 customers join
    - (brand_id, vehicle_id)           # 跨 vehicles join (車牌搜尋)
    - full-text on ro_code / customer.name / vehicle.plate / items 文字（candidate，見「全文檢索討論」）

customers / vehicles / employees（讀，09 / 既有提案）
  本頁要 join 的欄位:
    - customers.name
    - vehicles.model / vehicles.license_plate
    - employees.name (SA)
    - employees.name (assigned_tech) — 從 repair_order_items 或 RO 派工關聯反查（[需確認]）

repair_order_items（**[需確認]**）
  本頁是否要 join? HTML 的「維修項目」欄顯示 'Desmo定保/煞車皮/鏈條' 字串拼接。
  兩種落腳方式（Phase 2 拍板）:
    a) 反 join 03 的 repair_order_items table、render 時 group_concat
    b) RO 開單時 / 維修變動時把摘要寫進 repair_orders.metadata.items_summary（denormalize 加速 list）
  推薦 b — list 頁面 100 筆 row × 各 join 3-8 行 items 是 list view 殺手；應該 denormalize。
```

### actions

本頁是純讀頁面，**完全沒有寫入 action**。

```ts
// src/domain/repair-orders.ts（已由 02 提案規劃）— 本頁新增以下純讀 helper：

listRepairOrders(filter: {
  brand_id: string                                 // 從 session（RLS 兜底）
  search?: string                                  // 工單號 / 車主姓名 / 車牌（OR 條件）
  prefix_p1?: 'MN' | 'RP' | 'WC' | 'AC' | 'PD' | 'OT' | 'all'  // PD 來自 HTML 範例（PDI 作業）— 02 提案只列 5 個，[需確認補 PD]
  prefix_p2?: 'CP' | 'WR' | 'FR' | 'IN' | 'all'    // IN 來自 HTML 'PD-IN'（內部結算）— 02 提案只列 3 個，[需確認補 IN]
  status?: '進行中' | '竣工複檢' | '已結帳' | '已關單' | '已取消' | 'all'
  sa_id?: string | 'all'
  date_from?: string                               // YYYY-MM-DD
  date_to?: string                                 // YYYY-MM-DD
  // 暫不開：客戶 id / 車輛 id / 金額區間（先看用戶用了再加）
}, options: {
  page?: number
  pageSize?: number                                // 預設 50（design pattern §分頁規範 — RO 累積會 >100 必開分頁）
  sortBy?: 'issue_date' | 'amount' | 'ro_code'
  sortDir?: 'asc' | 'desc'
}) → Promise<{ rows: RoListRow[], totalCount: number, kpis: RoListKpis }>

getRoListKpis(filter) → Promise<{
  total_this_month: number              // 本月工單數
  active_count: number                  // 進行中
  monthly_revenue: number               // 本月產值（客付）= sum(actual_subtotal WHERE status='已結帳' AND prefix_p2='CP' AND month=current)
  avg_amount: number                    // 平均工單金額
}>
// 上面四個 KPI 可以併進 listRepairOrders 同一 RPC，省 round-trip；但若 filter 改變兩者頻率不同，分開實作較單純。Phase 2 拍板。

exportRepairOrdersToExcel(filter) → 直接走 list 結果（最多 page=1, pageSize=10000 抓一次）
// 不另開 server export endpoint；Excel I/O 由 <DataGrid> 內建處理（design pattern §List View 已具備）
```

⚠️ **本頁完全沒有寫入 action** — 列尾「詳情」按鈕走 `router.push('/parts/aftersales/repair-orders/[id]')`、跳轉到 detail page；那邊才有編輯 / 派工 / 結帳的 action（屬於 detail page / 08 結帳 / 07 派工 各自的職責）。

**[需確認] 副作用**：本頁無副作用。唯一邊緣案例 — Excel 匯出是否要寫 audit log（誰、何時、匯出幾筆、filter 條件）？[需確認]

### kpis

HTML 第 18-23 行有 4 個 KPI scorecard 卡片，**會吃 filter** 還是**永遠是「全集」**？

```
本月工單數     47 張      ▲ +5 vs 上月       # 永遠看「本月」、不吃 filter（[需確認]）
進行中         4 張       今日 3 張           # 永遠看「進行中」、不吃 filter（[需確認]）
本月產值（客付） NT$312,800  保固另計          # 本月 + status='已結帳' + prefix_p2='CP'
平均工單金額    NT$6,655                     # 本月 / 工單數
```

**Phase 1 推測**：4 個 KPI 是「本月全集 dashboard」、不吃 filter（filter 改變不重算 KPI）。這跟 HTML 沒寫死、但符合一般 dashboard 慣例。Phase 2 拍板。

**會計軸的衍生 KPI**（HTML 沒列、但 02 提案推導出 P1×P2 是會計軸 → 本頁應該支援）：

- 收入分布：MN-CP / RP-CP / WC-CP / AC-CP / OT-CP 各佔月產值 %
- 保固索賠：WC-WR 月件數 + 月金額（廠商應收）
- 免費單：*-FR 月件數（公關 / 返工 / 賠償成本）

⚠️ 這些 KPI 是 07 售後管理 / 會計報表的範圍，本頁不負責；但 query helper 可以 support `group by P1×P2` 給未來頁面 reuse。

### implied_schema

**完全不新建 schema** — 但本頁迫使 02 提案的幾件事必須在 02 落地時做好：

1. **`repair_orders.metadata.items_summary`**：是 list view 殺手。建議 02 落地時：
   - 開單瞬間從預檢單 `pre_inspection_items` 拼字串、INSERT 時寫入 `metadata.items_summary` (text)
   - 03 維修項目編輯後 trigger / domain helper 內部同步更新此字串
   - 本頁 list 直接讀此字串、不 join

2. **`repair_orders.actual_subtotal`**（本頁需要、但 02 提案只列 `estimated_subtotal`）：
   - 已結帳的 RO 顯示 actual 金額；進行中的顯示 estimated
   - 02 提案應該 ADD COLUMN `actual_subtotal numeric(12,2)`、由 08 結帳收款落地時更新
   - 或可以 derived view，但 RO 結帳後 actual_subtotal 為事實表、走 typed column 簡單

3. **`repair_orders.metadata.items_count`**（候選優化）：列尾顯示 「3 項」之類 — 若 items 字串太長截斷時用得到。

4. **全文檢索 index（候選，Phase 2 拍板）**：
   - HTML 第 25 行的搜尋框 placeholder 是「工單號 / 車主姓名 / 車牌」，三軸 OR 搜尋
   - 候選方案 a：query 端三個 ILIKE OR + 適當的 trgm index 即可（POC 階段足夠）
   - 候選方案 b：建 `tsvector` 全文索引、跨 ro_code + customer.name + vehicle.plate + items_summary
   - **本頁 Phase 1 推薦 a**（簡單、POC 階段 dataset 小）；b 等實際資料量上來再升級
   - **跨表搜尋（料件名搜到 RO）暫不支援** — 03 提案的 `repair_order_items.part_name` 暫不進本頁 search index；用戶想找「最近哪幾張單用過 X 料件」應該走「料件庫存查詢頁」反查

### implied_pages

| 頁面 | 路徑（建議） | 類型 | 範本 | 備註 |
|---|---|---|---|---|
| **RO 列表 / 工單查詢**（本頁） | `/parts/aftersales/repair-orders` | **標準 List View** | `parts/setup/items/_components/items-board.tsx` + `<DataGrid>` | 6 filter + KPI scorecard + 表格 + Excel 匯出 |
| RO 詳情頁 | `/parts/aftersales/repair-orders/[id]` | Page View | item-detail-view.tsx | 整合 03-08 內容多 tab — **不在本頁落地**（屬另一個提案、可能是 02 / 03 / 08 的合併產物） |
| RO 開單 | `/parts/aftersales/repair-orders/new?from=<pi_id>` | 客製 gate | 不適用標準 | 由 02 提案落地 |

**本頁完全符合 canonical List View 範本** —— 不像 02 是 gate page、不像 07 是 multi-tab dashboard：

- ✅ 上方 filter bar：6 個欄位（工單號/車主/車牌、業務類型、狀態、SA、期間、KPI 不算 filter）+ [查詢][重置][匯出]（**不需要 [+ 新增]** — 開單入口在預檢單，不在本頁）
- ✅ KPI scorecard 4 卡片（在 filter bar 上方、design pattern 沒明定但可加；推薦放上）
- ✅ Toolbar：「共 X 筆」+ 右側「匯出 Excel」（DataGrid 自帶）
- ✅ 表格：`<DataGrid>` + column visibility + sort + 分頁（必開、Sept 30 後 RO 累積會 >100）
- ✅ 列尾操作：**只一顆 [詳情]**（不該有 [編輯][停用][刪除] — RO 是流水單據、不該在 list 直接刪改；要編輯走 detail page）
- ❌ **沒有 inline create modal、沒有 inline edit cell** — 本頁是純讀

**雙 brand**：兩個 brand 共用同一個路由 / 同一個 board / 同一個 helper，靠 RLS 切資料；nav_nodes 雙 brand 各 INSERT 一筆（Indian 視業務決定是否同步開放）。

---

## 2. 在售後流程中的定位摘要

| 階段 | 對映 HTML | 對映 entity | 本頁角色 |
|---|---|---|---|
| Phase 1 預約進廠 | 01 | appointments | 反查（從 RO 跳回 appointment） |
| Phase 2 SA 預檢 | 04 | pre_inspections | 反查 |
| Phase 3 RO 成立 | **02** | **repair_orders** | **本頁的主資料來源** |
| Phase 4 維修項目 | 03 / 04 / 05 | repair_order_items / addons | 本頁顯示「項目摘要」字串、不展開 |
| Phase 5 竣工複檢 | 06 | final_inspections | 反查（detail page 才展開） |
| Phase 6 結帳關單 | 08 | payments / invoices | 本頁顯示金額 + 狀態（已結帳 / 已關單）、closed_at 用來 query 跨期 |

**核心定位**：本頁是 RO 全集的 **lookup index** —— 跨角色翻舊帳、找特定單據、做月底報表盤點。可以視為 02-08 整個鏈條的「summary view」。

---

## 3. Filter / Facet 維度（**Phase 1 重點分析**）

HTML 第 24-32 行給了 6 個 filter，下面把它們對應到 DB 軸並分類：

### 已給 6 個 filter

| HTML filter | 對應 DB 欄位 | facet 性質 | 索引狀態（依 02 提案） | 備註 |
|---|---|---|---|---|
| 工單號/車主姓名/車牌 | `ro_code` / `customers.name` / `vehicles.license_plate` | **全文 OR** | `ro_code` 已 unique；customer/vehicle 需 trgm | 跨表 OR，[需確認] tsvector vs ILIKE+trgm |
| 業務類型 | `prefix_p1-prefix_p2` 拼接 | discrete enum | 02 已有 `(brand_id, prefix_p1, prefix_p2, issue_date)` | HTML 列「MN 定保 / RP 機修 / WC 保固 / AC 事故 / PD PDI / OT 其他」 — 用 P1 enum + P2 enum 兩段 |
| 狀態 | `status` | discrete enum | 02 已有 `(brand_id, status, issue_date DESC)` | 「進行中 / 竣工複檢 / 已結帳 / 已關單 / 已取消」 — 5 種，[需確認] '竣工複檢' 是否獨立 status 還是 status='維修中' + 06 完成標記 |
| SA | `sa_id` | FK lookup | 需加 `(brand_id, sa_id, issue_date)` index | 從 `employees WHERE role='SA'` 拉清單；雙 brand 各自的 SA 名單 |
| 期間（month） | `issue_date BETWEEN ...` | range | 02 已有 `(brand_id, issue_date DESC)` | HTML 用 `<input type="month">` — Phase 2 可考慮 date range picker |
| —（隱含） | `brand_id` | RLS | tenant-cut | 從 session 自動套用、UI 不顯示 |

### 推薦補加的 filter（Phase 2 拍板）

| 候選 filter | 來源 | 為何補 |
|---|---|---|
| 客戶 | `customer_id`（自動完成搜尋） | 「特定客戶的所有 RO」是高頻 query；現在要打客戶姓名走全文，慢且不精準 |
| 車輛 | `vehicle_id`（或車牌精確輸入） | 同上，「特定車輛的所有 RO」 |
| 技師 | `repair_order_items.assigned_tech_id`（join）| 「特定技師本月做了哪幾張」— 對店長 / 計薪 / 績效有用 |
| 金額區間 | `actual_subtotal / estimated_subtotal BETWEEN` | 找高單價單 / 異常單 |
| 保固狀態 | `metadata.warranty_status_snapshot->is_valid` | 找保固單 / 過保單分布 |
| 付款狀態 | 來自 08 結帳收款的 `payments.status` | 找未收款 / 部分收款 |

**Phase 1 建議**：Day 1 先做 HTML 既有 6 個 + brand_id RLS；客戶 / 技師 / 金額 等等 Phase 2 加，**不要一次做完**（YAGNI、看實際用戶用什麼）。

### filter UI 排版（照 design pattern §List View Filter Bar）

```tsx
<section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
  <div className="flex gap-2 items-end flex-wrap">
    {/* 1. 全文搜尋（單獨一欄、寬一點） */}
    <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
      <label className="text-[11px] text-[#9A9890] font-medium">工單號 / 車主 / 車牌</label>
      <input … />
    </div>
    {/* 2. 業務類型 → 用 P1 + P2 兩段 select 或一個合併 select（HTML 用一個合併 select）*/}
    {/* 3. 狀態 select */}
    {/* 4. SA select */}
    {/* 5. 期間 month input */}

    <div className="flex gap-2 ml-auto">
      <button>查詢</button>
      <button>重置</button>
      {/* 注意：不放 [+ 新增] —— 開單入口在預檢單 */}
    </div>
  </div>
</section>
```

⚠️ **「業務類型」filter 維度設計**（Phase 2 拍板）：

- 候選 a：一個 select、值是「MN-CP / RP-CP / WC-WR / ...」13 個合法組合
- 候選 b：兩個 select（P1 / P2 分開）— **更接近實際 query 需求**（「本月所有 WC」、「本月所有 -FR 免費單」這類 query a 做不到）

推薦 b（兩個獨立 select）。

---

## 4. 全文檢索 / 跨表搜尋的取捨（**Phase 1 重點分析**）

任務明確問：**是否需要全文檢索 / 跨表搜尋（料件名搜到 RO）**。逐層拆：

### 4.1 同表多欄全文（必做）

`ro_code` + `customer.name` + `vehicle.license_plate` 三軸的 OR 搜尋是 HTML 明定需求。三種落腳：

| 方案 | 描述 | 適合場景 |
|---|---|---|
| **a. ILIKE OR + trgm index** | `WHERE ro_code ILIKE '%X%' OR customer.name ILIKE '%X%' OR vehicle.plate ILIKE '%X%'` + 在 customer.name / vehicle.plate 上加 `pg_trgm` GIN | POC 階段、資料量 <10K RO；簡單；**推薦** |
| b. tsvector 全文索引 | 把三個欄位 concat 進 `repair_orders.search_tsv tsvector` GENERATED column、加 GIN | 資料量 >50K RO；中文 tsvector 需用 zhparser / pgroonga；POC 階段過度設計 |
| c. 外部全文（Meilisearch / OpenSearch） | 外掛 index | 完全過度設計、不考慮 |

**Phase 1 推薦 a**。Phase 2 落地時加 trgm extension（若未啟）+ index：

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX ON customers   USING gin (name gin_trgm_ops);
CREATE INDEX ON vehicles    USING gin (license_plate gin_trgm_ops);
-- ro_code 已 unique（其實 unique btree + prefix LIKE 'XX%' 就夠快、不一定要 trgm）
```

### 4.2 跨表搜尋（料件名 → RO）— **不做**

「能不能用『煞車皮』搜到所有換過煞車皮的 RO？」

**答：本頁不做、屬另一個頁面職責**。理由：

1. **頁面 scope**：本頁是「**RO 主表** lookup index」、不是「`repair_order_items` lookup index」。把 item 級搜尋塞進來，違反單一責任原則。
2. **效能**：跨 `repair_order_items` join + 全文搜尋會在大表上做 nested loop，且結果是 RO 級（要去重 / group），複雜度爆炸。
3. **替代方案**：另開頁面「料件使用追蹤」/「料件歷史 RO」走 `repair_order_items` 主表 list view + 反查 RO — 跟本頁互補不重疊。
4. **介於兩者間的妥協**：本頁 search 含 `repair_orders.metadata.items_summary` 字串（即 03 維修項目的摘要 denormalize 進 RO 主表）— 搜「煞車皮」可命中「Desmo定保/煞車皮/鏈條」這種 summary 字串。**這就涵蓋 80% 用戶實際需求**，不需做真正的跨表搜尋。

**Phase 1 推薦**：

- 全文搜尋：`ro_code OR customer.name OR vehicle.license_plate OR repair_orders.metadata.items_summary` 四軸 OR + trgm
- 不做真正的 cross-table item search
- 真要做「料件歷史 RO」是另一個提案

---

## 5. 建議落地型態（給 Phase 2 / Phase 3 用戶拍板）

| 方案 | 描述 | 適合場景 |
|---|---|---|
| **A. 最小可用版** | HTML 既有 6 filter + 表格 + KPI scorecard + Excel 匯出；helper 在 `src/domain/repair-orders.ts` 內加 `listRepairOrders / getRoListKpis` 兩支；items 摘要直接 join 03 表現算（先不 denormalize） | 用戶要快速上線「能查工單」就好；資料量小可接受 |
| **B. 推薦版** | A + RO 主表加 `metadata.items_summary` denormalize（02 / 03 落地時順手寫入）+ trgm index 加在 customer.name / vehicle.plate；分頁必開（50/頁）；KPI 跟 list 用同一個 helper 但 separate RPC 避免 over-fetch | 推薦。一次把效能跟 UX 都打好底 |
| **C. 完整版** | B + 加客戶 / 技師 / 金額 / 保固 / 付款 5 個額外 filter + 全文 tsvector + Excel 匯出 audit log + KPI 可吃 filter（filter 改 KPI 也改）+ deeplink 分享 query state（URL hash） | 等用戶實際 dogfood 後再加；Day 1 不做 |

**Phase 1 推薦 B**：

- DB 層：02 落地時順便補 `metadata.items_summary` + `actual_subtotal`（02 提案的 ADD COLUMN）
- Index 層：trgm extension + 3 個 gin index
- Helper：`listRepairOrders / getRoListKpis` 純讀、走 supabase 直連
- UI：標準 `<DataGrid>` + KPI 4 卡片 + filter bar 6 欄

### 跟 02 提案的協作關係

本頁 Phase 2 落地**必須等 02 先落地或同時落地**：

| 02 必須提供 | 本頁才能做 |
|---|---|
| `repair_orders` 表 + RLS | 全部 |
| `repair_orders.metadata.items_summary` (text) | items 摘要欄位 |
| `repair_orders.actual_subtotal` (numeric) | 金額欄位（已結帳的）|
| `(brand_id, sa_id, issue_date)` index | SA filter 性能 |

**Phase 1 給 caller 的訊號**：02 提案要補上面四項，本頁才能 Day 1 上線。

### 雙 brand 考量

- 一個路由 `/parts/aftersales/repair-orders`、兩個 brand 共用、RLS 切資料
- SA 下拉清單依 brand 過濾（Ducati SA 不會看到 Indian SA）
- nav_nodes 雙 brand 各一筆，Indian 視業務決定 `coming_soon`
- KPI 「本月產值」算的是當前 brand 的、不混算（RLS 兜底就會自動切）

---

## 6. 已避開的陷阱（紀律檢查）

- ✅ **不新建任何 entity / table**（純讀既有 RO + customers / vehicles / employees）
- ✅ **不寫入任何資料**（detail page / 02 / 08 才寫）
- ✅ **不重複定義 RO schema**（102 提案已定、本頁只 reference）
- ✅ **不跨表搜尋料件**（明確劃為另一個頁面職責）
- ✅ **不過度設計全文索引**（POC 階段用 trgm + ILIKE OR 即可、不上 tsvector / 外部 ES）
- ✅ **不在 list 列尾放 [編輯][停用][刪除]**（RO 是流水單據、不該 in-list mutate；只放 [詳情]）
- ✅ **不在本頁放 [+ 新增] 按鈕**（開單入口在預檢單、不從 list 開單）
- ✅ **brand_id 切資料靠 RLS、不在 helper 寫 WHERE**（多一層保險）
- ✅ **items 摘要 denormalize 到 RO 主表**（明確點出 02 / 03 要協作的點、避免 list view N+1 query）
- ✅ **分頁必開**（design pattern §分頁規範、RO 累積會 >100）
- ✅ **沒 commit、沒動 nav_nodes、沒動 DB、沒寫 code**（依任務指示停在 Phase 1）

---

## 7. Phase 2 應該問用戶的問題（給下一階段預留）

> ⚠️ 本任務不執行 Phase 2，僅列出供下次 session 使用。

1. **路由命名**：`/parts/aftersales/repair-orders`（list root）OK 嗎？跟 02 開單 `/.../new` 共用 root、跟 detail page `/.../[id]` 一致？
2. **KPI 4 卡是否吃 filter**：filter 改變時 4 個 KPI 是重算（吃 filter）還是永遠看「本月全集」（不吃 filter）？兩種都有合理場景，要決定。
3. **狀態列舉**：HTML 列「進行中 / 竣工複檢 / 已結帳 / 已關單 / 已取消」5 種。02 提案列「進行中 / 維修中 / 待結帳 / 已關單 / 已取消」5 種。**對不齊**，需要校準成單一狀態 enum（influence 02 / 03 / 06 / 08 共識）。
4. **業務類型 filter UI**：一個合併 select（13 個合法組合）vs 兩個獨立 select（P1 / P2）？推薦後者。
5. **prefix_p2 補 'IN'（內部結算）/ prefix_p1 補 'PD'（PDI 作業）**：HTML 範例有 `PD-IN-260503-001`（PDI 新車作業、內部結算），但 02 提案的 P1 enum 只列 'MN/RP/WC/AC/OT'、P2 只列 'CP/WR/FR'。需要 02 enum 擴張 + 業務規則表加組合白名單。
6. **items_summary 怎麼維護**：02 開單寫一次；03 維修項目編輯時 trigger / domain helper 同步？由 03 提案落地時負責、本頁只讀。
7. **actual_subtotal 何時寫**：08 結帳收款落地時更新？還是 03 維修項目編輯時即時算？影響「進行中 RO 顯示哪個金額」。
8. **search 範圍**：全文搜尋是否要含 `items_summary`？（強烈建議要、可命中 80% 「找用過某料件的單」需求、不需另開頁面）
9. **Excel 匯出範圍**：當頁 / 當篩選全集 / 全表？推薦「當篩選全集」（最多 10000 筆、超過就提示）。
10. **權限分層**：所有售後角色都能看全店 RO 嗎？還是 SA 只能看自己開的、店長能看全店、會計能看跨店？影響 RLS 是否要從「brand_id」進一步收緊到「store_id + role」。
11. **detail page 路徑**：`/parts/aftersales/repair-orders/[id]` 列尾 [詳情] 跳到這頁、這頁的 schema 由本頁還是 02 還是 03 提案落地？（推薦獨立一個 detail proposal、整合 02-08 內容多 tab）

---

## 8. 結論（給 caller 用）

本頁是售後工單模組的 **canonical List View** —— 性質為**標準 list dashboard**（非 gate、非 wizard、非 setting）、適用 design pattern §List View 規格 + `<DataGrid>` 元件，**完全不新建 entity**、100% 依賴 02 提案的 `repair_orders` 表。

**「查詢」vs「開單」職責邊界**：

- **02 開單**：客製 gate page、SA 單一寫入閘門、`/parts/aftersales/repair-orders/new?from=<pi_id>`、唯一寫 action `confirmRepairOrder`
- **10 查詢（本頁）**：標準 list view、跨角色純讀、`/parts/aftersales/repair-orders`、唯一 helper `listRepairOrders + getRoListKpis`
- **detail page**（另一個提案）：page view、整合 03-08 內容多 tab、`/parts/aftersales/repair-orders/[id]`、編輯 action 散落 03-08 各自負責

**核心觀察**：

- 列尾**只放 [詳情]**、不放 [編輯][停用][刪除]（RO 是流水單據、in-list mutate 風險高）
- **不放 [+ 新增]** — 開單入口在預檢單
- **不跨表搜尋料件**（屬另一頁職責、本頁靠 `metadata.items_summary` denormalize 涵蓋 80% 需求）
- **全文用 ILIKE + trgm 就夠**（POC 階段不上 tsvector）
- **分頁必開**（>100 row 守則）
- **02 必須協作**：補 `metadata.items_summary` + `actual_subtotal` + `(brand_id, sa_id, issue_date)` index

**建議路由**：`/parts/aftersales/repair-orders`（list root）

**建議落地型態**：方案 B（補 denormalize + trgm index + 標準 list view + KPI scorecard）

**雙 brand**：共用路由 / 共用 helper / RLS 切資料 / nav_nodes 雙 brand 各一筆 / Indian `coming_soon` 視業務

**核心依賴**：02 RO 主表必須先（或同步）落地、03 維修項目 / 09 人車檔案 / 員工主檔提供 join 來源；無寫入副作用，唯一 [需確認] 邊緣是 Excel 匯出是否要 audit log。

Phase 1 到此打住，等用戶決定要不要進 Phase 2 寫完整提案。
