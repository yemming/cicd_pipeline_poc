# 第十八輪 — 集團管理 · 策略評估層：GRP16 Dealer Health Score + GRP17 門店評估四象限

**日期**：2026-05-30
**Spec 來源**：`docs/20260529/DealerOS_最終版本/05_集團管理/04_策略評估/`（GRP16/17 v1 設計稿）
**前一輪**：第十七輪 門店診斷層 GRP09/10/11（已結案上線 commit `11dfd5b`）
**狀態**：⏳ 規劃中，**等 Ming 拍板後才動工**

---

## 一、為什麼做

GRP16/17 是集團管理三層金字塔的**最頂層收斂**：
- GRP07/08（個人能效）= 看「人」
- GRP09/10/11（門店診斷）= 看「店」的細節
- **GRP16/17（策略評估）= 把每間店壓成「一個健康分 / 一張四象限圖」**，給集團決策者一眼看出**誰是標竿、誰要派輔導員進駐、哪間值得加碼投資**。

這是建議書「賣給代理商層」的最終賣點落地——**從診斷升級到戰略決策**。

### 重用 round-16/17 地基（去風險）
- page wiring（admin gate + `getActiveScope` + `listDiagnosticStores` + URL `?store=`/`?period=` 切換）100% 可複製。
- 5 間 demo 門店（台北⭐/台中🚨/高雄/台南📉/嘉義🌱）+ `kpi_snapshots`（含 org_id 門店層 + 多 period 容器）+ `org_benchmarks` 已就位。
- D3 元件庫（`<D3ScatterChart>` / `<D3LineTrend>`）+ 圖表續用 **D3**。

---

## 二、Scope（建議一輪做完，分兩 batch 串行）

> 兩頁共享同一份資料模型（health score + 六維 + 5 季）與雷達元件，拆兩輪會重複盤 schema、seed 兩次反而更貴。地基先穩、頁面是組裝。**GRP18 集團客戶動態本輪排除、記未來。**

### 🔴 Batch A — 地基（主 agent + 1 sub）
| Task | 內容 |
|------|------|
| **T0a** | 季度 demo seed（路線 b）：5 店 × 5 季 `health_score` + 單期六維/四軸/規模 metric，`metadata.demo`。`revenue_scale`/`staff_count` 盡量真實算。估 ~120 row |
| **T0b** | 2 支新 domain function：`getDealerHealthScores(brandId, opts?)`（每店健康分+六維+四象限軸值+規模+issues+strategy）、`getStoreScoreHistory(brandId, opts?)`（近 5 季分數+軌跡軸序列） |
| **T0c** | 3 個新 D3 圖元件：`<D3RadarChart>`（六維雷達）、`<D3MultiLineTrend>`（多店多線季趨勢）、`<D3Gauge>`（半圓儀表盤）|
| **T0d** | `<D3ScatterChart>` 升級加 prop（向後相容）：`sizeOf`（圓圈大小=第三維 scaleSqrt）、`trail`（歷史軌跡虛線+箭頭）、`theme:"light"\|"dark"`、`onSelect`+選中環、`quadrantLabels`（四角標籤）|

### 🔴 Batch B — 頁面（2 sub 串行）
| Task | 頁面 | 內容 |
|------|------|------|
| **T1 GRP16** | `/group/health-score` | 集團 hero gauge + 5 KPI 小卡 + 門店健康評分卡 grid（六維 bar + 雷達）+ 近 5 季多線走勢 + 低分維度改善建議 + 排行榜表 |
| **T2 GRP17** | `/group/store-quadrant` | 暗色四象限散佈圖（可切換 X/Y 軸 + 圓圈大小第三維 + 歷史軌跡 trail toggle + 四象限標籤）+ 門店象限分類一覽 + 右側詳情面板（六維 bar + 建議策略 + Health 5 季歷史）|

### 🟢 Batch C — nav + 驗證（主 agent）
- `nav_nodes` 雙 brand：新增「策略評估」level2 群組（接「個人能效」群組後），掛 GRP16/17 兩頁。
- Deploy-then-Test render-smoke 兩頁 + 截圖 `docs/test-evidence/round-18/`。

**預估**：2 頁 + 地基約 4-6 天。

---

## 三、Health Score 計分（見拍板 Q1）

