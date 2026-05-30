# 第十六輪 — 集團管理啟動：Phase 1 地基 + GRP07/08 個人能效散佈圖

**日期**：2026-05-29
**Spec 來源**：`docs/20260529/`（對照表 v1 + 代理商集團功能設計建議書 v3 + 背景文件 v5）
**對照報告**：`docs/20260529/DealerOS_三方對照報告_v1.docx`（本輪即報告第三欄「集團管理戰略主線」的第一手）
**前一輪**：第十五輪 整車供應鏈模組（已結案，commit `569eaaa`）

---

## 一、為什麼做

三方對照報告的結論很清楚：對照表標 ❌/⚠️ 的項目我們絕大多數早已實作上線，**唯一與實作落差最大、且戰略價值最高的一段就是「集團管理深度診斷層」**——GRP07–GRP19 的個人能效散佈圖、零件財務串聯、戰略決策層全部 ❌。

而這一段正是建議書 v3 的核心、也是對外提案最高價值層：

> 「賣給單一門店：幫你提升效率。賣給代理商層：讓你知道哪間門店值得加碼、哪間需要介入、哪間值得收購。」

### 為什麼從 Phase 1 地基 + GRP07/08 開始

1. **地基是前置依賴**：建議書第十二章把 `kpi_snapshots 批次` + `org_benchmarks 對標表` + `org_id 權限過濾` 列為 Phase 1，所有後續 GRP 功能都依賴這層。地基不穩，後面全部要重做。
2. **GRP07/08 是診斷理念的核心展演**：「平均值說謊，散佈圖才說真話。異常自己說話——當某個人的點跑到左下角，管理層自己就看到了。」這兩支散佈圖頁是把 EY DPCP 顧問的診斷邏輯固化進系統的第一個落地證明。
3. **去風險**：探勘確認 `organizations` 四層結構（level/parent_id/type/brand_id）已就位，Phase 0 不需動組織表；`recharts ^3.8.1` 已在 deps，散佈圖不需裝新套件。

---

## 二、Scope 與任務切分

### 🔴 Phase 0 — Schema + 地基（主 agent 自做，不分派）

| Task | 內容 | 工時 |
|------|------|------|
| **T0a** | 確認 `organizations` 四層（已驗證 level/parent_id/type/brand_id 在位）→ 不 ALTER。`org_mode` 開關落在 `brand_modules`，本輪不阻塞、僅探勘記錄 | 0.3 天 |
| **T0b** | CREATE `kpi_snapshots`（快取表：brand_id, org_id, staff_id, staff_role, period_month, metric_key, metric_value numeric, metadata jsonb）+ RLS 4 policy + index(brand_id, period_month, staff_id) | 0.3 天 |
| **T0c** | CREATE `org_benchmarks`（對標表：brand_id, scope[cluster/region/national], segment, metric_key, metric_value, period_month）+ RLS 4 policy | 0.2 天 |
| **T0d** | domain `src/domain/group-analytics.ts`：個人能效聚合查詢（**3 個月滾動平均**，建議書 §11.2）。回傳散佈圖資料 `{ staff_id, name, store, x, y, tag }[]`。POC 先**即時查詢**（on-the-fly，讀 orders/repair_orders/nps_responses GROUP BY staff），kpi_snapshots 表結構先建好、批次計算延後 | 0.7 天 |

**T0 必須先做完才能 unblock T1/T2。**

### 🔴 Phase 1 — GRP07 銷售顧問能效（1 隻 sub-agent · spec-to-feature）

| Task | 頁面 | 動作 | 工時 |
|------|------|------|------|
| **T1** | GRP07 銷售顧問能效 | 新建 `/group/sales-efficiency`；4 張 Recharts ScatterChart | L |

GRP07 四張常態散佈圖（建議書 §5.1）：

| # | 圖 | X 軸 | Y 軸 | 診斷 |
|---|----|------|------|------|
| S1 | 銷售能效 | 總接待量 | 成交率 | 高流量低轉化（新人/話術） |
| S2 | 盈利能效 | 成交率 | 單車 GP3 | 靠折扣衝量（右下最危險） |
| S3 | 衍生能效 | 成交率 | 單車衍生毛利 | 金融保險話術不足 |
| S4 | 客戶信任 | 成交台次 | 個人平均 NPS | 用服務換銷量的危險人物 |

視覺：象限背景 + 均值虛線（十字）+ hover tooltip（顯示業務名/門店/數值）+ 門店切換 filter。銷售藍主題（`#1A3A5C`）。銷售顧問點=圓形。

### 🔴 Phase 2 — GRP08 SA 能效診斷（1 隻 sub-agent · spec-to-feature）

| Task | 頁面 | 動作 | 工時 |
|------|------|------|------|
| **T2** | GRP08 SA 能效診斷 | 新建 `/group/sa-efficiency`；4 張 ScatterChart + 返修率告警橫幅 | L |

GRP08 四張散佈圖（建議書 §5.2）：

| # | 圖 | X 軸 | Y 軸 | 診斷 |
|---|----|------|------|------|
| A1 | 接車產值 | 接車台次 | 單車產值 | 接很多但沒增項 |
| A2 | 接車毛利 | 接車台次 | 毛利率 | 高台次低毛利（Marvin 型態） |
| A3 | 增項能力 | 增項率 | 增項金額 | 開口率低 |
| A4 | 客戶信任 | 接車台次 | 個人平均 NPS | 高台次但客戶不滿意 |

