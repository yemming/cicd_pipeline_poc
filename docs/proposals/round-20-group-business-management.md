# 第二十輪 — 集團管理 · 商務管理層：GRP12 集團零件財務總覽 + GRP14 定價折扣設定

**日期**：2026-05-30
**Spec 來源**：
- `docs/20260529/DealerOS_最終版本/05_集團管理/03_商務管理/GRP12_集團零件財務總覽_v2.html`（1160 行）
- `docs/20260529/DealerOS_最終版本/05_集團管理/03_商務管理/GRP14_定價折扣設定_v1.html`（859 行）

**前一輪**：第十九輪 客戶經營層 GRP18 集團客戶動態（已結案上線 commit `e62d7d7`）
**狀態**：⏳ 規劃中，**等 Ming 拍板後才動工**

> 本輪範圍經 Ming 拍板：**本輪做 GRP12 + GRP14，GRP13 促銷活動管理下一輪**。GRP13/14 spec 都是「真 CRUD + 審核狀態機」，Ming 拍板 **GRP14 做真 CRUD（完整功能）**，不是唯讀 demo。

---

## 〇、本輪與前四輪的本質差異（先講清楚，這不是第五個 seed dashboard）

round-16~19 四輪集團管理頁全是**唯讀分析 dashboard**：seed kpi_snapshots → helper 純讀 → D3 畫圖。本輪兩頁性質分裂：

| 頁 | 性質 | 對應前例 |
|---|------|---------|
| **GRP12 集團零件財務總覽** | **唯讀分析 dashboard**（雙視圖：集團總覽 + 單店深鑽） | 同 round-16~19，最像 GRP18 customer-dynamics 的單頁雙視圖 |
| **GRP14 定價折扣設定** | **真 CRUD + 審核狀態機**（建立→送審→核准生效；異動稽核 log） | 像 master-data design pattern（list + detail/side-panel），但多了審核流 |

**所以本輪要同時動用兩套 SOP**：GRP12 走「集團分析頁地基」（seed + group-analytics helper + D3），GRP14 走「design pattern CRUD」（Result 型別 server actions + 狀態機 + 稽核）。**這是本輪工程量遠大於前四輪的根因，也是分輪把 GRP13 切到下一輪的原因。**

---

## 一、為什麼做

集團管理金字塔前四輪看完「人(GRP07/08) → 店(GRP09/10/11) → 戰略(GRP16/17) → 客戶(GRP18)」四面，全是**「看數據」**。商務管理層第一次進到**「做生意 / 訂規則」**：

- **GRP12 集團零件財務總覽** = 看「**零件這條 P&L 線**」的集團健康度：營收/毛利率/周轉/呆滯/供應商集中度/精品加裝。是把分散在五店的零件財務壓成一張集團視圖 + 單店深鑽。**仍是「看」，但看的是商務面而非人員/客戶面。**
- **GRP14 定價折扣設定** = 集團總部**「訂規則」**：對每個品項/車型設「建議售價 + 折扣授權上下限」，門店不得低於下限、低於就觸發越界警示。**這是集團對門店的定價治理工具，第一個真正會寫入 DB 的集團管理頁。**

> **前四輪集團頁都是「總部坐在塔頂看」，GRP14 第一次讓總部「下指令」——定價折扣的權力從門店收歸集團統一控管。這是建議書「賣給代理商集團層」最硬的賣點：不是報表，是治理。**

---

## 二、重用 round-16~19 地基（去風險）

校驗後仍 100% 成立的可複製資產：

