# 第十九輪 — 集團管理 · 客戶經營層：GRP18 集團客戶動態（CRM 兼市場）

**日期**：2026-05-30
**Spec 來源**：`docs/20260529/DealerOS_最終版本/05_集團管理/04_策略評估/GRP18_集團客戶動態_v1.html`
**前一輪**：第十八輪 策略評估層 GRP16/17（已結案上線 commit `3486bc6`）
**狀態**：⏳ 規劃中，**等 Ming 拍板後才動工**

> ⚠️ **本提案為 v2 修訂版**：v1 把「集團漏斗 / 流失率可上捲 round17 既有真 seed」當去風險賣點，經實測 DB 推翻（見 §三「資料真相校驗」）。v2 已把這些「假設 DB 有、實際沒有」的宣稱全部改為**明確 seed 或標待驗證**，重估 estRows，並把因此衍生的拍板題補進 §四。**這是與 round-18 Health Score「HTML 沒寫、demo 值硬塞」同型陷阱的預防修正——v2 之後不再有任何「以為能上捲、落地才發現要硬塞」的地雷。**

---

## 一、為什麼做

集團管理的金字塔，前三輪把「**人 → 店 → 戰略**」三面看完了：

- GRP07/08（個人能效）= 看「**人**」
- GRP09/10/11（門店診斷）= 看「**店**」的細節
- GRP16/17（策略評估）= 把每間店壓成「**一個健康分 / 一張四象限圖**」，看「**戰略**」
- **GRP18（客戶動態）= 補上第四面向：看「客戶」——集團經營的真正資產**

> **前三輪都在看「我們內部表現如何」，GRP18 第一次把鏡頭轉向外面：客戶是怎麼來的、怎麼流失的、誰快走了。內部指標再漂亮，客戶在漏，這台機器就是在漏水。**

GRP18 同時身兼**集團 CRM**（客戶旅程 / 回購 / 流失預警）與**市場層**（新客來源 donut / NPS 走勢）兩個角色，是建議書「賣給代理商層」的客戶經營賣點落地——**從內部診斷升級到客戶資產管理**。

更關鍵的是**跨頁約定**：目錄對照表（`DealerOS_HTML頁面目錄對照表_v1.md`）明確標註 CRM04A 休眠戰敗管理（SA/門店層）「與集團層 GRP18 客戶動態的『高風險流失客戶』呼應，後端客戶活躍度計算邏輯應共用」。換句話說，SA 層的休眠戰敗名單與 GRP18 集團層的高風險流失名單，**理論上**是同一份「客戶活躍度計算」pipeline 的不同聚合視角。

> ⚠️ **但這條共用承諾本輪做不到「真上捲」**：實讀 `crm-aftersales-dormant.ts`，它只 select `assigned_sa_user_id`，**全程沒有任何 store/org_id join，customers 表也無直接 store FK**（52 筆裡 subsidiary_id 僅 18、assigned_sa 僅 3）。所以「按 store 上捲集團」在現有 helper + schema 下**結構上做不出來**——不是量太少 fallback 的問題，是沒有 store 維度可分組。本輪的「共用」退化為**口徑對齊**（閾值定義 90 天=高風險 / 180 天=最高風險寫進共用常數檔），而非資料上捲。詳見拍板 Q4 / Q8。

### 重用 round-16/17/18 地基（去風險，這部分校驗後仍成立）

- **page wiring**：admin gate（`getCurrentUserAndAdmin` → 未登入 `redirect("/login")`、非 admin 紅字 main）+ `getActiveScope().brand_id` + `Promise.all([domain functions])` 100% 可複製 health-score/store-quadrant 範本。✅ 仍成立
- **5 間 demo 門店**（台北⭐/台中🚨/高雄/台南📉/嘉義🌱）+ `kpi_snapshots`（org_id 門店層 + `metadata._seed` 標記容器）已就位；round-17 既有 5 個 store uuid（`c557f308…` + `17000000-…-0001~0004`）可繼續沿用同店。✅ 仍成立
- **D3 元件庫**：`<D3ScatterChart>`（含 size/trail/dark/quadrant 升級）/ `<D3LineTrend>` / `<D3MultiLineTrend>` / `<D3RadarChart>` / `<D3Gauge>` 全部可續用；本輪只缺 **漏斗** 與 **donut** 兩個 D3 元件。✅ 仍成立
- ~~**既有真實 metric 可上捲**：集團漏斗 / 流動曲線 / 流失率只需 helper 加總既有 round17 metric，不重 seed~~ ❌ **v1 此宣稱已被推翻、刪除**——見 §三「資料真相校驗」。集團漏斗、per-store 流失數、NPS 月度序列、5 張集團 KPI **全部要新 seed**。

