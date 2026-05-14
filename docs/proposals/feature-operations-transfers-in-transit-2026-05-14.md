# 提案：在途調撥單查詢頁（/parts/operations/transfers-in-transit）

> 來源：既有 placeholder（直接 reuse 了 receipt 的 transfer-in-board）
> 日期：2026-05-14
> 階段：架構提案（自動拍板 — Recommended）

## 1. 結構摘要

「在途調撥」是 `parts/operations` 區的調撥營運監看頁 — 把所有 `status ∈ {in_transit, partial}` 的 `stock_transfers` 列出來，
讓營運盯著「出貨了還沒到、或部分到貨還未結案」的單據。本頁屬 SOP §邊界「純查詢頁」分支：
list 升級到 `<DataGrid>` + filter + pagination + 列尾「檢視」link 跳到既有 `parts/receipt/transfer-in/[id]` detail。
**不重寫既有 server actions、不動 schema、不動會計流**。收貨動作仍走 receipt 子頁。

目前狀態：page.tsx 直接 reuse `parts/receipt/transfer-in` 的 board，沒有自己的 filter / pagination / 在途特性的 caption，需要拆成獨立 board。

## 2. Schema 草案

不動 schema — 已有 `stock_transfers` / `stock_transfer_lines`、`status` 已包含 `in_transit / partial / received / closed / cancelled`。

## 3. Domain Helper 規劃

`src/domain/transfers.ts` 已存在 `listTransfers(filter)`，**需升級**：

- 加 `date_from?` / `date_to?` filter（依 `ship_date` `gte` / `lte`）
- 加 pagination：`options.page` / `options.pageSize` + 回傳 `{ rows, totalCount }`
- 沿用 `listReceipts` 的「不破壞性升級」pattern：原 `listTransfers()` 回 array 保留給既有 caller，新增 `listTransfersPaged()` 回新 shape

簽名：
```ts
export async function listTransfersPaged(
  filter: { status_in?; status?; q?; source_warehouse_id?; target_warehouse_id?; date_from?; date_to? } = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: TransferListRow[]; totalCount: number }>
```

加 constants 檔：`src/domain/transfers.constants.ts`（`TRANSFERS_PAGE_SIZE_DEFAULT = 50`），避免在 `"use server"` 檔案 export non-async value。

## 4. 副作用清單

無 — 純查詢頁。列尾「檢視」link 跳既有 detail；不在本頁觸發 receiveTransfer / cancelTransfer。

## 5. 會計事件分析

無 — 純資料維護 / 純查詢，不產生資金流。
（收貨 / 取消 / 作廢 在 transfer-in / transfer-out 子頁觸發，跟本頁無關。）

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 在途調撥查詢 | `/parts/operations/transfers-in-transit` | List View（純查詢） | `parts/operations/receipts-history` |

無 detail page — 列尾「檢視」直接 link 到 `parts/receipt/transfer-in/[id]`。

## 7. nav_nodes

已存在（雙 brand）— `ducati: 01e11d42-…` / `indian: ed7aae5d-…`、page_kind 都已是 `react_route`、href `/parts/operations/transfers-in-transit`、is_active=true。**不動。**

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/transfers.constants.ts`（page size 常數） |
| 改 | `src/domain/transfers.ts`（加 `listTransfersPaged` + date filter） |
| 改 | `src/app/(workspace)/parts/operations/transfers-in-transit/page.tsx`（讀 searchParams、傳 board props） |
| 新增 | `src/app/(workspace)/parts/operations/transfers-in-transit/_components/transfers-in-transit-board.tsx`（獨立 board）|

## 9. Verification

1. tsc / eslint 0 errors
2. grep `@/lib/supabase` in workspace touched-paths = 0 hit
3. 兩種 status filter（in_transit / partial / 全部在途）切換
4. 日期區間 filter
5. 列尾「檢視」跳對應 detail page
6. 分頁（若 > 50 row）
7. Excel 匯出 / 欄位選擇器（DataGrid 內建）

## 10. 開放問題（自動拍板 — Recommended）

- [x] 預設 filter：`status_in=['in_transit', 'partial']`、允許 user 在 select 切到「全部（含 received / closed / cancelled）」（**Recommended**）
- [x] Pagination：預設 50/頁、URL `?page=N`（**Recommended**）
- [x] Date filter：用 `ship_date`（出貨日，符合「在途」心智），不是 created_at（**Recommended**）
- [x] Detail link：`/parts/receipt/transfer-in/${id}`（reuse 既有頁面）（**Recommended**）
- [x] 不在 list 列尾放「確認收貨」按鈕，引導去 detail page 操作（避免 list 上 receive 後資料消失誤導）（**Recommended**）
- [x] 不重寫既有 server actions、不動 schema、不動會計流（**Recommended**）