- **page wiring（GRP12）**：admin gate（`getCurrentUserAndAdmin()` → 未登入 `redirect("/login")`、非 admin 紅字 main）+ `getActiveScope().brand_id` + `Promise.all([helper...])`，直接拷 `health-score/page.tsx`、`customer-dynamics/page.tsx`。
- **5 間 demo 門店**：台北⭐ `c557f308-c236-46db-80e2-968034056eab`、台中🚨 `17000000-…-0001`、高雄 `…0002`、台南📉 `…0003`、嘉義🌱 `…0004`，全 `level=2 type=store`、`brand_id='indian'`（實測確認，**無桃園**）。
- **kpi_snapshots seed 容器**：`org_id`（門店維度）/`period_month`/`metadata._seed`（標 `round20-business-mgmt`）。前四輪量級 round16=86 / 17=383 / 18=110 / 19=177。
- **D3 元件庫**：scatter / line / multiline / radar / gauge / funnel / donut / grouped-bar 全可續用。GRP12 主要用 grouped-bar（雙軸營收+毛利）/ donut（品類）/ line（6月走勢）/ 水平 bar（周轉、供應商集中度）。**本輪大概率 0~1 個新元件**（水平 bar 變體可能要抽，見 Q）。
- **共用常數模式**：`group-analytics-labels.ts`（避 use-server 物件 export 陷阱），本輪零件品類標籤/呆滯閾值/周轉目標常數放這。
- **DataGrid + design pattern（GRP14）**：`src/components/data-grid`、`item-detail-view.tsx` 的 view/edit/create 三 mode、`item-actions.ts` 的 `Result<T>` server action 樣板（CLAUDE.md §SOP 完整規格）。

---

## 三、資料真相校驗（本輪鐵律，全程實測 DB / 讀碼，逐條校正）

> round-19 最大教訓：「以為 DB 有、實際沒有」。本節每條都有 count/實值佐證，不是推測。**GRP12 有大利多（核心 metric 早 seed 好），GRP14 定價底料真有但折扣治理層要新建。**

### 3.1 GRP12 集團零件財務總覽 — 資料就緒度

**✅ 真實可用（kpi_snapshots 已 seed，round16/17，五店齊，period 2026-05）：**

| metric_key | 五店實值（台北/台中/高雄/台南/嘉義） | 用途 |
|-----------|----------------------------------|------|
| `parts_direct_sale_amt` | 680K / 310K / 520K / 360K / 180K | 門店零件營收 grouped-bar + 集團 KPI（SUM） |
| `parts_direct_sale_margin` | 0.38 / 0.25 / 0.33 / 0.31 / 0.30 | 毛利率（雙軸右）+ 集團 KPI（AVG） |
| `parts_turnover` | 9.2 / 5.8 / 8.0 / 7.2 / 6.5 | 周轉率水平 bar + 集團 KPI |
| `parts_deadstock_pct` | 0.04 / 0.14 / 0.06 / 0.08 / 0.09 | 呆滯率 + 庫存健康表 status badge |
| `parts_fulfill_rate` | 0.96 / 0.82 / 0.92 / 0.89 / 0.86 | 庫存健康輔助 |
| `accessory_install_rate` | 0.42 / 0.22 / 0.34 / 0.28 / 0.26 | 精品加裝率 KPI + 門店表 |
| `accessory_margin` / `pen_accessory` / `mix_*` | 五店齊 | 精品毛利 / 滲透 / 品項結構輔助 |

> **大反轉**：GRP12 主體（5 KPI + 門店營收/毛利對比 + 周轉率 bar + 庫存健康表 + 精品加裝率）**用既有 snapshot 就能搭**，不必重 seed。helper 上捲集團值 = SUM/AVG 五店。

**⚠️ 必 seed（DB 確實沒有，逐項）：**

| # | 項目 | 為什麼要 seed | 估列數 |
|---|------|--------------|--------|
| 1 | 呆滯庫存「金額 NT$」（KPI 卡 + 門店表） | snapshot 只有呆滯**率%**、無金額 | 5（per-store）+ 1 集團 = **6** |
| 2 | 零件毛利率 6 月走勢（集團 + 5 店） | 零件財務 snapshot 只有 2026-05 單月 | (集團+5) × 6 月 = **36** |
| 3 | 零件品項結構 donut（4 類金額佔比） | `items.category` 實值是 **8 類功能分類**（車身/煞車/傳動/排氣/懸吊/引擎/耗材/電氣），與 spec 4 類（原廠保養件/維修零件/精品配件/輪胎）**完全不同**；硬 join 出來的 donut 跟 spec 對不上 | 集團 4 類 + 5 店各 4 類 = **24** |
| 4 | 精品加裝明細表（門店×車型：加裝台數/精品營收/台均/TOP品項/車型別加裝率） | `repair_order_addons` 實測 **indian = 0 筆**（28 筆全 ducati）；無對外精品銷售表 | 門店 5 × 約 4 欄 + 車型別 ≈ **30** |
| 5 | 單店深鑽 SKU 明細 / 呆滯清單 / 採購vs出庫月趨勢 | raw `inventory_cost_state`/`stock_issues` **全 201 行落台北一店**，其他 4 店 raw=0 → 除台北外無 SKU 級資料 | metadata 陣列裝匿名 SKU，集團+重點店 ≈ **8~12** |
| 6 | 本月集團快覽 mini-stat（採購額/入庫筆數/出庫筆數/盤差） | 部分可實算但跨店不齊、demo 一致性差 | **6** |
| 7 | 集團總庫存金額 / by 店拆分 | `inventory_cost_state` 集團總額可實算（indian 18.32M）但 **by warehouse→org 全落台北**，by 店拆必 seed | 5 |

