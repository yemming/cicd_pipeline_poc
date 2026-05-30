# 第十七輪 — 集團管理 · 門店診斷層：GRP09 門店銷售Tab + GRP10 門店售後Tab + GRP11 跨部門能效

**日期**：2026-05-30
**Spec 來源**：`docs/20260529/DealerOS_最終版本/05_集團管理/02_個人能效/`（GRP09/10/11 v1 設計稿）+ 建議書 v3
**前一輪**：第十六輪 GRP07/08 個人能效散佈圖（已結案上線 commit `8c289fc`）
**狀態**：⏳ 規劃中，**等 Ming 拍板後才動工**

---

## 一、為什麼做

第十六輪做完「人」的個人能效散佈圖（GRP07 銷售 / GRP08 SA）。GRP09-11 是它的**上一層**——把個人能效**上捲到門店層 + 跨部門合併**：

- **GRP09 門店銷售Tab / GRP10 門店售後Tab**：選一間門店 → 看該店單月體檢報告（達成率 / 成交率 or 台次 / 毛利 / 衍生 or 吸收率 / 返修率…），全部 vs 集團均值對標 + 月趨勢 + 自動診斷文字 + 下鑽個人能效（→ GRP07/08）。
- **GRP11 跨部門能效**：橫跨銷售+售後，把「客戶流失」「個人 NPS」歸因到**具體的人**——「客戶流失不是部門問題，是個人問題」。是 GRP07/08 兩支 scatter 的跨部門 union。

戰略價值：延續建議書「診斷到人、異常自己現形」主線，從「人」延伸到「店」——這正是對代理商層的賣點：「**哪間店該加碼、哪間該介入**」。

### 重用 round-16 地基（去風險）
- `src/domain/group-analytics.ts`（per-staff 聚合）、`src/components/charts/d3-scatter.tsx`（D3 散佈圖，markerShape circle/diamond）、`kpi_snapshots` / `org_benchmarks` 表（含 `org_id`、`scope`、`period_month` 欄位，容器都在）、`organizations` 四層 — 全部就緒。
- 圖表續用 **D3**（沿用 Ming 第十六輪定調）。

---

## 二、Scope 與任務切分

> 三頁難度差異大：**GRP11 重用度最高**（最接近 round-16）、**GRP09 中等**、**GRP10 最重**（metric 最雜、全新 KPI 最多）。建議由易到難、一頁一隻 sub、序列推進。

### 🔴 Phase 0 — 資料地基 + 共用元件（主 agent 自做 + 1 sub）
| Task | 內容 |
|------|------|
| **T0a** | 補 4 個 Indian demo 門店 `organizations`（台中/高雄/台南/嘉義直營，level=2，`metadata.demo=true` 標記，不掛員工）→ 連台北共 5 店切換器標的 |
| **T0b** | per-store demo seed：5 店 × 月趨勢 metric（銷量/台次，近6月+去年同期 ~12 period）+ 單期 metric（達成率/毛利/吸收率/返修率/車間三率…），`kpi_snapshots`（staff_id=NULL, org_id=門店）。估 ~250 row |
| **T0c** | `org_benchmarks` 補集團均值（scope='national'，各 metric 單期）。估 ~30 row |
| **T0d** | 新 domain function（`src/domain/group-analytics.ts`）：`listDiagnosticStores` / `getStoreSalesDiagnostics` / `getStoreServiceDiagnostics` / `getCrossDeptScatter` / `getStoreMonthlyTrend` |
| **T0e** | 共用圖元件 `<D3LineTrend>`（本年 vs 去年同期雙線，GRP09/10 共用）+ `<D3ScatterChart>` 加 `showLabel?` prop（GRP11 永久姓名標籤，向後相容） |

### 🔴 Phase 1 — GRP11 跨部門能效（1 sub，重用度最高）
- 新建 `/group/cross-dept-efficiency`：X1 客戶流失歸因 scatter（X=名下客戶、Y=流失數，圓=銷售/菱=售後）+ X2 個人 NPS scatter（X=台次、Y=NPS）+ 2 排名表（`<DataGrid>`）+ 期間切換 chip + 門店切換。
- 重用 `<D3ScatterChart>`（加 showLabel）；helper = 兩支 round-16 scatter 的 union + `cust_total`/`churn_count` 兩個新 metric。

### 🟡 Phase 2 — GRP09 門店銷售Tab（1 sub，中等）
- 新建 `/group/store-sales`：門店切換 + 4 KPI 卡 + Benchmark 4 欄 + 銷售漏斗（CSS）+ 月度銷量趨勢（`<D3LineTrend>`）+ 衍生滲透率 bar + 診斷摘要。

