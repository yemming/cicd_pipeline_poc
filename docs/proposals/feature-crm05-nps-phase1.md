# CRM05 NPS 看板（銷售）— 視覺化升級 Phase 1 提案

**Sprint**：CRM05 ・ **規模**：M（3–5 天） ・ **狀態**：phase 1（提案中、未落地）

- 規格稿：`docs/DUCATI_v2_output/02_客服管理/01_銷售CRM/CRM05A_NPS看板_銷售_v1.html`（322 行）
- 現行頁：`src/app/(workspace)/crm/sales/nps/page.tsx` + `_components/nps-dashboard-view.tsx`（423 行）
- Domain helper：`src/domain/sales-nps.ts` ・ Constants：`src/domain/sales-nps.constants.ts`
- 現行底表：`nps_responses`（60 筆 indian seed，sales=30 / aftersales=30）

---

## 1. Spec 實際內容（5 大區塊）

### A. NPS 主橫幅大卡（hero）
- 左：本月 NPS 分數大字（例 `+62`）+「滿分 +100」+「▲ +8 vs 上月」趨勢箭頭
- 中：三段分佈卡（推薦者 9–10 / 被動者 7–8 / 批評者 0–6）顯示「人數 / 標籤 / %」
- 右：本月回答分佈長條（pro / pas / det 三色橫條）+「本月有效回答 N 份」+「問卷完成率 X%」
- 深藍漸層底（`#1A3A5C → #2A5080`）、白字、`border-radius:12px`

### B. KPI 列（4 欄）
| 欄位 | 數值來源 | 副標 |
|---|---|---|
| D+3 回訪完成率 | 已回應 / 應回訪（交車後 D+3） | `本月 N/M 件完成` |
| 平均回答分數 | `avg(score)` 滿分 10 | `滿分 10 分` |
| 批評者處理中 | `category='detractor' AND status≠resolved` | `需主管跟進` |
| 高分客戶推薦轉介 | `score>=9 AND has_referral` | `本月轉介新潛客` |

### C. NPS 月度趨勢 SVG 折線圖
- 近 6 / 12 月切換（select）
- viewBox `0 0 480 160`、4 條格線（+20 / +40 / +60 / +80）
- `<polyline>` 折線 + 6 個 `<circle>` 數據點 + 文字 label（每個月 +N 分）
- 當月點放大 + 紅色強調（其他點深藍）

### D. 各評估面向平均分（6 項評分條）
- 2 欄 grid
- 每項：標題 + 橫條（fill 寬度 = 分數 %）+ `9.2 / 10` 文字
- 顏色分級：≥9 teal、8–8.9 navy、7–7.9 amber、<7 red

預設 6 個面向：銷售顧問服務態度 / 試駕體驗安排 / 交車流程順暢度 / 報價透明度 / 等候時間感受 / 整體購車體驗

### E. D+3 回訪記錄表 + 批評者追蹤
- 上：5 欄 grid（客戶+車款 / 評分圓徽 / 日期 / 負責 RS / 主要回饋）+ 篩選 dropdown（全部 / pro / pas / det）+ 匯出鈕
- 下：批評者卡片區（紅底警示）：客戶 + 評分圓徽 + 車款交車日 + 主管介入狀態 chip + 回饋引文 + 操作鈕（致電道歉 / 補償方案 / 安排說明 / 標記完成）

---

## 2. 資料缺口 audit

### 2.1 既有 typed 欄位（`nps_responses`，14 欄）

| 欄位 | type | 已可用 |
|---|---|---|
| `id` `brand_id` `kind` | uuid/text/text | ✅ kind='sales' |
| `customer_id` `call_task_id` `survey_template_id` | uuid | ✅ FK |
| `score` (smallint, NOT NULL) | 0–10 | ✅ |
| `category` (text) | promoter/passive/detractor | ✅ 已 categorize |
| `comment` (text) | 自由留言 | ✅ |
| `store_id` (uuid) `sales_person` (text) | | ✅ |
| `responded_at` (timestamptz, NOT NULL) | | ✅ 趨勢 group by 用 |
| `metadata` (jsonb) | 目前 seed 全 `{}` | ⚠️ 空 |