---

## 二、Scope（建議一輪做完，分三 Batch 串行）

> GRP18 是**單頁雙視圖**（集團總覽 + 單店深鑽 drill-down），不像 round-18 是兩頁。但這一頁資訊密度高（漏斗 + donut + 流動 bar + 流失原因 + NPS 線 + 集團彙總表 + 單店 KPI/漏斗/名單/高風險清單），且需要新做兩個 D3 元件（漏斗 + donut）+ 一支主 helper + drill-down helper。地基（seed + helper + 元件）先穩、頁面是組裝，一輪交付最省。**下游 GRP12-14 商務管理層、GRP19+ 本輪排除、記未來。**

### 🔴 Batch A — 地基（主 agent + 0~1 sub）

| Task | 內容 |
|------|------|
| **T0a** | demo seed（路線 b，**不需新 DDL**）：全塞 `kpi_snapshots`、`brand_id='indian'`、`metadata={"_seed":"round19-customer-dynamics"}`、`period_month='2026-05-01'`（NPS 月度序列用 `2025-12-01`~`2026-05-01` 六個月）。完整 metric_key 清單見 §三「T0a seed 逐項清單（精確列數）」——**這版把 v1 含糊塞進『趨勢/補充 ~10-15』的項目全部拆明**：集團 5 KPI、集團漏斗 5 階段、per-store 漏斗 25、來源 donut 36、客戶狀態分佈 30、門店流動 bar 15、流失原因 5、NPS 月度序列 36、集團彙總表逐欄 20、`churn_risk_high_count` 6、`churn_risk_list` metadata 陣列 ~2。**估 ~185 row**（v1 的 90-130 是系統性低估）。 |
| **T0b** | 新 domain function（append 到 `src/domain/group-analytics.ts` 尾部、不改既有 export）：`getGroupCustomerDynamics(brandId, opts?)`（集團 5 KPI + 集團漏斗 + 來源 donut + 門店客戶流動對比 + 流失原因 + 集團 NPS 月度走勢 + 集團彙總高風險表）、`getStoreCustomerJourney(brandId, storeId, opts?)`（單店 KPI + 單店漏斗 + mini-stats + 單店 NPS 月度走勢 + 匿名客戶名單 + 單店高風險清單）。常數 / label（漏斗階段標籤、donut 分類色票、來源中文名、活躍/休眠閾值共用常數）一律放 `src/domain/group-analytics-labels.ts`，**絕不放帶 `"use server"` 的 group-analytics.ts**（踩過 round-18 use-server 物件 export 陷阱）。 |
| **T0c** | 2 個新 D3 元件（house-style hybrid，沿用 d3-scatter/d3-line-trend 風格）：`<D3FunnelChart>`（`src/components/charts/d3-funnel.tsx`，props `stages:Array<{stage,count,rate?}>`/`colorTheme?`/`orientation?`/`showRate?`/`valueFormat?`/`height?`/`emptyMessage?`，沿用既有 `FunnelStage` 型別）、`<D3DonutChart>`（`src/components/charts/d3-donut.tsx`，props `data:Array<{name,value,color?}>`/`centerLabel?`/`centerCaption?`/`innerRadiusRatio?`/`size?`/`showLegend?`/`valueFormat?`/`emptyMessage?`，hover 扇形外擴）。**門店流動 grouped bar** 與 **流失原因水平 bar** 暫不抽元件、用既有 d3-line-trend 同風格的 inline D3 渲染或現成 grouped-bar helper（若無則順手抽 `<D3GroupedBar>`，見拍板 Q7）。 |

> ⚠️ T0c 漏斗的取捨見拍板 Q6：漏斗也可直接複用 round-17 store-sales-board 的手刻 CSS `FunnelRow`（零新元件）。我傾向新做 D3 版維持 group 模組全 D3 一致性（donut 一定要新做、漏斗順手做、~120 行/個）。

### 🔴 Batch B — 頁面（1 sub 走 spec-to-feature）