**🟡 可實算但建議 seed 補**：供應商採購集中度（`purchase_orders.vendor_id` + `suppliers` + `purchase_order_lines.line_amount_total` 實測 indian 12 單/24 行/採購額 148,050 → 量小、撐不起好看的 top-10 bar）→ **seed top-10 集中度 demo 值**。

**🔑 語意拍板點**：GRP12「零件營收」在 DB 的本質——indian 零件出庫 273 單全是 `ro_picking`（維修工單領料計價，24.24M）+ 4 筆 `internal_sale`，**沒有對外零售的零件訂單線**。所以「零件營收」= 維修零件計價。snapshot 的 `parts_direct_sale_amt` 是抽象 demo 值、不受此影響，但**頁面語意要 Ming 確認 OK**（見 Q5）。

**GRP12 seed 合計 ≈ 6+36+24+30+12+6+5+10(供應商) = ~129 列**（對齊前四輪量級）。

### 3.2 GRP14 定價折扣設定 — 資料就緒度（真 CRUD）

**✅ 定價底料真有：**

| 資料 | 來源 | 實測 | 結論 |
|------|------|------|------|
| 零件/精品「建議售價 + 成本」 | `items.suggested_price` / `items.standard_cost` | indian 各品類齊（耗材30/車身28/煞車27/電氣24/引擎24/傳動24/懸吊21/排氣21，皆 has_price=has_cost；唯「工資服務」30 筆無成本） | ✅ 真實，定價表直接讀 |
| 整車「建議售價」 | `vehicle_models.msrp` | indian 15 台有 msrp | ✅ 售價真實 |
| 整車「成本」 | `vehicle_models.standard_cost` | indian 15 台 **全 = 0** | ⚠️ 毛利率算不出 → 見 Q6 |

**❌ 折扣治理層完全缺（GRP14 的核心、要新建）：**

| spec 要的 | DB 現況 | 結論 |
|----------|---------|------|
| per-品項/車型「折扣授權上下限」（disc_min/disc_max） | `business_rules.discount_authority`（indian 5 筆）是 **role-based**（sales_rep 5% / sales_manager 10% / store_manager 15% / gm 25%），**不是 per-item 定價折扣**，語意完全不同 | ❌ 需新資料結構 |
| 審核狀態機（draft→review→approved） | 無任何欄位 | ❌ 新建 |
| 定價異動稽核 log（誰、何時、舊→新值） | 無 | ❌ 新建 |
| 門店實際成交 vs 建議售價偏差 | 整車成交在 `sales_orders`（123 筆）、零件在 `stock_issue_lines`，但跨店偏差率要算且 demo 一致性差 | 🟡 seed 偏差 demo 值（4-5 列）|

> **GRP14 的架構決策（本輪最大拍板題 Q1）**：折扣授權 + 審核狀態 + 稽核 log 落點。CLAUDE.md 天條「規則類用 `business_rules` 一張打天下 + rule_kind + config jsonb」。`business_rules` 既有 `config jsonb`/`scope_type`/`scope_id`/`effective_from/to`/`is_active`/`priority` 正好裝定價政策。**建議走 business_rules（rule_kind='pricing_policy'）**，詳見 Q1。

---

## 四、Scope（兩頁，串行三 Batch）

### 🔴 Batch A — GRP12 地基（seed + helper + 元件）