視覺：售後綠主題（`#0F6E56`）。SA 點=菱形（建議書統一規範）。**返修率 > 5% 自動觸發紅色告警橫幅**（AC 案例該店 45%，系統必須提前預警）。

### 🟡 Phase 3 — demo 資料 + nav + 驗證（主 agent）

- **demo seed**（Indian brand）：讓散佈圖有 ~8–12 個業務/SA 點位、分佈合理（右上明星 / 左下待輔導 / 右下折扣衝量危險）。Indian 主力，Ducati 副（依 CLAUDE.md 測試資料規範）。
- **nav_nodes 雙 brand 入口**：掛集團管理模組下「個人能效」群組（參考 GRP01-06 既有 /group 入口位置）。`page_kind='react_route'`。
- **Playwright render-smoke**：起 dev 前先 `rm -rf .next`（防 catch-all 污染雷）。兩頁 200 + 散佈圖元素命中 + 無 console error。截圖存 `docs/test-evidence/round-16/`。

**Phase 預估總時程**：4–5 天。

---

## 三、Schema migration 摘要

### CREATE 2 張新表（皆 ENABLE RLS + 4 policy，照 `user_has_brand(brand_id)` pattern）

```sql
-- 個人能效 KPI 快取（本輪先建結構，POC 即時查詢，批次延後）
CREATE TABLE kpi_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  org_id uuid,                 -- 門店
  staff_id uuid,               -- 員工（個人能效核心）
  staff_role text,             -- salesperson / sa / technician
  period_month date NOT NULL,  -- 月度快照
  metric_key text NOT NULL,    -- conversion_rate / avg_gp3 / fi_margin / nps ...
  metric_value numeric,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- 四欄對標（聚類/大區/全國標杆）
CREATE TABLE org_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  scope text NOT NULL,         -- cluster / region / national
  segment text,                -- 同規模分群
  metric_key text NOT NULL,
  metric_value numeric,
  period_month date,
  created_at timestamptz DEFAULT now()
);
```

- **不動 `organizations`**（四層已就位）。
- **不大改交易表**：散佈圖細粒度指標（單車 GP3 / 衍生毛利 / 增項率 / 個人 NPS）現有 schema 多半沒有 → POC「能算就算、算不出用 demo seed 撐畫面」，不為此大改 orders/repair_orders。

---

## 四、執行流程

```
主 Agent（Claude）：
 1. T0 schema（kpi_snapshots + org_benchmarks + RLS）+ group-analytics.ts 地基 — 自己做
 2. 派 T1（GRP07）+ T2（GRP08）兩隻 spec-to-feature sub-agent 並行（純檔案、禁起 dev server）
 3. 收回 → demo seed（Indian 主力）讓散佈圖有合理分佈
 4. nav_nodes 雙 brand 入口
 5. rm -rf .next → 起 dev → render-smoke 兩頁 + 截圖
 6. tsc 0 / build 0 / 天條 audit 0 → 回報 Ming → 等 commit/push 點頭
```

**Sub-agent 派工紀律**（memory [[feedback_sub_agent_resource_discipline]]）：
- spec-to-feature（純檔案）= 可並行（T1/T2 同時）
- Playwright 跑 dev server + Chromium = 必須序列、一次一隻、先清 .next

---

## 五、開工前要 Ming 拍板的 5 題

1. **圖表庫**：用 **Recharts ScatterChart**（已在 deps、React 原生、建議書認可可轉），不手刻 D3 — OK？
2. **kpi_snapshots 策略**：POC 先**即時查詢**（domain helper on-the-fly、3 個月滾動），快取表結構先建好、批次計算延到資料量大才做 — OK？
3. **org_benchmarks 對標值**：demo 階段 **seed 假標杆**（聚類/大區/全國）讓四欄對標有東西顯示 — OK？
4. **散佈圖細粒度指標**：現有交易表多半沒 GP3/衍生毛利/增項率/個人 NPS 欄 → POC「能算就算、算不出 demo seed」撐畫面，**不為此大改交易表 schema** — OK？
5. **路徑命名**：`/group/sales-efficiency`（GRP07）+ `/group/sa-efficiency`（GRP08），掛集團管理模組「個人能效」群組 — OK？

---

## 六、結案條件

- ✅ `kpi_snapshots` + `org_benchmarks` 建表，雙 brand RLS、service-role 寫得進
- ✅ `group-analytics.ts` 個人能效聚合查詢（3 個月滾動）回傳散佈圖資料
- ✅ GRP07 四圖（S1-S4）+ GRP08 四圖（A1-A4）render-smoke PASS + 截圖存 `docs/test-evidence/round-16/`
- ✅ demo seed 讓散佈圖有合理分佈（明星/待輔導/危險三類點位）
- ✅ GRP08 返修率 > 5% 告警橫幅可觸發
- ✅ `npx tsc --noEmit` 0 + `npm run build` 0 + supabase 天條 audit 0
- ✅ nav_nodes 雙 brand 入口
- ✅ Notion 卡 STATUS=完成 + 寫好下一輪 HANDOFF（下一輪：GRP09-11 門店診斷 + 趨勢對比曲線）