設計稿的 `score`（如台北 88.2）是直接給的 demo 值，**HTML 未明寫六維權重表**（建議書 docx 本環境讀不到純文字，無法確認是否有定義）。

**預設提案**：`score = Σ(wᵢ × dimᵢ)`，六維（銷售/售後/零件/人員/客戶滿意/財務）**等權 1/6**（台北六維等權 ≈ 87.5，接近稿值 88.2，方向對）。分級門檻照稿硬編碼：**優秀≥90 / 良好≥75 / 普通≥60 / 警示≥45 / 危險<45**。demo seed 直接塞 score + 六維（兩者一致即可），helper 同時提供等權算法。

---

## 四、資料策略（路線 b，見拍板 Q2）

**不需新 DDL**（`kpi_snapshots` org_id + period_month 容器都在）。沿用 round-16/17「能算就算、算不出 seed」+ `metadata.demo`：
- 5 店 × 5 季 `health_score`（編有故事的曲線：台北穩升⭐/台中緩升/高雄惡化🚨/台南走平📉/嘉義低基起步🌱，對齊既有 persona）。
- trail 只需 `health_score`+`achievement_rate` 兩條多季序列（稿的 history 也只存這兩個），其餘軸切換 trail 用當期值。
- 單期六維分 + 四軸（達成率/毛利率/NPS/成長率）+ 規模（`revenue_scale` 可從 sales_orders 真實加總、`staff_count` 從 employees count 真實算）。
- **季度錨點**：用每季末月（3/6/9/12 月的月初）當季別、helper 把 month 映成季標籤，**不改 schema**。

---

## 五、開工前要 Ming 拍板的題

1. **Health Score 權重**：六維**等權 1/6**（demo 直接塞 score、helper 也提供等權算法），分級門檻優秀90/良好75/普通60/警示45/危險<45 — OK？還是你有特定權重公式（若建議書 docx 有定義請示知）？
2. **資料策略（同 round-17 Q 等級）**：補 5 店 × 5 季 `health_score` + 單期六維/四軸/規模 seed（路線 b，~120 row，標 demo flag），`revenue_scale`/`staff_count` 真實算 — OK？
3. **本輪 scope**：GRP16+GRP17 **一輪做完**（Batch A 地基 + Batch B 兩頁）— OK？還是只先做 GRP16 Health Score、GRP17 下一輪？
4. **`<D3ScatterChart>` 升級 vs 另開元件**：在現有元件**加 prop**（sizeOf/trail/theme dark/onSelect/quadrantLabels）升級成亮/暗雙模（向後相容、GRP07/08/11 不破）— OK？還是另開 `<D3QuadrantChart>` 專供暗色策略層？（我建議加 prop、避免兩套散佈圖漂移）
5. **新圖元件**：新建 `<D3RadarChart>`（六維雷達）+ `<D3MultiLineTrend>`（多店多線）+ `<D3Gauge>`（半圓儀表盤）— OK？
6. **GRP18 集團客戶動態**：本輪**排除**、記未來（客戶旅程/來源 donut/流失預警/高風險名單）— OK？

---

## 六、結案條件

- ✅ 季度 seed（5 店 × 5 季 health + 單期六維/軸/規模）+ `revenue_scale`/`staff_count` 真實算
- ✅ `getDealerHealthScores` + `getStoreScoreHistory` domain function
- ✅ 新元件 `<D3RadarChart>` / `<D3MultiLineTrend>` / `<D3Gauge>` + `<D3ScatterChart>` 升級（向後相容、round-16/17 不破）
- ✅ GRP16 `/group/health-score`（gauge+評分卡+雷達+5季走勢+排行）+ GRP17 `/group/store-quadrant`（暗色四象限+切換軸+size+trail+詳情面板）render-smoke PASS + 截圖 `docs/test-evidence/round-18/`
- ✅ 四象限均值十字動態分類 / 軌跡 trail / 雷達 / 健康分分級 可運作
- ✅ `npx tsc --noEmit` 0 + `npm run build` 0 + 天條 audit 0 + nav 雙 brand
- ✅ Notion STATUS=完成 + 下一輪 HANDOFF（GRP12-14 商務管理層 或 GRP18 客戶動態）

---

## 七、GRP17 門店評估四象限 — 落地細節（2026-05-30 Batch B T2）