| Task | 內容 |
|------|------|
| **A0a** | GRP12 demo seed（路線 b，**不需新 DDL**）：全塞 `kpi_snapshots`、`brand_id='indian'`、`metadata={"_seed":"round20-business-mgmt"}`。逐項見 §3.1（呆滯金額 6 / 6月走勢 36 / 品類 donut 24 / 精品明細 30 / SKU 陣列 ~10 / mini-stat 6 / 庫存金額 5 / 供應商 10）≈ **~129 列**。 |
| **A0b** | append `getGroupPartsFinancials(brandId)`（集團 5 KPI + 門店營收/毛利 + 周轉 + 庫存健康 + 品類 donut + 6月走勢 + 供應商集中度）+ `getStorePartsDrilldown(brandId, storeId)`（單店 KPI + 採購vs出庫 + SKU 明細 + 呆滯清單 + 精品明細）到 `src/domain/group-analytics.ts`。常數（品類標籤、周轉目標、呆滯閾值）放 `group-analytics-labels.ts`。 |
| **A0c** | D3：大多複用既有（grouped-bar 雙軸 / donut / line / 水平 bar）。若水平 bar（周轉、供應商集中度、車型別加裝率）需要獨立元件 → 抽 `<D3HBar>`（見 Q7）。 |

### 🔴 Batch B — GRP14 真 CRUD（資料層 + server actions + 頁面）

| Task | 內容 |
|------|------|
| **B0a** | 定價政策資料層（依 Q1 拍板）：seed `business_rules`（rule_kind='pricing_policy'，indian，scope_type='item'|'vehicle_model'，scope_id=品項/車型 id，config={disc_min, disc_max, status, effective_date, msrp_snapshot, cost_snapshot}）約 16 筆（spec 整車 8 + 零件精品 8）+ 偏差監看 seed（4-5 列，可塞 kpi_snapshots 或 demo 常數）+ 稽核 log seed（config.audit_log[] 或獨立 rule_kind='pricing_audit'，~5 筆）。 |
| **B0b** | `src/lib/group/pricing-policy-actions.ts`（**Result 型別、不 redirect**）：`createPricingPolicyAction` / `updatePricingPolicyAction` / `submitForReviewAction`（draft→review）/ `approvePolicyAction`（review→active）/ `rejectPolicyAction`（review→draft）/ `setPricingActiveAction`。每個 action `requirePermission`（admin gate）+ 寫 business_rules + append 稽核 log。`src/domain/group-pricing.ts` helper（list/get/讀 items+vehicle_models join 定價底料）。 |
| **B0c** | `/group/pricing` 頁：list view（cat-tabs 整車/零件/精品/待審 + 定價表 DataGrid，含建議售價/成本/毛利率/折扣授權範圍/生效日/狀態 badge）+ side panel（新增/編輯定價：售價/成本→自動算毛利、折扣下限/上限驗證、生效日、適用範圍、備註）+ 狀態機按鈕（送審/核准/退回）+ 門店成交偏差 D3 圖（`<D3HBar>` 偏差率，零線+警戒線）+ 異動稽核 log 時間軸。UX 規範：pending 鎖 + spinner + banner（CLAUDE.md §UX）。 |

> ⚠️ GRP14 是 side-panel CRUD（spec 用右側 slide panel），非 detail page。沿用 spec 的 side panel 互動 + 本專案色票/字級規範。CRUD 寫入一律 Result 型別 + 樂觀更新 + banner。

### 🟢 Batch C — nav + 驗證

- **nav_nodes 新建「商務管理」level2 群組**（雙 brand，集團管理底下）：實測集團管理現有 level2 = 集團數據(0)/個人能效(1)/策略評估(2)/AI 用量(91)，**無商務管理** → 新建 `sort_order=3`（接策略評估後、AI 用量前）。parent = `f3d7a716-…`（ducati）/`e072b84b-…`（indian）。底下掛 GRP12 `/group/parts-financials` + GRP14 `/group/pricing` 兩個 level3，`page_kind='react_route'`、`is_active=true`、`is_admin_only=true`（集團決策者頁）。**雙 brand 各 1 群組 + 2 子節點 = 6 筆 INSERT。**
- **Deploy-then-Test**：push → Zeabur 自動部署 → 打部署後 URL 跑 Playwright render-smoke（GRP12 集團視圖 + drill-down + GRP14 list + side panel 開關 + 狀態機切換）+ **GRP14 真寫入驗 DB 落地**（建一筆定價政策 → 查 business_rules 確認；改折扣下限 → 查稽核 log）+ 截圖存 `docs/test-evidence/round-20/`。

