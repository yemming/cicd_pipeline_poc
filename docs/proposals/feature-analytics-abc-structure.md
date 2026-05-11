# 提案：ABC 結構圖（分析報表 §12.5）

> 來源：`docs/DUCATI_庫存管理模組_串接版_20260510_最新版/12_分析報表_ABC結構圖.html`
> 日期：2026-05-11
> 階段：架構提案 → 已預先批准 → 直接進落地

## 1. 結構摘要

ABC 分類結果的「視覺化儀表板」。以三大區塊呈現分類結構：
帕雷托曲線（料號累計 vs 金額累計，A/B 切分點）、銷售額結構圓環（A/B/C 金額佔比）、
分類變動記錄（prev_class vs abc_class diff）。讀 `abc_classification_results` snapshot，
不做任何寫入。

## 2. Schema 草案

### 新表

**無**。完全沿用既有 `abc_classification_results`（含 `prev_class` / `recalc_at` / `rank_in_brand` / `cum_pct`）。

### 已知 Gap：月度結構變化（規格 §4）

`abc_classification_results` 是「最新一次」snapshot，無歷史月度快照。
規格的「近 6 個月 ABC 結構變化 stacked bar」需要每月 snapshot 表。

**本次方案**：降級成「本期 vs 上次重跑」**兩期比較 bar chart**，用既有 `prev_class` 反推上次的 A/B/C 計數。
標題明示「v1 兩期比較；近 6 期月度快照待後續 sprint」。

未來升級路徑（**本次不做**）：

```sql
-- 待落地，不在本次 scope
CREATE TABLE abc_classification_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id text NOT NULL,
  snapshot_month text NOT NULL, -- 'YYYY-MM'
  abc_class text CHECK (abc_class IN ('A','B','C')) NOT NULL,
  item_count int NOT NULL,
  total_amount numeric NOT NULL,
  taken_at timestamptz DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  UNIQUE (brand_id, snapshot_month, abc_class)
);
```

## 3. Domain Helper 規劃

檔案：`src/domain/analytics.ts`（既有檔，append 一節）

```ts
export type AbcStructureRow = {
  rank: number | null;
  item_code: string;
  item_name: string;
  abc_class: AbcClass;
  prev_class: AbcClass | null;
  output_amount_12m: number;
  output_qty_12m: number;
  cum_pct: number | null;
};

export type AbcStructureChangeRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  prev_class: AbcClass;
  abc_class: AbcClass;
  /** 'up' (B→A / C→B) | 'down' (A→B / B→C) */
  direction: 'up' | 'down';
  output_amount_12m: number;
};

export type AbcStructurePareto = {
  /** 每點：[料號累計 %, 金額累計 %]；多點組成曲線 */
  curve: Array<{ x: number; y: number }>;
  /** A/B 切點（料號 % / 金額 %） */
  cut_a: { x: number; y: number } | null;
  cut_b: { x: number; y: number } | null;
};

export type AbcStructurePeriodCompare = {
  /** 本次計數（依當前 abc_class） */
  current: { A: number; B: number; C: number };
  /** 上次計數（依 prev_class；prev=null 視為「上次未分類」） */
  prev: { A: number; B: number; C: number; unclassified: number };
};

export type AbcStructurePageData = {
  overview: AbcOverview;
  pareto: AbcStructurePareto;
  rows: AbcStructureRow[];
  changes: AbcStructureChangeRow[];
  period_compare: AbcStructurePeriodCompare;
};

export async function getAbcStructurePageData(): Promise<AbcStructurePageData>;
```

實作策略：reuse `listAbcResults()` 拿到 rows → server side 算 pareto curve / period compare / changes。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| 開頁載入 | 純 SELECT、無寫入 | 確定 |
| 重跑 ABC（從本頁觸發 — **本次不加入**） | recalc + 影響全站 ABC | 不在本頁 scope |

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| ABC 結構圖 | `/parts/analytics/abc-structure` | Dashboard | `parts/analytics/abc/_components/abc-board.tsx` 的 OverviewTab |

新增檔：

- `src/app/(workspace)/parts/analytics/abc-structure/page.tsx`（**改寫**）
- `src/app/(workspace)/parts/analytics/abc-structure/_components/abc-structure-board.tsx`（**新增**）

UI 構成（由上到下）：

1. Page header（H1 + chip §12.5 + caption）
2. 3 顆 KPI tile（A / B / C — 料號數 · 銷售額佔比，左 border 色帶）
3. 兩欄並排：帕雷托曲線（SVG）｜銷售額結構圓環（conic CSS pie）
4. 兩欄並排：分類變動 bar chart（本期 vs 上次）｜本月分類變動記錄表（top N）
5. 頁尾「→ 庫存周轉率 / 呆滯庫存 / ABC 分類設定」navigation pills

## 6. nav_nodes

⚠️ **既有節點，不 INSERT**。`indian` brand 已存在 `react_route` 節點 `18c86927-1f69-428d-86a5-c64c189c0d2c`，
`href = '/parts/analytics/abc-structure'`。Ducati brand 沒對應節點（跟 WMS Ducati 不做的範圍一致，本次不補）。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 改寫 | `src/app/(workspace)/parts/analytics/abc-structure/page.tsx` |
| 新增 | `src/app/(workspace)/parts/analytics/abc-structure/_components/abc-structure-board.tsx` |
| append | `src/domain/analytics.ts`（加 `getAbcStructurePageData` 段） |

## 8. Verification

1. `npx tsc --noEmit` 0 errors
2. `npx eslint` 對應路徑 0 errors
3. page.tsx 不直接 import `@/lib/supabase/*`
4. brand_id 從 active scope 取（multi-brand 隔離）
5. 任何 amounts.total = 0 / 無 rows 時所有區塊 graceful empty state
6. prev_class = null 視為「上次未分類」、不算 change

## 9. 開放問題（已預先批准 → 默認方案）

- [x] 月度變化用 prev_class 兩期比較（不新建快照表）
- [x] 不從本頁觸發 recalc（保持純讀取頁）
- [x] 變動記錄 top 20 by `output_amount_12m`
- [x] Pareto curve 用 SVG 自刻、不引 chart lib
