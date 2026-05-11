# 提案：呆滯庫存分析報表

> 來源：`docs/DUCATI_庫存管理模組_串接版_20260510_最新版/12_分析報表_呆滯庫存.html`
> 日期：2026-05-11
> 階段：架構提案（用戶已預先批准 → 直接進階段 4 落地）

## 1. 結構摘要

把「90 天+未銷售」料號從 `stock_items` × `stock_issues/_lines` × `items` × `abc_classification_results` 倒推出來，產出 4 個 KPI tile、2 個圖表卡（呆滯天數分佈 / 原因分析）、1 張明細表，給庫存管理員「促銷 / 報廢 / 觀察」決策依據。

跟 turnover 報表共用同套資料來源、不另建 snapshot 表（規格沒明示要 snapshot；資料新鮮度跟 ABC 分類重跑同步）。

## 2. Schema 草案

### 新表

無。

### 現有表變更

無。完全 reuse：

| 來源表 | 用途 |
|---|---|
| `stock_items` | 期末庫存量 / 占用成本 / `last_movement_at` fallback |
| `stock_issue_lines` × `stock_issues` | per-item 最後出庫日（`MAX(issue_date)`）+ 12M 出庫量 |
| `stock_receipt_lines` | 12M 入庫量（判定「採購過量」用） |
| `items` | code / name / category / control_type / is_active |
| `abc_classification_results` | abc_class（顯示） |

### 欄位分類

純讀取場景，沒有 typed/jsonb 議題。

## 3. Domain Helper 規劃

檔案：`src/domain/analytics.ts`（既有；append 呆滯相關 function，跟 turnover/ABC 共用 helper file）

```ts
export type StaleReasonCode = "discontinued" | "overstock" | "rev_change" | "other";

export type StaleRow = {
  item_id: string;
  item_code: string;
  item_name: string;
  category: string | null;
  abc_class: AbcClass | null;
  qty: number;                  // 期末庫存
  value: number;                // 占用成本
  last_issue_date: string | null;
  days_idle: number;            // 閒置天數（必 ≥ 90）
  reason_code: StaleReasonCode;
  reason_label: string;
  suggested_action: "scrap" | "promote" | "transfer" | "watch";
};

export type StaleBucketKey = "b90_180" | "b180_365" | "b365_plus";

export type StaleOverview = {
  total_stale_value: number;     // 呆滯料金額
  total_inventory_value: number; // 總庫存金額（含非呆滯）
  total_stale_count: number;     // 呆滯料號數
  total_sku_count: number;       // 總 SKU 數
  severe_count: number;          // 180 天+
  new_this_month: number;        // 過去 30 天內剛從非呆滯跨入呆滯（days_idle ∈ [90, 120]）
  buckets: Record<StaleBucketKey, number>;
  reasons: Array<{ code: StaleReasonCode; label: string; count: number }>;
};

export async function listStaleRows(filter: {
  bucket?: StaleBucketKey | "all";
  abc?: AbcClass | "all";
  q?: string;
}): Promise<StaleRow[]>;

export async function getStaleOverview(): Promise<StaleOverview>;

export async function getStaleAnalyticsPageData(filter: ...): Promise<{
  overview: StaleOverview;
  rows: StaleRow[];
}>;
```

策略：直連 supabase（跟 turnover/ABC 同層級）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| 報表載入 | 無；純讀取 | 確定 |
| HTML 規格內「申請報廢 / 移促銷倉 / 跨店調撥」按鈕 | 不在這次落地範圍（後續單獨開單）；先做 disabled placeholder 或省略 | 確定 |

無 [需確認] 項目。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 呆滯庫存分析 | `/parts/analytics/stale` | Report board | `_components/turnover-board.tsx` |

## 6. nav_nodes

既有節點走 `react_route`、`/parts/analytics/stale` — 不需動 nav_nodes。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 改寫 | `src/app/(workspace)/parts/analytics/stale/page.tsx` |
| 新增 | `src/app/(workspace)/parts/analytics/stale/_components/stale-board.tsx` |
| 擴充 | `src/domain/analytics.ts`（append stale 段落） |

## 8. Verification

1. tsc / eslint 0 errors
2. 預設 brand 進頁面：4 個 KPI tile / 2 圖表卡 / 明細表都渲染
3. KPI 數值非負、總庫存金額 ≥ 呆滯金額
4. bucket 桶總和 = 呆滯料號數
5. UI 不直接 import supabase（grep 驗證）
6. filter（bucket / abc / 搜尋）正常作動

## 9. 開放問題

用戶預先批准 → 採用默認方案直接落地：

- **呆滯定義**：`days_idle ≥ 90`，以 `MAX(stock_issue.issue_date)` 為主、`stock_items.last_movement_at` 為 fallback
- **原因分類**（heuristic）：
  - `discontinued`：`items.is_active = false`
  - `overstock`：12M 入庫量 ≥ 12M 出庫量 × 3 且 stock > 0
  - `rev_change`：留 placeholder（目前 schema 沒有 revision 訊號，全部歸 `other`）
  - `other`：其餘
- **新增呆滯**：`days_idle ∈ [90, 120]` 視為「近 30 天剛跨入」
- **按鈕（申請報廢 / 移促銷倉）**：先不做，只顯示「建議處置」chip