**預估**：GRP12（dashboard，地基已半成）+ GRP14（真 CRUD，工程量大）約 4-6 天。**本輪排除**：GRP13 促銷活動管理（需新建 promo_campaigns 表 + 海報產出，獨立成 round-21）、GRP19+ 其餘集團子模組。

---

## 五、開工前要 Ming 拍板的題（共 7 題，附預設提案 + 理由）

> 每題 OK 就鎖、要改標 delta。Q1 是本輪架構大題（GRP14 真 CRUD 資料落點），最關鍵。

> ### ✅ 拍板結果（2026-05-30，Ming 全數採建議方案、無 delta）
>
> | 題 | 決議 |
> |---|---|
> | **Q1** GRP14 定價政策資料落點 | **A** `business_rules`（rule_kind='pricing_policy'，config 裝 disc_min/disc_max/status/effective_date/msrp_snapshot/cost_snapshot，scope_id=品項/車型 id，稽核 log 塞 config.audit_log[]）。符合天條、零新 DDL |
> | **Q2** 5 店 vs spec 桃園 | **A** 5 店 persona-consistent（台北/台中/高雄/台南/嘉義，無桃園），spec 硬值依 persona 重編 |
> | **Q3** 品類 donut 分類 | **A** seed 4 類業務分類（原廠保養件/維修零件/精品配件/輪胎），DB 8 類功能分類留作未來映射底料 |
> | **Q4** 單店深鑽明細 | **A** 全 seed（SKU metadata 匿名陣列 + 精品明細 kpi_snapshots，五店各一套 persona） |
> | **Q5**「零件營收」用詞 | **A** 維持「零件營收」（snapshot 抽象值、demo 不受 raw=ro_picking 影響） |
> | **Q6** 整車成本缺 | **A** seed 整車成本到 `vehicle_models.standard_cost`（msrp×~0.7，毛利率 ~30%），補主檔 typed column |
> | **Q7** 水平 bar 元件 | **B** 抽 `<D3HBar>`（支援零線/警戒線/正負色，GRP14 偏差圖 + GRP12 多處共用） |
>
> **→ planning gate 清空，進 Batch A 地基。**

**Q1 · GRP14 定價政策資料落點（架構大題）**
- 題目：折扣授權上下限 + 審核狀態 + 稽核 log 存哪？
- 選項：
  - **A) `business_rules`（rule_kind='pricing_policy'）**：config 裝 {disc_min, disc_max, status, effective_date, msrp_snapshot, cost_snapshot}，scope_type='item'/'vehicle_model'、scope_id=品項/車型 id；稽核 log 塞 config.audit_log[]（POC 可接受）。符合天條「規則類走 business_rules」、零新 DDL、現成 RLS。
  - B) 新建 `pricing_policies` + `pricing_audit_log` 兩張 typed 表：乾淨但違反天條、要寫 2 表 + RLS migration。
  - C) 折扣授權塞 `items.metadata`/`vehicle_models.metadata`：跨兩表查詢分裂、審核狀態機塞 metadata 醜。
- **建議：A**
- 理由：天條明示規則類走 business_rules，且該表的 config/scope/effective/is_active 欄位本就是為這種規則設計；POC 階段稽核 log 塞 jsonb 陣列完全夠用，未來量大再 promote。B 違天條又多工，C 查詢分裂。

**Q2 · GRP12 / GRP14 用 4 demo 店（spec 桃園）還是 5 店（DB 台南/嘉義）**
- 選項：A) **5 店 persona-consistent**（台北⭐/台中🚨/高雄/台南📉/嘉義🌱，與 round16-19 同店）｜ B) 照 spec 4 店（含桃園）
- **建議：A**
- 理由：跟前四輪散佈圖/健康分/客戶動態對齊同一批店；spec 硬寫值（高雄 168天、桃園等）依 5 店 persona 重編。代價是重編 demo 值（已納入估時）。