| Task | 頁面 | 內容 |
|------|------|------|
| **T1 GRP18** | `/group/customer-dynamics` | **集團視圖**：深藍漸層 header（period/store select + 匯出佔位）+ 客戶警示 alert banner（3 條）+ **5 KPI 小卡**（活躍 2,847 / 新客 342 / 回購率 34.8% / 流失率 8.4%⚠ / NPS +42，**值來自 seed metric_key，不在 helper 硬塞常數**）+ 客戶旅程漏斗（5 階段，**全 seed**）+ 新客來源 donut（中心 342）+ 門店客戶流動對比 grouped bar（per-store new/repeat/churn 三系列，**全 seed**）+ 流失原因水平 bar（5 桶，**全 seed**）+ 集團 NPS 月度折線（6 點 [36,38,39,40,41,42]，**全 seed**）+ 高風險流失客戶集團彙總表（門店名可點↗ 下鑽，逐欄 90天/180天/平均天數/佔比/建議行動，**全 seed**）。**單店視圖**（drill-down）：mode-bar + 5 單店 KPI + 門店警示 + 單店漏斗 + mini-stats + 單店 NPS 小折線（6 點 `npsHistory`，**全 seed**）+ 匿名客戶名單表（篩選 select）+ 單店高風險清單表。`switchStore(key)` 一支 function 驅動三觸發點（header select / 彙總表門店名 / 返回總覽）。 |

### 🟢 Batch C — nav + 驗證（主 agent）

- `nav_nodes` 雙 brand 各 INSERT 一筆：掛「策略評估」level2 群組（parent `18000000-…-0001`/`-0002`）、`sort_order=2`（接在門店評估四象限後面）、`page_kind='react_route'`、`is_active=true`、`coming_soon=false`。⚠️ 別插錯到「門店診斷」群組（parent `16000000-…`）。
- Deploy-then-Test render-smoke：push → Zeabur 自動部署 → 打部署後 URL 跑 Playwright（不起 local next dev 避免 VPS+Chromium OOM）+ 截圖存 `docs/test-evidence/round-19/`。

**預估**：1 頁（雙視圖）+ 地基（seed ~185 row + 2 helper + 2~3 元件）約 3-5 天。本輪**排除、記未來**：GRP12-14 商務管理層、GRP19+ 其餘集團子模組。

---

## 三、資料策略（路線 b）

**不需新 DDL**（`kpi_snapshots` 的 `org_id`/`period_month`/`metadata` jsonb 容器都在；`org_benchmarks` **沒有 metadata 欄也沒有 org_id**，無法掛 `_seed` 也無法存 per-store 客戶動態 → **本輪不碰 org_benchmarks**）。沿用 round-16/17/18 完全一致的路線 b：全部塞 `kpi_snapshots`、`brand_id='indian'`（MANDATORY，避免 Ming Indian scope 看空）、`metadata={"_seed":"round19-customer-dynamics"}` 單鍵標記。維度落點：集團彙總用 `org_id=null`、門店維度用既有 round17 的 5 個 store uuid 保持同店。

### 🔬 資料真相校驗（v2 新增——已實際 query DB / 讀 helper，逐條校正 v1 假設）

> **這一節是 v2 的核心修正。v1 的「可上捲」表全部撤掉，改為「校驗結論」。每條都是實測，不是推測。**