### 🟡 Phase 3 — GRP10 門店售後Tab（1 sub，最重）
- 新建 `/group/store-service`：返修率告警橫幅 + 4 KPI 卡 + Benchmark + 車間三率 bar + 台次月趨勢 + 業務結構圓環 + 零件庫存健康 + 精品加裝 + 客戶流動表 + 診斷摘要。
- metric 最雜，多數靠 demo seed。

### 🟢 Phase 4 — demo 收尾 + nav + 驗證（主 agent）
- 門店切換 / 趨勢 / 告警 跑順；`nav_nodes` 雙 brand 把三頁掛到「個人能效」群組（接 GRP07/08 後面）；Deploy-then-Test render-smoke 三頁 + 截圖 `docs/test-evidence/round-17/`。

**預估**：4 頁（含 Phase 0）約 5-7 天（GRP10 最吃時間）。可分批：先 Phase 0+1（GRP11）交付一版、GRP09/10 再續。

---

## 三、Schema / 資料策略（最關鍵，見拍板 Q1）

**不需要新 DDL** —— `kpi_snapshots`（有 `org_id`/`period_month`）+ `org_benchmarks`（有 `scope`/`period_month`）容器都在，純缺 seed。

現況硬事實：
- Indian 只有 **1 個門店**（台北直營店）；三頁需 5 店切換才有說服力。
- `kpi_snapshots` 只 seed 2026-05 單期、**`org_id` 全 NULL**（round-16 只掛 staff，沒掛店）→ 無法 per-store、無法畫趨勢。
- `org_benchmarks` **0 筆** → 集團均值對標卡全空。

**建議路線（c）**：補 4 個標 `metadata.demo=true` 的門店 `organizations` row（不掛員工、不期待交易；其他模組要排除可用 `metadata->>'demo'` 過濾）+ per-store/多期 demo seed，沿用 round-16「能算就算、算不出 seed」策略，UI/helper 不為 demo/真實分歧。不建真實多門店交易架構（污染大、投入高）。

---

## 四、執行流程

```
主 agent（Claude）編排，序列、一次一隻 sub：
 1. T0 資料地基（4 店 + per-store/多期 seed + benchmark seed）+ 新 domain function + 共用 D3LineTrend / showLabel — 主 agent 自做（DDL/seed/helper 核心）
 2. 派 GRP11 sub（重用度最高，先交付）→ 收回 → 回寫 Notion
 3. 派 GRP09 sub → 收回 → 回寫
 4. 派 GRP10 sub（最重）→ 收回 → 回寫
 5. nav_nodes 雙 brand + Deploy-then-Test render-smoke 三頁 + 截圖
 6. tsc 0 / build 0 / 天條 audit 0 → 回報 → 等 commit/push 點頭
```

派工守紀律：spec-to-feature 純檔案可並行（但本輪序列）、Playwright 走 Deploy-then-Test（不起 local dev、避免 VPS OOM）。

---

## 五、開工前要 Ming 拍板的題

1. **資料策略（最關鍵，同 round-16 Q4 等級）**：補 4 個標 `demo` flag 的門店 `organizations` row + ~300 row per-store/多期 demo seed（建議路線 c）—— OK？還是你要別的做法（純真實多店 / 純 metadata key）？
2. **本輪 scope 切多大**：三頁全做（GRP11+GRP09+GRP10，GRP10 最重）一輪交付？還是**先做 Phase 0 + GRP11 跨部門能效**（最快、最接近 round-16）交付一版，GRP09/10 下一輪再續？
3. **GRP10 雜 metric（吸收率/車間三率/業務結構/零件庫存健康/精品加裝/客戶流動）**：一律 demo seed 撐畫面、不接真實計算（同 round-16 Q4 精神）—— OK？
4. **趨勢資料**：月趨勢只灌「銷量、台次」2 個關鍵 metric 的近6月+去年同期，其餘 metric 單期即可 —— OK？
5. **GRP02R 門店績效列印報告**（GRP09/10 的「產生報告」按鈕指向它，套列印/PDF pattern）：本輪**延後**、先做三頁螢幕版 —— OK？
6. **技術預設**：新建共用 `<D3LineTrend>`（D3 雙線趨勢）+ `<D3ScatterChart>` 加 `showLabel` prop（向後相容）—— OK？

---