**Q3 · GRP12 零件品項結構 donut 分類**
- 題目：`items.category` 實值是 8 類功能分類，spec 是 4 類業務分類（原廠保養件/維修零件/精品配件/輪胎），對不上。
- 選項：A) **seed 4 類業務分類聚合值**（DB 8 類功能分類留作未來映射底料）｜ B) 即時 join items.category 出 8 類 donut（偏離 spec）｜ C) 做一次 8類→4類 mapping 再即時撈
- **建議：A**
- 理由：spec 的 4 類是業務語意（保養/維修/精品/輪胎），8 類功能分類即時撈出來跟 spec 對不上、demo 賣相差；mapping（C）多工且 demo 不一定更準。seed 聚合值最快最準。

**Q4 · GRP12 單店深鑽 SKU 明細 / 精品加裝明細**
- 題目：raw 資料全落台北一店、`repair_order_addons` indian=0 → 非台北店無 SKU/精品明細。
- 選項：A) **全 seed**（SKU 明細用 metadata 匿名陣列、精品明細 seed kpi_snapshots，五店各一套 persona）｜ B) 只台北店有深鑽明細、其他店深鑽顯示「資料準備中」｜ C) 不做單店深鑽、GRP12 只做集團視圖
- **建議：A**
- 理由：spec 核心賣點就是「點門店名 ↗ 深鑽」，B 會讓 4/5 店點進去是空的、demo 難看；C 砍掉一半功能。A seed 五店各一套，與前四輪一致。

**Q5 · GRP12「零件營收」語意確認**
- 題目：DB 零件出庫全是 `ro_picking`（維修工單領料計價），無對外零售零件訂單。「零件營收」本質是維修零件計價。
- 選項：A) **維持「零件營收」用詞**（snapshot 抽象值、demo 不影響，符合多數經銷商「零件營收=維修領料+櫃檯零售」的合併認知）｜ B) 改用詞為「維修零件產值」更精準
- **建議：A**
- 理由：snapshot 是抽象 demo 值不綁 raw；經銷商集團層看「零件營收」是慣用語，A 對齊 spec 標題、不增認知負擔。未來接真資料時 helper 內部把零售+維修合併即可。

**Q6 · GRP14 整車成本缺（vehicle_models.standard_cost 全 0）**
- 題目：整車定價表要顯示「成本 + 標準毛利率」，但 15 台車 cost=0、毛利率算不出。
- 選項：A) **seed 整車成本到 vehicle_models.standard_cost**（依 spec 比例，msrp × ~0.7，毛利率 ~30%）｜ B) 整車表不顯示成本/毛利欄、只顯示售價 + 折扣授權｜ C) 成本存 business_rules config 不動 vehicle_models 主檔
- **建議：A**
- 理由：spec 整車表明確有「成本 + 標準毛利率」兩欄，B 砍欄賣相差；C 讓成本跟主檔分離、未來會計算成本要回主檔。A 一次補 15 台 standard_cost（demo 值，msrp×0.7），整車毛利率立刻能算、也讓 vehicle_models 主檔更完整。⚠️ 屬「補主檔 typed column」非破壞性，但仍列為拍板點（改主檔資料）。

**Q7 · GRP12/14 水平 bar 要不要抽成 `<D3HBar>` 元件**
- 題目：周轉率 bar、供應商集中度 bar、車型別加裝率 bar、GRP14 偏差率 bar（含零線+警戒線）都是水平 bar。
- 選項：A) inline D3（跟 d3-line-trend 同風格寫頁面旁）｜ B) **抽 `<D3HBar>`**（支援零線/警戒線/正負色，GRP14 偏差圖 + GRP12 多處共用、下游 GRP13 也會用）
- **建議：B**
- 理由：水平 bar 本輪出現 4 次以上、且 GRP14 偏差圖的零線+警戒線是可重用邏輯；抽一次省後面重刻，成本 ~80 行。極速交付才選 A。

---

## 六、結案條件

