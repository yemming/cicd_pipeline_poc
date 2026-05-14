# 提案：盤點差異調整頁（/parts/count/adjustments）

> 來源：既有 placeholder `src/app/(workspace)/parts/count/adjustments/page.tsx`（誤接 exceptions board） + sibling `/parts/count/sessions` 升級規範
> 日期：2026-05-14
> 階段：架構提案（**已由 implementation agent 代為拍板 — Recommended 預設值，使用者已全權授權**）

## 1. 結構摘要

盤點差異覆核作業頁。相對於兄弟頁：
- `/parts/count/plans`：規劃週期（next_run_at / abc_filter）
- `/parts/count/sessions`：執行中 / 全部 session
- **本頁** `/parts/count/adjustments`：聚焦「**有差異 + 待覆核 / 已完成 / 已取消**」的盤點單，提供差異覆核 / 過帳追溯的視角

對應 `inventory_counts` 主檔 — filter 預設 `variance_lines > 0` 且 `status IN ('pending_approval','completed','cancelled')`，主要任務是覆核並過帳差異（呼叫既有 `approveCountAdjustmentAction` → 接 `STOCK_ADJUSTMENT_GAIN/LOSS` engine）。

⚠️ 既有的 `page.tsx` 借用 `operations/exceptions` 的 board（adjustments domain — 報損報溢），與「盤點差異」是不同 domain，本次升級換成 count domain；exceptions 那邊不動。

## 2. Schema 草案

### 新表
無。

### 現有表變更
無。`inventory_counts` + `inventory_count_lines` 已存在，schema 不動。

### 欄位分類
（reuse 既有 typed columns；無新增）

## 3. Domain Helper 規劃

檔案：`src/domain/count.ts`（**append 一個薄 wrapper、不改既有 fn**）

```ts
// 新增（薄 wrapper，預設加上「has variance」filter）
export async function getCountAdjustmentsPageData(filter: {
  status?: string;
  warehouse_id?: string;
  q?: string;
  variance_only?: boolean;  // default true
}): Promise<{
  rows: CountSessionListRow[];
  warehouses: { id: string; name: string; code: string }[];
  canEdit: boolean;
}>

// reuse 既有
getCountSessionById(id)
approveCountAdjustmentAction(ctId)
cancelCountSessionAction(id)
```

實作策略：`listCountSessions` 已 supabase 直連、有 filter；adjustments wrapper 在它之上加一個 client-side filter `variance_lines > 0`（量級小，<200 row 上限），保持 schema 不動。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `approveCountAdjustmentAction` | 把 variance 行轉成 `inventory_adjustments` post、修 `stock_items.qty`、`status → completed`、接 STOCK_ADJUSTMENT engine 自動產分錄 | ✅ 已實作 |
| `cancelCountSessionAction` | 清明細、`status → cancelled` | ✅ 已實作 |

本頁本身**不直接 trigger** 會計事件、只是觀察 + 引導使用者覆核。

## 5. 會計事件分析（MANDATORY）

**本功能會產生的會計事件**：1 個（經由 approveCountAdjustment 鏈傳，與 sessions 共用同一條 pipeline）

| # | 業務動作 | 對應 transaction_type code | 狀態 | cash_flow_section | 觸發位置 |
|---|---|---|---|---|---|
| 1 | 盤點差異覆核過帳 | `STOCK_ADJUSTMENT_GAIN` / `STOCK_ADJUSTMENT_LOSS` | ✅ 已 seed + engine 接通（commit `37f3c7c`） | operating | `approveCountAdjustmentAction()` → `createAdjustmentAction()` → `instantiateTransaction()` |

**無新增 transaction_type 需求**。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 盤點差異 list | `/parts/count/adjustments` | List View | `parts/count/sessions/_components/count-sessions-board.tsx` |
| 盤點差異 detail | `/parts/count/adjustments/[id]` | Page View（read-mostly + 覆核） | reuse `parts/count/sessions/[id]/_components/count-session-detail-view.tsx` |

**Detail 行為**：reuse `CountSessionDetailView` 元件（不複製、不改），單純從 adjustments list 進去；元件內部 status-aware 已支援 `pending_approval` → 顯示「覆核」按鈕。

## 7. nav_nodes（雙 brand）

**不動 nav_nodes**：`/parts/count/adjustments` 入口已存在於 sidebar（從 plans 升級時就放好的 placeholder），這次只升級頁面內容、不改路由、不動 nav 表。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 改寫 | `src/app/(workspace)/parts/count/adjustments/page.tsx` |
| 新增 | `src/app/(workspace)/parts/count/adjustments/_components/count-adjustments-board.tsx` |
| 新增 | `src/app/(workspace)/parts/count/adjustments/[id]/page.tsx` |
| append | `src/domain/count.ts` (`getCountAdjustmentsPageData`) |
| 新增 | `scripts/pw-smoke-count-adjustments.mjs` |

⚠️ **不動**：`src/lib/parts/actions/index.ts`（被別人未 commit 工改過）、`exceptions-board.tsx`、`src/domain/adjustments.ts`、`src/domain/count.ts` 既有 fn。

## 9. Verification

1. List load — header / sprint chip / caption 在
2. Filter — 倉庫 / 狀態 / 差異筆數下拉、「查詢」「重置」work
3. DataGrid — column visibility、Excel 匯出、排序
4. 點 ct_no 進 detail → 復用 sessions detail view、status chip 正確
5. `pending_approval` 單顯示「覆核並過帳」按鈕（既有 `ApproveCountButton`）
6. tsc --noEmit 0 errors
7. `grep -rn "@/lib/supabase" "src/app/(workspace)/parts/count/adjustments"` = 0 hit
8. Playwright smoke ≥ 10 steps pass

## 10. 開放問題（已自我拍板）

- [x] **是否新建獨立 domain helper？** → 不，append 到 `src/domain/count.ts`（理由：同一 entity inventory_counts、語意連貫）
- [x] **detail page 用獨立元件 or reuse sessions detail？** → reuse（理由：兄弟頁邏輯一致，DRY，元件內部已 status-aware）
- [x] **filter 預設 variance_only 嗎？** → 是（理由：頁名「差異調整」，無差異的單應該在 sessions 看；保留 toggle 給使用者）
- [x] **狀態 filter 預設？** → 預設「全部」，但 STATUS_OPTIONS 限制 `pending_approval / completed / cancelled`（其餘狀態本來就沒差異或還沒結算）
- [x] **要不要做 stats KPI 卡（待覆核 / 本月過帳）？** → 不做，避免跟 `count-ops` dashboard 重複；保持單一視角