| v1 宣稱 | 實測結果（DB query / 讀碼） | v2 結論 |
|---------|--------------------------|---------|
| 集團漏斗可上捲 round17 `funnel_*` 加總 | round17 五店加總 = lead **1310** / test_ride **679** / quote **347** / order **180** / delivered **171**；spec GROUP_FUNNEL = 潛在 **4820** / 首接 **2460** / 試乘 **1120** / 首購 **342** / 回購 **1180**。**數量級差 3-7×、階段語意不同**（round17 是 lead→…→delivered 單調銷售漏斗；spec 是 潛在→首接→試乘→首購→回購 的客戶**生命週期**漏斗，末階段「回購 1180」> 首購 342 在單調漏斗中不可能、是另一個 cohort）。 | ❌ **無法上捲，整條 5 階段全 seed**。末兩階段（首購/回購）round17 根本無來源。見拍板 Q1。 |
| 流失率可上捲 round17 `churn_count`/`cust_total` | 實測：兩 key 全部 `org_id=null`、metadata 無 staff_role 但明顯是 per-person 散值（churn_count 14 筆 = 3,4,5,6,7,8…）。**是 staff_role-keyed（按 sa/salesperson）而非 store-keyed**。`getCrossDeptScatter` 算的是跨部門 churn_rate，不是 per-store。 | ❌ **per-store 流失數無法從這份 seed 推出**。集團彙總表 / 門店流動 bar 需要的 per-store new/repeat/churn **全 seed**。 |
| 6 個月 NPS 月度序列 | 實測 DB 只有單點：集團 `nps`（period 2026-05-01，round16）+ `store_nps`（2026-06-01，round18）。**0 個月度序列**。 | ❌ **集團 6 點 + 每店 6 點 × 5 店 = 36 列全 seed**。見拍板 Q2。 |
| 5 張集團 KPI 卡 | 實測 `kpi_snapshots` **無** `cust_active_total`/`new_cust`/`repurchase_rate`/`churn_rate`/`group_nps` 任一 key。spec HTML 是硬寫值（2,847 / 342 / 34.8% / 8.4% / +42）。 | ❌ **5 個集團 KPI 全 seed**，helper 用 read-only `metric_value`，**禁止在 helper 硬塞常數**（重演 Health Score 陷阱）。 |
| 高風險名單接 `crm-aftersales-dormant.ts` 真資料、按 store 上捲 | 實讀 helper：只 select `assigned_sa_user_id`，**無 store/org_id join、無 groupby store**。customers 表 52 筆裡 subsidiary_id 僅 18、assigned_sa 僅 3、無直接 store FK。 | ❌ **「按 store 下鑽真資料」結構上做不到**。集團彙總表逐欄全 seed；單店清單見拍板 Q4（建議全 seed metadata 陣列，跨頁「共用」退化為閾值口徑對齊）。 |
| 門店流動 grouped bar 可用既有 metric | spec：newC[108,84,72,62] / repeat[322,256,174,174] / churn[46,44,72,39]（4 店 × 3 系列 = 12）。DB 既有 churn 是 staff_role-keyed、**完全沒有 per-store repeat-customer metric**。 | ❌ **per-store new/repeat/churn 全 seed**（對齊既有 5 店 = 5×3=15 列）。見拍板 Q5。 |
| 流失原因水平 bar | spec：服務體驗 32% / 競品 24% / 價格 20% / 搬遷 14% / 其他 10%（5 桶）。DB `aftersales_lost_reason` 雖有但量小（11 lost），撐不起 5 桶分佈。 | ❌ **5 桶全 seed**。 |

### T0a seed 逐項清單（精確列數，v2 拆明、不再含糊）

> 全部 `kpi_snapshots` / `brand_id='indian'` / `metadata._seed='round19-customer-dynamics'`。維度：集團 = `org_id=null`；門店 = round17 既有 5 store uuid。

| # | 用途 | metric_key | 維度 × 期數 | 列數 |
|---|------|-----------|-----------|------|
| 1 | 集團 KPI 卡 | `cust_active_total` / `new_cust_total` / `repurchase_rate` / `churn_rate_group` / `group_nps` | 集團 × 1 期 × 5 key | **5** |
| 2 | 集團客戶旅程漏斗 | `lc_funnel_{prospect,contact,testride,firstbuy,repurchase}` | 集團 × 1 期 × 5 階段 | **5** |
| 3 | per-store 單店漏斗（drill-down 用） | `lc_funnel_{…}`（同 key、org_id=store） | 5 店 × 5 階段 | **25** |
| 4 | 新客來源 donut（集團 + 單店 mini） | `source_{referral,event,online,walkin,other}` | (集團+5 店) × 5 桶 | **30** |
| 5 | 客戶狀態分佈 | `cust_state_{active,dormant60,dormant120,dormant180,lost}` | 集團 × 5 狀態（單店深鑽另算入 #9 彙總表） | **5** |
| 6 | 門店流動對比 grouped bar | `flow_new` / `flow_repeat` / `flow_churn` | 5 店 × 3 系列 | **15** |
| 7 | 流失原因水平 bar | `lost_reason_{service,competitor,price,relocate,other}` | 集團 × 5 桶 | **5** |
| 8 | NPS 月度序列 | `nps_monthly`（metadata.month 標 1~6 月） | (集團+5 店) × 6 月 | **36** |
| 9 | 集團彙總高風險表逐欄 | `risk_over90` / `risk_over180` / `risk_avg_days` / `risk_pct_active` | 5 店 × 4 欄 | **20** |
| 10 | 高風險計數（KPI 對映） | `churn_risk_high_count` | (集團+5 店) | **6** |
| 11 | 逐客戶高風險名單 | `churn_risk_list`（metadata jsonb 陣列裝 ~8-12 匿名客戶物件，集團 1 + 重點店 1） | 1~2 列 | **~2** |
| 12 | 趨勢/補充緩衝 | （回購率逐月、來源×漏斗交叉等，視頁面需要補） | — | **~5** |

