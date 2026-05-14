# 提案：入庫歷史紀錄查詢頁（/parts/operations/receipts-history）

> 來源：既有 placeholder + 手刻 `<table>` 版 board
> 日期：2026-05-14
> 階段：架構提案（自動拍板 — Recommended）

## 1. 結構摘要

把採購入庫 / 調撥入庫 / 內售入庫 / 領料退入 / 保固入庫五種 receipt 整合在一頁查詢，
是 `parts/operations` 區的「歷史紀錄」聚合視圖。本頁**無 CRUD**，只做篩選、檢視、跳到對應 detail。
屬 SOP §邊界「純資訊頁」分支：list 升級到 `<DataGrid>` + 唯讀 detail link，detail 走原本各 type 子頁。

## 2. Schema 草案

不動 schema — 已有 `stock_receipts` / `stock_receipt_lines`，本頁只是 read aggregate。

## 3. Domain Helper 規劃

`src/domain/receipts.ts` 已存在 `listReceipts(filter)`。
**修改點**：
- 加 `date_from?` / `date_to?` filter（依 receipt_date `gte` / `lte`）
- 加 pagination：`page?` / `pageSize?` + 回傳 `{ rows, totalCount }`（為日後上百筆做準備）

簽名升級：
```ts
export async function listReceipts(
  filter: { type?; status?; q?; date_from?; date_to? } = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: StockReceiptListRow[]; totalCount: number }>
```

⚠️ 既有 caller（po-grn page 等）會壞 → 改成不破壞性升級：
- 新函式 `listReceiptsPaged()` 回新 shape
- `listReceipts()` 保留舊 shape（陣列），內部 call paged 取 rows

## 4. 副作用清單

無 — 純查詢頁。

## 5. 會計事件分析

無 — 純資料維護 / 純查詢，不產生資金流。
（各 receipt 子頁建立 / 退貨 / 結款時自動跑會計事件，跟本頁無關。）

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 入庫查詢 | `/parts/operations/receipts-history` | List View（純查詢） | `parts/setup/items/_components/items-board.tsx` |

無 detail page — 列尾「檢視」直接 link 到對應 type 的子頁 detail。

## 7. nav_nodes

需要查 nav_nodes 確認此 href 是否已存在，若無補雙 brand。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 改 | `src/domain/receipts.ts`（升級 `listReceipts`，補 date filter + pagination） |
| 改 | `src/app/(workspace)/parts/operations/receipts-history/page.tsx`（新 searchParams） |
| 改 | `src/app/(workspace)/parts/operations/receipts-history/_components/receipts-history-board.tsx`（換 DataGrid） |

## 9. Verification

1. tsc / eslint 0 errors
2. grep `@/lib/supabase` in workspace = 0 hit
3. 五種 type filter 各跑一次
4. 日期區間 filter
5. 列尾「檢視」跳對應 detail
6. 分頁切換（如有 >50 row）
7. Excel 匯出 / 欄位選擇器（DataGrid 內建）

## 10. 開放問題（自動拍板）

- [x] Detail link 對應：purchase→po-grn、transfer→transfer-in、internal_sale→internal-sale、material_return/warranty→return-in（**Recommended**）
- [x] Pagination：預設 50/頁、URL `?page=N`（**Recommended**）
- [x] Date filter：用 receipt_date（不是 created_at），符合用戶心智（**Recommended**）
- [x] 不重寫既有 server actions、不動 schema、不動會計流（**Recommended**）