### 2.2 缺口（spec 要、DB 沒）

| Spec 需求 | 現況 | 處置 |
|---|---|---|
| **各面向評分**（6 項 × 0–10）| ❌ `metadata` 全空、`questions` jsonb 也只有 q1–q4 rating 1–5 + single/multi/text | metadata jsonb 升級：`facets: { sales_attitude, test_ride, delivery, pricing, waiting, overall }` 各 0–10 |
| **D+3 應回訪 vs 已回**（完成率分母）| ❌ 無「應回訪名單」概念 | 從 `call_tasks` 撈 `task_type='nps_d3' AND due_date in [本月]`；如果 call_task 沒這 kind，後備從 `sales_orders.delivered_at` 推算 D+3 應回名單 |
| **趨勢「vs 上月」delta** | ⚠️ 需自算 | helper 計兩個月 NPS 相減 |
| **批評者處理狀態**（主管介入中 / 跟進中 / 已處理）| ❌ 沒欄位 | metadata jsonb：`detractor_status: 'pending'\|'in_progress'\|'resolved'`、`assigned_manager: text` |
| **高分客戶推薦轉介數** | ❌ 沒 referral 追蹤 | metadata jsonb：`has_referral: boolean`、`referred_leads: int`；長期升 typed |
| **問卷完成率** | ⚠️ 需要分母（已寄出問卷 vs 已回應）| 從 `call_tasks` 或新增 `nps_survey_dispatches` 表（暫不做、Phase 1 先用 D+3 完成率代之）|
| **車款顯示**（`Panigale V4 S` 等）| ⚠️ `nps_responses` 沒車款欄 | 沿著 `customer_id → sales_orders.model` 拉；或 metadata.vehicle_model 落點 |

### 2.3 升降級判斷

| 升 typed column | 留 metadata jsonb |
|---|---|
| `detractor_status`（會被 RLS / 報表用） | `facets`（各店問卷可能改題目、欄位不穩） |
| `assigned_manager_id` (uuid FK) | `referred_leads`、`has_referral`（轉介機制還沒定型） |
|  | `vehicle_model`（暫顯示用，未來從 sales_orders join 取 typed）|

Phase 1 不動 schema、先全走 metadata jsonb。等三頁以上用到再 promote。

---

## 3. 預設架構

### 3.1 NPS 計算公式（不變）
- `%推薦 = promoter / total × 100`
- `%批評 = detractor / total × 100`
- `NPS = round(%推薦 - %批評)`，範圍 [-100, +100]
- 分級：score 9–10 = promoter / 7–8 = passive / 0–6 = detractor（已在 `sales-nps.constants.ts`）

### 3.2 月度趨勢（server-side SQL）
```sql
SELECT date_trunc('month', responded_at)::date AS m,
       count(*) AS total,
       count(*) FILTER (WHERE score>=9) AS promoter,
       count(*) FILTER (WHERE score BETWEEN 7 AND 8) AS passive,
       count(*) FILTER (WHERE score<=6) AS detractor,
       avg(score)::numeric(4,2) AS avg_score
FROM nps_responses
WHERE kind='sales' AND brand_id = $1
  AND responded_at >= date_trunc('month', now()) - interval '5 months'  -- 6/12 切換
GROUP BY 1 ORDER BY m ASC;
```
回傳 6 / 12 月陣列；缺月補 `total=0`（畫圖時跳點 or 顯示無資料）。