**合計 ≈ 159 + 緩衝 ≈ 185 列**（v1 的 90-130 是漏算 NPS 序列 36 + 流動 bar 15 + per-store 漏斗 25 + 集團彙總逐欄 20 + 流失原因 5 + 集團 KPI 5 的系統性低估）。對齊前三輪量級（round16=86 / round17=383 / round18=110），185 落在合理區間。

### 明確區分「真」vs「seed」（v2 校驗後重寫）

**✅ 真實可用（DB 確有、且能在現有 helper/schema 下取用）**：

- 來源原始值底料：`customers.source_module`（52 筆）+ `sales_leads.source`（43 筆）真有，但值髒、中英混雜 16+ 種、未正規化、量小 → **留作未來正規化 pipeline 底料，本輪 donut 不即時撈、用 seed 聚合值**（見拍板 Q3）。
- 門店滿意度單點訊號：`store_nps`（round18，5 店各一點 2026-06-01）真實，但**只有單點、無月度序列** → 月度走勢線必 seed（單點可作為 6 月序列的末點錨定，讓 seed 曲線收斂到真值附近）。
- SA 層逐客戶休眠/流失底料：`crm-aftersales-dormant.ts` 在 **SA/門店頁（CRM04A）** 仍是真資料；GRP18 集團層**無法上捲**（無 store 維度），改為**閾值口徑共用**（90/180 天定義寫進 `group-analytics-labels.ts` 的共用常數，兩頁 import 同一份，保證口徑一致）。

**🟡 必須本輪新 seed（全部，無一可上捲——這是 v2 最大修正）**：

集團 5 KPI、集團漏斗 5 階段、per-store 漏斗 25、來源 donut 36、客戶狀態分佈 30、門店流動 bar 15、流失原因 5、NPS 月度序列 36、集團彙總表逐欄 20、高風險計數 6、逐客戶名單陣列 2。**逐項列數見上表，全部 seed、helper 純讀。**

**每店故事曲線**（對齊既有 persona，與 round-18 一致；數值依 5 店 persona 重編，**不照抄 spec 的 4 店數字**，見拍板 Q5 後果）：

| 店 | persona | GRP18 客戶動態延續 |
|---|---|---|
| 台北⭐ | 全集團標竿 | 漏斗轉化最健康、流失率最低、回購/推薦最高；來源 donut 以口碑推薦+回頭客為主；NPS 6 月走勢向上收斂到高點 |
| 台中🚨 | 危機店（返修率 45%） | 流失預警最嚴重、高風險名單榜首、churn_rate 最高、售後/回購大量流失；新客枯竭；NPS 6 月走勢下滑 |
| 高雄 | 持平穩健 | 旅程轉化中等、流失正常區間、回購穩定；對照組、來源結構均衡 |
| 台南📉 | 走平衰退 | 上游新客萎縮、客戶總數停滯、流失略高於新增；來源管道老化需行銷介入 |
| 嘉義🌱 | 低基新店 | 客戶基數小但新客成長率高、旅程處擴張早期、流失絕對數低；來源以新開發+在地導流為主 |

> ⚠️ **spec 的 4 店（tp/tc/kh/ty = 台北/台中/高雄/桃園中壢）≠ 我們 5 demo 店（台北/台中/高雄/台南/嘉義）**。所有 spec 硬寫 demo 值（高雄 168 天/6.8%、桃園 118 天/3.2% 等）**都要依 5 店 persona 重編一套**，不能照抄——工作量比「改個店名」大，已納入 §二 T0a 估時。詳見拍板 Q5。

---

## 四、開工前要 Ming 拍板的題

> 共 8 題。每題附**預設提案 + 理由**，OK 就鎖、要改標 delta。Q1/Q2/Q4 是 v2 因資料真相校驗**新升級的拍板題**（v1 誤當「已知可上捲」沒問）。

