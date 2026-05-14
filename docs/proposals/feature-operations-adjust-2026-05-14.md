# 提案：/parts/operations/adjust（庫存調整作業）

> 來源：既有半成品頁面 + 與 `/parts/operations/exceptions` 重複
> 日期：2026-05-14
> 階段：架構提案 → 已自動拍板（user 全權授權）

## 1. 結構摘要

`/parts/operations/adjust` 原本是 `ExceptionsBoard` 的 100% 重複入口，加上一支死碼 `adjust-form.tsx`（舊版半成品、無人 import）。本提案把這個 route 重新定位為「**庫存調整作業**」單一語意入口：

- **adjust** = 主動發起的庫存調整（type ∈ {manual, damage}）
- **exceptions** = 全清單（含 manual / damage / count / exception_in / exception_out / other）

兩者共用同一張 `inventory_adjustments` 表 + 同一個 `<DataGrid>` UI，差異只在 filter scope + 標題 + 「新增」跳轉。

## 2. Schema 草案

**不動 schema**。`inventory_adjustments` 既有 typed core (`type`, `status`, `warehouse_id`, `adj_no`, `reason`, `total_amount`) 已涵蓋需求；`metadata jsonb` 由 `createAdjustment` 寫入跨欄位 context（CLAUDE.md typed/jsonb 規範）。

## 3. Domain Helper 規劃

**不動 helper**。`src/domain/adjustments.ts` 既有 `getExceptionsPageData(filter, options)` 已接受 `type` 篩選；adjust page 只是傳更窄的 filter 並在 client 端把 type 下拉限縮為 manual / damage。

如未來「庫存調整作業」要新增獨立的權限或統計，再拆 `getAdjustOpsPageData(filter, options)`。Day 1 reuse。

## 4. 副作用清單

無新副作用。所有寫入（建立 / 作廢）走既有 `createAdjustment` / `voidAdjustment` → 經 `instantiateTransaction('STOCK_ADJUSTMENT_*')` 自動產 GL 分錄（已 wired in 上游 commit `37f3c7c`）。

## 5. 會計事件分析

本頁不直接發起會計事件。寫入會計事件的 entry point 是 `/parts/operations/exceptions/new`（已實作），adjust 頁的「新增」按鈕透過 `?type=manual` query 跳轉到該頁、所有 audit / GL 都從 exceptions 那邊既有路徑流。

涉及的既有 transaction_types：
- `STOCK_ADJUSTMENT_GAIN`（盤盈 / 例外進）
- `STOCK_ADJUSTMENT_LOSS`（盤虧 / 例外出 / damage）

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 庫存調整作業（list）| `/parts/operations/adjust` | List View | reuse `ExceptionsBoard`（擴 props） |
| 新增調整單 | `/parts/operations/exceptions/new?type=manual` | （reuse 既有頁）| - |
| 調整單詳細 | `/parts/operations/exceptions/[id]` | （reuse 既有頁）| - |

⚠️ 為避免複製出 detail / new 雙路由維運成本，detail / new 一律導去 exceptions 子樹，adjust 只保留 list 入口。這是合理的「資訊架構分流」而非 design pattern 違規（CLAUDE.md SOP 容許「純資訊頁可以只做 list 配 readonly KV detail」的邊界）。

## 7. nav_nodes（不動）

`/parts/operations/adjust` 已存在於 nav 既有 fallback（`src/lib/modules.ts` 或 `nav_nodes`），不重新 insert。如後續發現雙 brand `nav_nodes` 缺 entry，用單獨 SQL 補。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 改寫 | `src/app/(workspace)/parts/operations/adjust/page.tsx` |
| 改寫 | `src/app/(workspace)/parts/operations/exceptions/_components/exceptions-board.tsx`（加 optional props：`mode`, `basePath`, `title`, `caption`, `sprint`, `allowedTypes`, `newHref`） |
| 刪除 | `src/app/(workspace)/parts/operations/adjust/_components/adjust-form.tsx`（dead code） |

## 9. Verification

1. `/parts/operations/adjust` load 成功、看到「庫存調整作業」標題（不是「例外出入庫」）
2. type 下拉只列「全部 / 手動調整 / 損耗報廢」
3. 已有的 manual / damage 調整單顯示；exception_in / count 等不出現
4. 點「＋ 新增調整單」跳到 `/parts/operations/exceptions/new?type=manual`、表單預填 type=manual
5. 點列上某行的「詳細」跳到 `/parts/operations/exceptions/[id]`
6. Filter / pagination / column visibility 都 round-trip（URL 帶 `?type=` etc.）
7. `npx tsc --noEmit` + `npx eslint` = 0 errors
8. `grep -rn "@/lib/supabase" "src/app/(workspace)/parts/operations/adjust"` = 0 hit

## 10. 開放問題（已自動拍板）

- ✅ 採「reuse + 擴 props」而非「完全複製 board」（避免 200 行重複）
- ✅ Detail / new 不開獨立路由，導去 exceptions 子樹
- ✅ 死碼 `adjust-form.tsx` 刪除
- ✅ 不改 helper、不改 schema、不改 transaction_types