## 六、結案條件（依拍板 scope 調整）

- ✅ 4 demo 門店 + per-store/多期 seed + benchmark seed（Indian 主力）
- ✅ 新 domain function 回傳三頁所需資料（per-store 診斷 + 跨部門 union + 月趨勢）
- ✅ `<D3LineTrend>` 共用元件 + `<D3ScatterChart>` showLabel
- ✅ GRP11（+ GRP09 + GRP10，依 scope）render-smoke PASS + 截圖 `docs/test-evidence/round-17/`
- ✅ 門店切換 / 月趨勢雙線 / 返修率告警 / 集團均值對標 可運作
- ✅ `npx tsc --noEmit` 0 + `npm run build` 0 + 天條 audit 0
- ✅ nav_nodes 雙 brand 三頁入口（接 GRP07/08）
- ✅ Notion 卡 STATUS=完成 + 下一輪 HANDOFF（GRP16/17 策略評估層 Dealer Health Score + 門店四象限）
```

---

## 七、Phase 1 落地紀錄 — GRP11 跨部門能效（2026-05-30）

> 命題：**「客戶流失不是部門問題，是個人問題」**，用系統 NPS 替代拿不到的原廠 CSI。
> 重用 T0 已就緒的 `getCrossDeptScatter` + round-16 `<D3ScatterChart>`，不重造輪子。

### 新增檔案
- `src/app/(workspace)/group/cross-dept-efficiency/page.tsx`（server，admin gate + scope + helper 注入）
- `src/app/(workspace)/group/cross-dept-efficiency/_components/cross-dept-efficiency-board.tsx`（client board）

### 修改檔案
- `src/components/charts/d3-scatter.tsx`：`markerShape` 型別擴成 `ScatterMarkerShape | ((d: T) => ScatterMarkerShape)`，
  render 內 `typeof markerShape === "function" ? markerShape(d) : markerShape` 逐點解析。
  **向後相容**：round-16 共 8 個 call site（sales-efficiency ×4 `"circle"`、sa-efficiency ×4 `"diamond"`）全傳字串字面量 →
  `typeof === "function"` 恆 false → 走原字串分支，行為位元級不變；預設值 `"circle"` 不動。

### 頁面結構
- Page header：H1「跨部門能效」+ chip「GRP11」+ caption 命題雙句。
- **Hero 4 卡**：納入人員數 / 高風險人員數（risk='danger' 或 churn_rate>0.15）/ 全員均值 NPS / 本月總流失客戶數。
- **期間切換 chip**：近3月均值 / 本月 / 本季（POC 純前端切 label，資料同一份）。
- **門店切換 filter**：資料 `store` 去重 + 全集團（前端 filter scatter + 兩表）。
- **兩張 D3 散佈圖（並排）**，皆 `markerShape={(d)=>d.dept==='sales'?'circle':'diamond'}`、`showLabel={(d)=>d.name}`、`tagOf={(d)=>d.tag}`：
  - **X1 客戶流失歸因**：x=`cust_total`、y=`churn_count`（右上=危險）。
  - **X2 個人 NPS 排名**：x=`volume`、y=`nps`（右下=高量低 NPS 危險）。
  - 圖例：●=銷售 ◆=售後 + tag 四色。
- **兩張排名表（手刻 `<table>`，design token）**：
  - 客戶流失歸因排名（人員/門店/部門/名下客戶/流失數/流失率 bar/NPS/趨勢/風險）；可切「依流失數 / 依流失率」排序；高流失列紅 token。
  - 個人 NPS 跨部門排名（人員/門店/部門/台次/NPS bar/趨勢/評級）。

### 表格手刻理由
流失率進度條、趨勢箭頭、整列危險紅標、排序鍵切換等高度客製化，DataGrid 標準 column/chip 模型反而綁手綁腳；
CLAUDE.md §邊界明列「表格不複雜可手刻」。

### 驗證
- `npx tsc --noEmit` 0 new error。
- `npx eslint` 動到的三檔乾淨。
- 天條 audit：`grep -rn "@/lib/supabase" "src/app/(workspace)/group/cross-dept-efficiency" src/components/charts` = 0 hit。

---

## 八、Phase 3 落地紀錄 — GRP10 門店售後診斷（2026-05-30）

> 本輪最重、metric 最雜的一頁。**重用** round-16/17 既有資產，**零新增 query / 零新元件**：
> 全靠 `getStoreServiceDiagnostics` / `getStoreMonthlyTrend` / `listDiagnosticStores`（既有 helper）
> + `<D3LineTrend>`（既有）。照剛建好的 GRP09 同款 design token；**未動** group-analytics.ts /
> d3-line-trend.tsx / d3-scatter.tsx（只讀）。

### 新增檔案
- `src/app/(workspace)/group/store-service/_components/store-service-board.tsx`（client board，~560 行）
  - page.tsx 為先前已預置（admin gate + scope + helper 注入 + `getStoreMonthlyTrend(…, "service_count")`），本次只補 board。

### 返修率告警橫幅（視覺主角）— 三色門檻
讀 `kpis.rework_rate.value`（0..1）：

| 門檻 | 顏色 token | 行為 |
|---|---|---|
| `> 0.05` | 危險紅 `bg-[#FDECEA] border-[#F5AEAD] text-[#CC0000]` | 置頂紅橫幅「返修率異常 X%，已超過 5% 警戒線 — {店}需立即介入」+ 解釋文 |
| `0.03 < r <= 0.05` | 警告 amber `bg-[#FDF3E3] border-[#F5D9A0] text-[#854F0B]` | 置頂 amber 提醒「返修率 X% 偏高（3%~5%）」 |
| `<= 0.03` 或 `null` | — | 不顯示橫幅（KPI 卡仍以綠左條呈現達標） |

台中店 rework=45% → 紅橫幅；返修率 KPI 卡左色條也同步紅（`reworkTone`）。常數 `REWORK_DANGER=0.05`、`REWORK_WARN=0.03`。

### 各區塊用到的 data 欄位（對 StoreServiceDiagnostics 型別）
| 區塊 | 欄位 |
|---|---|
| 5 KPI 卡 | `kpis.service_count{value,target,rate,trend}` / `kpis.revenue_per_vehicle{value,trend}` / `kpis.gross_margin_rate.value` / `kpis.absorption_rate.value` / `kpis.rework_rate.value` |
| Benchmark 3 欄 | `benchmark.revenue_per_vehicle` / `benchmark.gross_margin_rate` / `benchmark.absorption_rate`（KPI 卡 sub 與對標格皆用；落後紅/領先綠） |
| 車間三率 | `workshop.efficiency` / `workshop.utilization` / `workshop.productivity`（橫 bar，目標線固定 0.85，低於標紅） |
| 台次月趨勢 | `trend.months/current/prevYear`（來自 `getStoreMonthlyTrend(…,"service_count")`，售後綠 `#0F6E56` 雙線） |
| 業務結構 | `serviceMix[]{type,count}`（CSS conic-gradient donut + legend + 佔比） |
| 零件庫存健康 | `parts.fulfill_rate`（<90% 紅）/ `parts.turnover` / `parts.deadstock_pct`（>15% 紅 + bar 警戒線）/ `parts.direct_sale_amt` / `parts.direct_sale_margin` |
| 精品加裝 | `accessory.install_rate` / `accessory.margin`（2 大數字；皆 null 顯示「待 demo seed」） |
| 客戶流動 | `customerFlow[]{month,new,lost,net}`（近 5 月表；`net<0` 整列紅底 `bg-[#FDECEA]`） |
| 診斷摘要 | `diagnostics[]`（helper 已含返修率/吸收率/達成率/呆滯料/淨流動 5 條門檻語句） |

### 設計取捨
- 區塊多 → 全部用 `grid-cols-1 lg:grid-cols-2 gap-3` 排子卡（車間三率↔月趨勢、業務結構↔客戶流動、零件↔精品），避免單欄過長。
- KPI 卡 / SectionCard / BenchmarkCell / 門店切換器 邏輯與 token 與 GRP09 一致（門店切換器與趨勢主色換成售後綠 `#0F6E56`）。
- 客戶流動表手刻 `<table>`（淨流失整列紅底、新增綠/流失紅著色，非 DataGrid 標準 chip 模型）— 符合 CLAUDE.md §邊界「表格不複雜可手刻」。
- 業務結構用 CSS conic-gradient donut（無新依賴、不引第三方圖庫）。
- 全程 null/空安全：缺值「—」、空區塊顯示「待 demo seed」、全 0 業務結構 / 0 客戶流動皆有 fallback，不 crash。

### 驗證
- `npx tsc --noEmit` 0 new error。
- `npx eslint <page.tsx + board.tsx>` 0 problems（移除未用的 `DiagKpi` import 後乾淨）。
- 天條 audit：`grep -rn "@/lib/supabase" "src/app/(workspace)/group/store-service"` = 0 hit。