### 3.3 各面向平均分（從 metadata jsonb 撈）
```sql
SELECT
  avg((metadata->'facets'->>'sales_attitude')::numeric) AS sales_attitude,
  avg((metadata->'facets'->>'test_ride')::numeric)      AS test_ride,
  avg((metadata->'facets'->>'delivery')::numeric)       AS delivery,
  avg((metadata->'facets'->>'pricing')::numeric)        AS pricing,
  avg((metadata->'facets'->>'waiting')::numeric)        AS waiting,
  avg((metadata->'facets'->>'overall')::numeric)        AS overall
FROM nps_responses
WHERE kind='sales' AND brand_id=$1
  AND responded_at >= date_trunc('month', now())
  AND metadata ? 'facets';
```
seed 缺資料時 → helper return `null`，UI 顯示「— 尚無評分資料」。

### 3.4 SVG 折線圖（自刻、不引 chart 套件）
- 元件 `<NpsTrendLineChart points={NpsMonthlyPoint[]} />`
- viewBox `0 0 480 160`，左 padding 40（Y 軸標籤）、右 padding 20
- `<polyline points="x,y x,y …" stroke="#1A3A5C" stroke-width="2.5" fill="none">`
- 6 / 12 月時 x 軸位置：`x = 40 + i × (420 / (n-1))`
- y 軸：score 範圍 [-20, +100]，y = `160 - (score + 20) / 120 × 140`
- 當月點 `<circle r="5" fill="#C8001A">` + 紅字 label；其他點 navy
- 互動：點擊月份 → URL `?period=YYYY-MM`、轉到該月 detail（Phase 2 再做、Phase 1 純展示）

### 3.5 高分客戶轉介數
```sql
SELECT count(*)
FROM nps_responses
WHERE kind='sales' AND brand_id=$1 AND score>=9
  AND (metadata->>'has_referral')::boolean = true
  AND responded_at >= date_trunc('month', now());
```
metadata 沒這 key 時 fallback = 0。

### 3.6 D+3 完成率
- 分子：本月 `responded_at`、`survey_template.code = 'sales_d3_handover'`（或 metadata.template_code）
- 分母：本月應回訪 = `call_tasks WHERE task_type='nps_d3' AND due_date IN 本月`，沒有就 fallback `sales_orders.delivered_at + 3d IN 本月`
- Phase 1 先用「本月已回應數 / 本月已回應 + 未回應」近似；spec 圖上 `31/37` 寫死可以接受

### 3.7 批評者追蹤
- 列表已存在於現行 `recentDetractors`
- Phase 1 新增 metadata 欄位 `detractor_status` 預設 `pending`，UI chip 顯示「主管介入中 / 跟進中 / 已處理」
- 操作鈕（致電道歉 / 補償方案 / 標記完成）綁 `updateDetractorStatusAction(id, status)` 寫回 metadata

### 3.8 元件拆分

```
src/app/(workspace)/crm/sales/nps/
├── page.tsx                       # server, 撈 dashboard + facets + monthlyTrend
└── _components/
    ├── nps-dashboard-view.tsx     # 改寫，仍是 root client
    ├── nps-hero-card.tsx          # 新：主橫幅大卡（hero）
    ├── nps-kpi-row.tsx            # 新：4 欄 KPI（取代原 5 顆）
    ├── nps-trend-line-chart.tsx   # 新：SVG 折線
    ├── nps-facet-scores.tsx       # 新：6 項評分條
    ├── nps-review-list.tsx        # 改：D+3 回訪記錄（取代 detractor 單 list）
    └── nps-detractor-panel.tsx    # 改：批評者卡片 + 操作鈕

src/domain/
├── sales-nps.ts                   # 擴：getMonthlyTrend / getFacetAverages / getReferralCount
└── sales-nps.constants.ts         # 擴：FACET_LABELS / DETRACTOR_STATUS_BADGE
```

### 3.9 不動現行 type 邊界
- `RangeKey` (7d/30d/90d/all) 保留供現行用 → 趨勢圖新增 `monthlyPeriod: '6m' | '12m'` 獨立 state
- `NpsTrendPoint` 既有（週 bucket）保留；新增 `NpsMonthlyPoint` 走月 bucket（不混用）

