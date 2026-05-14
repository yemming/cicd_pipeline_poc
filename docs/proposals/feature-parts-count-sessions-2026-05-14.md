# 提案：盤點作業頁（/parts/count/sessions）

> 來源：既有 placeholder `src/app/(workspace)/parts/count/sessions/page.tsx` + sibling page `/parts/count/plans` 升級規範
> 日期：2026-05-14
> 階段：架構提案（**已由 implementation agent 代為拍板 — Recommended 預設值，使用者已全權授權**）

## 1. 結構摘要

盤點作業頁，相對於兄弟頁「盤點計畫」（規劃週期 / 排程），這頁負責「實際執行中與已完成的盤點 session 觀察、追蹤、覆核」。對應 `inventory_counts`（主檔）+ `inventory_count_lines`（明細）。狀態機完整路徑：`counting → first_done / second_done → pending_approval → completed`，或 `cancelled`。

## 2. Schema 草案

### 新表
無。`inventory_counts` + `inventory_count_lines` 早已存在於 `src/lib/database.types.ts`，已被 `count-ops` / `count/plans` 共讀。

### 現有表變更
無。

### 欄位分類
（既有表，不調整）所有業務欄位已 typed（status, ct_no, total_lines, variance_lines, variance_amount, count_date, count_type, freeze_warehouse, plan_id, warehouse_id…）；`metadata jsonb` 預留給單頁專用 / 不穩定欄位（目前無新增需求）。

## 3. Domain Helper 規劃

檔案：`src/domain/count.ts`（**現存，全部 reuse，不新增 fn**）

```ts
// listing
getCountSessionsPageData(filter: { status?: string }): Promise<{ rows; canEdit }>
listCountSessions(filter): Promise<CountSessionListRow[]>

// detail
getCountSessionById(id: string): Promise<{ ct, lines } | null>
getNewCountSessionFormData(): Promise<{ warehouses }>

// actions（既有，從 src/lib/parts/actions re-export）
startCountSessionAction(input): Promise<ActionResult<{ ct_id; ct_no; total_lines }>>
submitCountSessionAction(input): Promise<ActionResult<...>>
approveCountAdjustmentAction(ctId): Promise<ActionResult<...>>
cancelCountSessionAction(id): Promise<ActionResult<{ id }>>
```

⚠️ **不在這次 task 內動既有 `src/lib/parts/actions/index.ts`**（被別人未 commit 的工改過）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `startCountSessionAction` | 拍當下 stock_items 為 qty_system snapshot、建 inventory_counts 主檔 + lines | ✅ 已實作 |
| `submitCountSessionAction` | 計算每行 variance / variance_amount、`status → pending_approval` | ✅ 已實作 |
| `approveCountAdjustmentAction` | 把 variance 行轉成 `inventory_adjustments` post、修 `stock_items.qty`、`status → completed` | ✅ 已實作（依賴 STOCK_ADJUSTMENT_GAIN/LOSS engine） |
| `cancelCountSessionAction` | 清明細、`status → cancelled` | ✅ 已實作 |

## 5. 會計事件分析

**本功能會產生的會計事件**：1 個（藉由 approveCountAdjustment 鏈傳）

| # | 業務動作 | 對應 transaction_type code | 狀態 | cash_flow_section | 觸發位置 |
|---|---|---|---|---|---|
| 1 | 盤點差異核准 → 過帳 | `STOCK_ADJUSTMENT_GAIN` / `STOCK_ADJUSTMENT_LOSS` | ✅ 已 seed + 已接 engine（commit `37f3c7c`） | operating | `approveCountAdjustmentAction()` 內 → `createAdjustmentAction()` → `instantiateTransaction()` |

本頁本身（List + Detail）**不直接** trigger 會計事件 — 只是觀察 / 引導使用者按「覆核」鈕；按下後既有 server action 接通的 engine 會自己處理分錄。**無新增 transaction_type 需求**。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 盤點作業 list | `/parts/count/sessions` | List View | `parts/count/plans/_components/count-plans-board.tsx` |
| 盤點 session 詳情 | `/parts/count/sessions/[id]` | Page View（含 lines table） | `parts/count/plans/[id]/_components/count-plan-detail-view.tsx` |
| 啟動新盤點 | `/parts/count/sessions/new` | Page View（create mode） | 同上 |