- ✅ GRP12 seed（§3.1 ~129 列）全塞 `kpi_snapshots`、`brand_id='indian'`、`metadata._seed='round20-business-mgmt'`；**必 seed 項（呆滯金額/6月走勢/品類 donut/精品明細/SKU 陣列）無一硬塞 helper 常數，helper 純讀**。
- ✅ `getGroupPartsFinancials` + `getStorePartsDrilldown` domain function（append `group-analytics.ts`、常數抽 `group-analytics-labels.ts`、JSDoc 列讀哪些 metric_key 當資料合約）。
- ✅ GRP14 真 CRUD：定價政策資料層（依 Q1）+ `pricing-policy-actions.ts`（Result 型別、5 個狀態機 action）+ `/group/pricing` 頁（list + side panel + 狀態機 + 偏差圖 + 稽核 log）+ **RLS policy**（若走 business_rules 則沿用既有）。
- ✅ 新 D3 元件（視 Q7 決定的 `<D3HBar>`）house-style、既有 D3 不破。
- ✅ GRP12 `/group/parts-financials`：集團視圖（5 KPI + 門店營收/毛利 grouped-bar + 品類 donut + 庫存健康表 + 周轉 bar + 供應商集中度 + 精品加裝表 + 6月走勢）+ 單店視圖（KPI + 採購vs出庫 + SKU 明細 + 呆滯清單 + 精品明細）render-smoke PASS。
- ✅ GRP14 互動：side panel 新增/編輯定價真寫入 DB、折扣上下限驗證、毛利率自動算、狀態機切換（送審/核准/退回）真改狀態、稽核 log 真 append、偏差圖越界紅標。
- ✅ **GRP14 真寫入 e2e**：Playwright 建一筆定價政策 → 查 DB 確認落地、改折扣下限 → 查稽核 log（CLAUDE.md memory「寫入流程必 e2e」）。
- ✅ `npx tsc --noEmit` 0 + `npm run build` 0（本地三次 build）+ 天條 audit `grep -rn '@/lib/supabase' "src/app/(workspace)/group" src/components/charts` = 0 hit + nav 雙 brand「商務管理」群組 + 2 入口。
- ✅ 截圖 `docs/test-evidence/round-20/` + Notion BDN round-20 卡 STATUS=完成 + 下一輪 HANDOFF（指名 GRP13 促銷活動管理）。

---

## 七、下一輪 HANDOFF 預告

> 本輪把商務管理層的「看（GRP12）+ 訂規則（GRP14）」做完，留 GRP13 促銷活動管理給下一輪。

**下一輪：GRP13 促銷活動管理**（`/group/promotions`）——真 CRUD + 審核狀態機（draft→review→approved→ended→archived）+ 折扣授權範圍 + 門店執行監看 + **LINE 海報預覽/產出**（spec 標 Partner 用 html2canvas 實作）+ 活動效益分析。

接手者啟動步驟：
1. **開工前先做「資料真相校驗」**（本專案鐵律）：`promo_campaigns` 表完全不存在（實測確認，`push_campaigns` 是 CRM 推播 ≠ 銷售促銷活動）→ GRP13 必新建 `promo_campaigns` 表（活動主檔 + 狀態機 + 折扣範圍 + 適用門店）。先驗 DB、再寫提案。
2. 若 round-20 Q1 拍板走 business_rules，GRP13 可考慮同模式（rule_kind='promo_campaign'）或新表，視活動的 line item / 海報附件複雜度決定。
3. 海報產出（html2canvas + LINE 推送）spec 標 Partner 實作 → 確認本輪做到哪（預覽 vs 真產 PNG vs 真推 LINE，可接 Notification Hub LINE 通路）。
4. D3 元件庫到本輪已有 scatter/line/multiline/radar/gauge/funnel/donut/grouped-bar(/hbar)，GRP13 大概率 0 新元件（活動效益是 KPI 卡 + 表格為主）。

**本輪最大教訓（寫給下一輪）**：
> **GRP12 印證了反向經驗——「以為要 seed、其實早 seed 好了」**：round16/17 早把零件五店 metric seed 進 kpi_snapshots，開工前實測才發現主體免重做。**校驗不只防「以為有其實沒有」，也防「以為沒有重複 seed」**——兩個方向都要 query DB 確認。GRP14 則是另一型：**「真 CRUD 頁的底料真有（售價/成本）、但治理層（折扣授權/審核/稽核）全要新建」**，分清「底料 vs 治理層」才不會低估工程量。