> 重用 Batch A 地基（`getDealerHealthScores` / `getStoreScoreHistory` / 升級版
> `<D3ScatterChart>` / `<D3RadarChart>`）。零新增 schema / helper，純前端組裝暗色互動板。
> 全集團視圖、無門店切換器、無 `?store=`，所有互動（軸切換 / size / trail）純前端 redraw。

### 7.1 檔案

```
src/app/(workspace)/group/store-quadrant/
  ├── page.tsx                            ← server：admin gate + brand → Promise.all → board
  └── _components/store-quadrant-board.tsx ← client：暗色主題互動板
```

page.tsx 沿用 GRP16 health-score pattern：`getCurrentUserAndAdmin()` → 未登入
`redirect("/login")`、非 admin 紅字 main；`getActiveScope().brand_id` →
`Promise.all([getDealerHealthScores, getStoreScoreHistory])` → 注入 board。天條：不直連 supabase。

### 7.2 軸選項映射

X / Y 軸（5 選項，共用同一份選項表）：

| label | key | 格式 | 0..1 軸 |
|---|---|---|---|
| 達成率 | `achievement_rate` | `%` | ✓ |
| 毛利率 | `gross_profit_rate` | `%` | ✓ |
| 健康分 | `score` | 整數 | ✗（0-100）|
| 客戶 NPS | `store_nps` | 整數 | ✗ |
| 成長率 | `growth_rate` | `%`（可負）| ✓ |

預設 **X=達成率、Y=健康分**。`xFormat`/`yFormat` 依選項 0..1→百分比、其餘→整數。

圓圈大小（3 選項）：營收規模 `revenue_scale`（預設）/ 員工數 `staff_count` / 健康分 `score`
→ `sizeOf={d => d[sizeKey]}`，元件 `scaleSqrt` 映直徑 22-52px。

### 7.3 trail pointsOf

`StoreScoreHistory.axes` 只有 `health` 與 `achievement` 兩條歷史序列：
- `xKey==='score'` → `axes.health`；`xKey==='achievement_rate'` → `axes.achievement`；其餘軸無
  歷史 → 用該店「當前值常數」填滿（長度=季數）。Y 同理。
- 逐季配對 `{x,y}[]`、過濾任一軸 null 的季；< 2 點元件自動不畫（兩軸都 fallback 常數時退化成
  單點 → 不畫，符合「無歷史就無軌跡」）。

### 7.4 四象限分類（動態均值十字）

對全部「兩軸都有有效值」的店算 `xMean`/`yMean`（d3 `mean`，與散佈圖元件內建十字一致）：

| X | Y | quad | label | 色 |
|---|---|---|---|---|
| ≥x̄ | ≥ȳ | `tr` | 卓越門店 | `#3DBE6E` |
| ≥x̄ | <ȳ | `br` | 穩健門店 | `#5DCAA5` |
| <x̄ | ≥ȳ | `tl` | 待發展門店 | `#85B7EB` |
| <x̄ | <ȳ | `bl` | 重點輔導門店 | `#F5B942` |

任一軸缺值的店歸「未分類」（一覽不列入 4 欄、圖上不畫）。`tagOf={d=>d.tag}` 沿用健康分級色。

### 7.5 詳情面板欄位

店名 + 象限 badge（套象限色）+ 4 KPI 格（達成率/毛利率/NPS/成長率，缺值「—」）+ 六維水平
bar（`dims`，HEALTH_DIM_LABEL）+ 建議策略文字（`strategy`）+ Health 近 5 季歷史 bar
（`StoreScoreHistory.scores`，高度對映 0-100）+ `<D3RadarChart>` 六維雷達。

### 7.6 暗色 token

main 底 `#0D1B2A`；卡片 `#13263B` / border `#22364D`；標題 `#E6EDF5`、次級 `#8FA3B8`、弱化
`#5E7388`；`<select>` 底 `#0F2236` / border `#2C4258` / 文字 `#C2D0DE`。散佈圖傳 `theme="dark"`
（元件內建 dark token）。象限色：卓越 `#3DBE6E` / 穩健 `#5DCAA5` / 待發展 `#85B7EB` /
重點輔導 `#F5B942`。雷達在暗底用品牌藍描邊（`#5DA8E8`，暗底可讀）。