### Detail page 特殊區塊

兄弟頁 plans 是純設定，這頁 detail 多三個業務區塊：

1. **▼ 進度與差異**：counted_lines / total_lines / variance_lines / variance_amount / progress_pct chip
2. **▼ 盤點明細**（Tab）：lines table（item_code · item_name · bin · qty_system · qty_first_count · qty_final · variance · variance_amount · status）
3. **▼ 動作**（依 status 條件顯示）：
   - `counting / first_done / second_done` → 「填實盤數」（沿用既有 `SessionLineEditor` modal）+「取消盤點」
   - `pending_approval` → 「覆核並過帳」（沿用既有 `ApproveCountButton`）
   - `completed / cancelled` → 唯讀

## 7. nav_nodes

`/parts/count/sessions` 已在現有 nav 中存在（placeholder 期就有），**不動 nav_nodes**。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 改寫（升級） | `src/app/(workspace)/parts/count/sessions/page.tsx`（從吐 placeholder 升成 list+filter container） |
| 改寫（升級） | `src/app/(workspace)/parts/count/sessions/_components/count-sessions-board.tsx`（手刻 table → `<DataGrid>`、加 filter bar、加 banner、加 row actions） |
| 新增 | `src/app/(workspace)/parts/count/sessions/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/count/sessions/[id]/_components/count-session-detail-view.tsx` |
| 新增 | `src/app/(workspace)/parts/count/sessions/new/page.tsx` |
| 保留 | `src/app/(workspace)/parts/count/sessions/_components/session-actions.tsx`（`SessionLineEditor` / `ApproveCountButton` reuse 到 detail view） |
| 保留 | `src/app/(workspace)/parts/count/sessions/_components/start-session-form.tsx`（暫不刪，由 create-mode 取代後續若無 caller 再清孤兒） |
| 保留 | `src/domain/count.ts` / `count.constants.ts` |

## 9. Verification

1. List：filter（status + warehouse + q）→ 查詢／重置往返；總筆數正確
2. List：「+ 啟動盤點」按鈕 → push `/parts/count/sessions/new`
3. New page (create-mode)：選倉庫 + 可選 plan + submit → 拍 snapshot 建單、router.push 到 `[id]`
4. Detail page (view mode)：5 顆 CRUD pill（返回 / 新增 / 修改 / 刪除 / 取消盤點）依 status 條件性顯示，stale 狀態無修改 pill
5. Detail page：「填實盤數」modal 寫入 lines、submit 後 status → `pending_approval`、banner ✓ 提示
6. Detail page：`pending_approval` 狀態顯示「覆核並過帳」、按下後 status → `completed`、自動產出 `inventory_adjustments` + `journal_entries`（既有 engine）
7. `npx tsc --noEmit` / `npx eslint <touched>` = 0 errors
8. `grep -rn "@/lib/supabase" "src/app/(workspace)/parts/count/sessions"` = 0 hit
9. Playwright：登入 → /parts/count/sessions → 篩選 → 點任一筆進詳情 → 觀察 lines 表

## 10. 開放問題（已自動拍板 — Recommended）

- [x] **建立 session 的位置**：用 detail page create-mode（`/sessions/new`）統一所有 CRUD 出口；List 的「+ 啟動盤點」改成 router.push 而非 modal — ✅ 採用（一致性 > 一步省）
- [x] **取消盤點按鈕位置**：放 Detail page 的 CRUD pill bar 而非 list row — ✅ 採用（取消是相對嚴重的動作，要看 lines 後再決定）
- [x] **DataGrid 內 row 點擊行為**：點 `ct_no` cell → 進 detail；不額外開「檢視」按鈕 — ✅ 採用（plans 範本一致）
- [x] **lines table 規格**：在 detail page tab 內用 plain `<table>`、不套 `<DataGrid>`（lines 不太需要 column visibility / 排序、固定欄位即可） — ✅ 採用
- [x] **inline edit**：list 不開啟（所有欄位都帶業務語意，避免誤改） — ✅ 採用

## 11. 不動清單

- 不動 `src/lib/parts/actions/index.ts`（未 commit 變更存在）
- 不動 `/parts/operations/count-ops`（別人的工）
- 不刪 `start-session-form.tsx`（保留當歷史；若 list / dashboard 還在用就不孤兒）
- 不動 DB schema、不動 nav_nodes