> ### ✅ 拍板結果（2026-05-30，Ming 全數採建議方案、無 delta）
>
> | 題 | 決議 |
> |---|---|
> | **Q1** 漏斗階段語意 | **A** 客戶生命週期 5 階段（潛在→首接→試乘→首購→回購，回購為獨立 cohort）整條全新 seed |
> | **Q2** NPS 6 月走勢 | **A** seed 6 點假序列，末點錨定既有 `store_nps` 真值 |
> | **Q3** 來源 donut 分類 | **A** seed 正規化聚合值（5 桶），DB 原始髒值留作未來 pipeline 底料 |
> | **Q4** 高風險流失名單 | **A** 全 seed + 跨頁「共用」降級為 90/180 天閾值口徑對齊（定義寫 `group-analytics-labels.ts` 共用常數兩頁 import） |
> | **Q5** 集團彙總/流動 demo 值 | **A** 重編 5 店 persona（台南/嘉義取代 spec 桃園，數值依故事曲線重編，不照抄 spec 4 店硬值） |
> | **Q6** 漏斗元件 | **A** 新做 `<D3FunnelChart>`（含階段轉換率 badge，維持 group 全 D3 house-style） |
> | **Q7** bar 元件 | **B** 抽成可重用 `<D3GroupedBar>`（流失原因用 horizontal 變體，下游 GRP12-14 可再用） |
> | **Q8** 活躍客戶定義 | **A** 統一以天數為準（活躍<60 天 / 高風險≥90 / 最高≥180），定義寫共用常數兩頁 import |
>
> **→ planning gate 清空，可進 Batch A 地基。**

**Q1 · 集團客戶旅程漏斗「階段定義」（v2 升級為拍板題，v1 誤判可上捲）**
- 題目：漏斗用哪套階段語意？spec 是**客戶生命週期 5 階段**（潛在 4820→首接 2460→試乘 1120→首購 342→回購 1180，末階段回購是獨立 cohort、> 首購）；round17 是**銷售漏斗**（lead→test_ride→quote→order→delivered，單調遞減）。實測兩者數量級差 3-7×、語意不相容、**無法上捲**。
- 選項：A) 照 spec 客戶生命週期 5 階段、整條全新 seed ｜ B) 改用 round17 銷售漏斗語意上捲（放棄「回購」cohort 視角）｜ C) 對齊 NetSuite lead-to-cash 階段命名再 seed
- **建議：A**
- 理由：GRP18 的賣點正是「客戶生命週期 + 回購 cohort」，B 會閹掉回購視角、退回成已做過的銷售漏斗；NetSuite lead-to-cash 是交易階段、非客戶生命週期，語意也不合。全 seed 才能呈現「回購 > 首購」的 cohort 故事。

**Q2 · 6 個月 NPS 月度序列（v2 升級為拍板題，v1 漏列）**
- 題目：集團 + 每店的 6 月 NPS 走勢線（DB 完全無月度資料），本輪要不要 seed、用什麼曲線？
- 選項：A) seed 6 點假序列（集團 [36,38,39,40,41,42]、每店依 persona 編曲線、末點錨定既有 `store_nps` 真值）｜ B) 退化成單點、不畫趨勢線（只顯示當前 NPS 數字）
- **建議：A**
- 理由：NPS 走勢是 GRP18 「市場層」的核心視覺，退成單點等於砍掉一張圖、賣相大降；seed 6 點且末點收斂到 round18 真 `store_nps`，故事連貫又不憑空。36 列已納入 estRows。

**Q3 · 來源 donut 分類用哪套**
- 題目：照 spec **5 桶**（客戶介紹 34% / 展場·活動 26% / 網路·社群 20% / 路過到店 12% / 其他 8%，中心 342），seed 正規化聚合值；還是即時 group by DB 髒值？
- 選項：A) seed 聚合值（DB 原始值留作未來正規化底料）｜ B) 先做一次來源值正規化 mapping 再即時撈
- **建議：A**
- 理由：即時撈會出現中英混雜 16+ 種醜 label、52 筆撐不起好看 donut；B 多花時間、demo 不一定更準。原始值不刪、留作未來 pipeline 底料。