---

## 4. 落地拆題

| 子任務 | 內容 | 預估 |
|---|---|---|
| **CRM05.1** | Hero 大卡 + KPI 4 欄重畫；domain 加 `getCurrentVsLastMonthDelta()`、`getReferralCount()` | 0.5d |
| **CRM05.2** | SVG 月度折線圖元件 `<NpsTrendLineChart>` + domain `getMonthlyTrend(n: 6|12)` + 6/12 月切換 select 推 URL | 1d |
| **CRM05.3** | 各面向評分條 `<NpsFacetScores>` + domain `getFacetAverages()`；seed 30 筆 sales nps_responses metadata.facets jsonb | 1d |
| **CRM05.4** | D+3 回訪記錄 5 欄列表 + 批評者卡片操作鈕（`updateDetractorStatusAction`）+ 篩選 dropdown + 匯出 CSV | 1–1.5d |

加總 3.5–4 天，符合 M（3–5d）。

---

## 5. 待 Ming 拍板（決策點）

- **Q1**：面向（facets）這 6 項要不要照規格稿直接用「銷售態度 / 試駕 / 交車 / 報價 / 等候 / 整體」？還是改成可變的 question-template-driven（依 survey_template.questions jsonb 動態 render，每 template 自帶面向定義）？後者通用但工會大 2 倍。**預設選前者**（hardcode 6 項 + metadata.facets jsonb）。

- **Q2**：D+3 完成率分母來源。三選一：
  - (a) 從 `call_tasks WHERE task_type='nps_d3'`（要新增 task_type enum、跟 CRM03 電訪工作台耦合）
  - (b) 從 `sales_orders.delivered_at + 3d`（純 derived、不需 call_tasks）
  - (c) Phase 1 寫死分母 = `已回應 / (已回應 + 預設 20% buffer)`，等 CRM03 完成回頭接（最快）
  **預設選 (b)**，跟 CRM03 解耦。

- **Q3**：批評者操作鈕（致電道歉 / 補償方案 / 安排說明）是否需要產生 follow-up call_task 寫回 CRM03 電訪工作台？還是只在 metadata 標個 `detractor_status` 就好？**預設後者**（Phase 1 只標記、Phase 2 再串）。

- **Q4**：「vs 上月 ▲+8」當月 NPS 跟上月比 — 月初樣本太少（例如 5/1 才 1 筆）會劇烈跳動，要不要加「樣本 < N 筆隱藏 delta」門檻？**預設 N=5**，少於 5 筆顯示「樣本不足」。

- **Q5**：高分轉介 `metadata.has_referral` 怎麼進資料？是否需要在電訪工作台 / NPS 回訪表單上加「客戶有沒有轉介朋友？」勾選欄？Phase 1 純展示（沒資料 = 0）OK 嗎？**預設 OK**，CRM05.5（未列）再回頭加表單欄。

- **Q6**：匯出 CSV 範圍是「當月 D+3 回訪記錄」還是「期間內所有回應（含 7d/30d/90d 切換）」？**預設選後者**，跟 range select 連動。

- **Q7**：規格圖右下「批評者追蹤」卡片底色 `#FDECEA` 飽和度偏高，要不要降到 `#FEF6F5`（現行 detractor list 已用）保持視覺一致？**預設選後者**。

---

## 附錄：現行資料分布（決策參考）

| 月 | 筆數 | avg score | promoter | passive | detractor |
|---|---|---|---|---|---|
| 2026-05 | 5 | 9.40 | 5 | 0 | 0 |
| 2026-04 | 10 | 9.50 | 10 | 0 | 0 |
| 2026-03 | 10 | 7.10 | 0 | 9 | 1 |
| 2026-02 | 5 | 3.20 | 0 | 0 | 5 |

→ seed 分布很適合 demo「先低分後拉回」的 NPS 改善故事線；CRM05.3 落地時要記得補 `metadata.facets` 否則面向卡會全空。