**Q4 · 高風險流失名單：接真資料 vs 全 seed（v2 修正 v1 的錯誤假設）**
- 題目：v1 說「單店清單優先接 `crm-aftersales-dormant.ts` 真資料、按 store 上捲」——實讀 helper **無 store 維度、結構上做不到**。改怎麼處理？
- 選項：A) **全 seed**（集團彙總表逐欄 + 單店清單 metadata 陣列皆 seed；跨頁「共用」退化為閾值口徑對齊，90/180 天定義寫共用常數）｜ B) 改 `crm-aftersales-dormant.ts` 加 store join（需先給 customers 補 store FK、跨 round 工程，本輪做不完）｜ C) 集團彙總 seed、單店清單接 SA 層真資料但**不分店**（全集團逐客戶、不按店篩）
- **建議：A**
- 理由：B 要動 schema 補 customers store FK（52 筆裡 18 有 subsidiary、34 缺）+ 改 helper，超出單輪；C 的「不分店逐客戶」與「單店深鑽」語意矛盾。A 最務實：demo 漂亮、口徑（90/180 天）仍與 SA 層共用同一份常數，「共用」承諾以**定義對齊**而非資料上捲兌現，誠實且可交付。

**Q5 · 集團彙總表 / 流動 bar 的 demo 值：照 spec 4 店 vs 重編 5 店（v2 點透後果）**
- 題目：spec 硬寫 4 店值（台北 18/8/124天/2.4%、台中 10/4/108天/1.8%、高雄 28/16/168天/6.8%、桃園 12/5/118天/3.2%；流動 newC[108,84,72,62]/repeat[322,256,174,174]/churn[46,44,72,39]）。我們是 5 店、且 ty=桃園 ≠ 我們的台南/嘉義。
- 選項：A) **重編 5 店一套 persona-consistent 值**（台南/嘉義取代桃園，數值依故事曲線新編）｜ B) 照 spec 用 4 店（含桃園，與前三輪不對齊、多一間 demo 店）
- **建議：A**
- 理由：保持與 round-16/17/18 同 5 店、persona 連貫；B 會憑空多出桃園、跟前三輪散佈圖/健康分對不上同一批店。代價是所有硬寫值要重編（已納入估時），非「改個店名」。

**Q6 · 漏斗元件：新做 D3 vs 複用既有 CSS FunnelRow**
- 題目：漏斗用新 `<D3FunnelChart>`（含階段轉換率 badge）還是複用 round-17 store-sales-board 手刻 CSS `FunnelRow`（零新元件、無轉換率、較陽春）？
- 選項：A) 新做 `<D3FunnelChart>`（~120 行，donut 反正要新做順手做）｜ B) 複用 CSS `FunnelRow`
- **建議：A**
- 理由：group 板刻意全 D3 house-style，混 CSS FunnelRow 破慣例；轉換率 badge 是漏斗的資訊重點。要極省工才選 B。

**Q7 · 門店流動 grouped bar / 流失原因 bar 要不要抽成可重用元件**
- 題目：這兩張 bar 是 inline D3 渲染、還是抽成 `<D3GroupedBar>` / `<D3HBar>` 放元件庫？
- 選項：A) inline D3（最省，跟 d3-line-trend 同風格寫在頁面/helper 旁）｜ B) 抽成可重用元件（未來 GRP12-14 商務管理層大概率會再用 bar）
- **建議：B（抽 `<D3GroupedBar>`、流失原因用同元件 horizontal 變體）**
- 理由：下游商務管理層幾乎一定再用 bar，抽一次省後面三輪重刻；成本只多 ~60 行。若你要本輪極速交付選 A。

**Q8 ·「活躍客戶」定義與 dormancy 門檻如何對齊成同一條 pipeline（v2 新增，跨頁口徑題）**
- 題目：spec 註「活躍客戶=近 6 個月有互動」，CRM04A 的 dormancy 門檻是 60/120/180 天。兩邊活躍/休眠口徑不一致，「共用 pipeline」需先統一閾值定義。
- 選項：A) **統一以天數為準**：活躍 = 未休眠（< 60 天）；高風險 = ≥ 90 天；最高風險 = ≥ 180 天；「近 6 個月有互動」換算 ≈ 180 天內有工單 → 對齊到 dormant_180 之前皆算「廣義活躍」，KPI「活躍客戶」採此口徑 ｜ B) 維持兩套（集團頁用「6 個月」、SA 頁用「60/120/180 天」），不強求共用、各標各的口徑
- **建議：A**
- 理由：跨頁約定的價值就在「同一條客戶活躍度計算」，B 等於把共用降成口號；A 把定義寫進 `group-analytics-labels.ts` 共用常數、兩頁 import 同一份，閾值單一事實來源。即使本輪集團層是 seed 資料，定義對齊讓未來真資料接上時無痛。

---

## 五、結案條件

- ✅ demo seed（§三 T0a 逐項清單 ~185 列）全塞 `kpi_snapshots`、`brand_id='indian'`、`metadata._seed='round19-customer-dynamics'`；**集團漏斗 / per-store 流失 / NPS 月度序列 / 5 集團 KPI 全部 seed**（無一上捲、helper 純讀，零硬塞常數）
- ✅ `getGroupCustomerDynamics` + `getStoreCustomerJourney` domain function（append `group-analytics.ts`、label/閾值常數抽 `group-analytics-labels.ts`、JSDoc 列讀哪些 metric_key 當資料合約）
- ✅ 活躍/休眠閾值（90/180 天）寫進 `group-analytics-labels.ts` 共用常數、CRM04A 與 GRP18 import 同一份（口徑對齊兌現「共用 pipeline」承諾）
- ✅ 新元件 `<D3FunnelChart>` / `<D3DonutChart>`（+ 視 Q7 決定的 `<D3GroupedBar>`）house-style、其餘既有 D3 元件不破
- ✅ GRP18 `/group/customer-dynamics`：集團視圖（5 KPI+漏斗+donut+流動 bar+流失原因+NPS 線+集團彙總表）+ 單店視圖（KPI+漏斗+mini-stats+NPS 小折線+匿名名單+高風險清單）render-smoke PASS + 截圖 `docs/test-evidence/round-19/`
- ✅ 關鍵互動可運作：`switchStore` 集團⟷單店切換、彙總表門店名↗ 下鑽、返回總覽、客戶名單篩選、donut hover 外擴、未回廠天數顏色分級（≥180 紅/≥90 黃）
- ✅ `npx tsc --noEmit` 0 + `npm run build` 0 + 天條 audit `grep -rn '@/lib/supabase' src/app/(workspace)/group src/components/charts` = 0 hit + nav 雙 brand 入口
- ✅ Notion STATUS=完成 + 下一輪 HANDOFF（指名 GRP12-14 商務管理層）

---

## 六、下一輪 HANDOFF 預告（呼應 round-18 慣例）

> round-18 結案時在 memory 留了「下一輪 GRP12-14 商務管理 或 GRP18 客戶動態」的岔路；本輪選了 GRP18，把岔路收斂。GRP18 上線後，集團管理金字塔「人→店→戰略→客戶」四面齊備，集團層的**分析視圖**告一段落。

**下一輪預設方向：GRP12-14 商務管理層**（從「看數據」進到「做生意」——商機/合約/商務 pipeline 的集團彙總）。

接手者啟動步驟：
1. 讀本卡片 §四 拍板結果（Ming 已選的選項），確認 GRP18 8 題已鎖。
2. 跑 `SELECT metric_key, count(*) FROM kpi_snapshots WHERE metadata->>'_seed'='round19-customer-dynamics' GROUP BY metric_key`，確認 ~185 列 seed 已落地、無遺漏。
3. GRP12-14 開工前**先做一次與本輪同型的「資料真相校驗」**（query DB 確認商務 pipeline 既有 metric vs spec 需求），**不要再假設「可上捲」**——這是本輪最大教訓：v1 把「假設能上捲」寫進去風險賣點，實測全錯。先驗 DB、再寫提案。
4. D3 元件庫到本輪已有 scatter/line/multiline/radar/gauge/funnel/donut(/grouped-bar)；GRP12-14 大概率只缺 1-2 個新元件，可續用 house-style hybrid 樣板。
5. 共用閾值常數（90/180 天活躍度）已在 `group-analytics-labels.ts`，商務 pipeline 若有時效性指標可沿用此模式集中定義。

**本輪最大教訓（寫給下一輪、也是 round-18 Health Score 陷阱的續集）**：
> **「以為 DB 有、實際沒有」是這個專案的頭號落地地雷。** round-18 是「HTML 沒寫、helper 硬塞」；round-19 v1 是「假設可上捲、實測對不上」。預防方法只有一個：**寫提案前先 query DB / 讀 helper 把每個資料宣稱驗到底，把「可上捲 vs 必 seed」當成拍板題明確問，不要在提案裡留任何含糊的『大約』『順手加總』。** estRows 寧可高估，不要系統性低估到落地才發現要硬塞。
