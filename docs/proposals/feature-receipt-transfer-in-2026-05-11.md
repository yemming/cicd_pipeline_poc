# Feature Proposal — 調撥入庫 design pattern 升級

**Slug**: `parts/receipt/transfer-in`
**Sprint**: 5.2
**Date**: 2026-05-11
**範本來源**: `parts/purchase/orders`（2026-05-11 升好的同性質 transactional list）

---

## 1. 現況

`/parts/receipt/transfer-in` 是「來自其他倉的調撥單入庫」入口：

- `page.tsx` 已遷至 `@/domain/transfers`（`getTransferInPageData`）✅
- `_components/transfer-in-board.tsx`（95 行）**手刻 `<table>`**，沒有 DataGrid 統一介面：
  - 無 column visibility、無排序、無 Excel 匯出
  - 無 rowActions 欄（「確認收貨」目前根本沒接上 UI）
  - 字級、chip token 已對齊規格
- `_components/receive-transfer-button.tsx`：
  - import `receiveTransferAction` from `@/lib/parts/actions`（舊路徑）
  - 用 `confirm()` 原生對話框，違反 §UX 互動規範
  - 目前未被 board 使用（孤兒元件）
- mutation `receiveTransferAction` 寫在 `src/lib/parts/actions/index.ts` L726-842（仍是舊單檔大檔）

## 2. 目標

把 list 升 DataGrid + mutation 拷進 domain + confirm 換 Modal，與 orders / purchase 系列對齊。

## 3. 變更範圍（三件）

### A. `src/domain/transfers.ts` — 加 `receiveTransfer` mutation

從 `src/lib/parts/actions/index.ts` L726-842 拷貝完整實作（邏輯一字不動）：

- 函式名：`receiveTransferAction` → `receiveTransfer`
- 回傳型別：`ActionResult<...>` → domain 內定義的 `Result<T>`（沿用 `orders.ts` 同名 type）
- `"use server"` directive 保留（檔案頂已有）
- `revalidatePath` 全部保留
- 不加 `requirePermission`（page level 已用 `RECEIPT_VIEW` 守、orders.ts mutations 也沒加 — 跟範本一致）

**⚠️ 舊檔 `src/lib/parts/actions/index.ts` 的 `receiveTransferAction` 不刪**（Ming 之後一次清理）。

### B. `_components/transfer-in-board.tsx` — 全部重寫，改用 `<DataGrid>`

- `persistKey="parts/receipt/transfer-in"`
- columns（8 欄）：
  1. `tr_no` — 調撥單號（mono、`hideable: false`）
  2. `source_warehouse_name` — 來源倉
  3. `target_warehouse_name` — 目標倉
  4. `ship_date` — 出貨日
  5. `expected_arrival_date` — 預計到貨
  6. `qty_shipped_received` — 出貨/到貨（`align: 'right'`、`sortable: false`，是組合字串）
  7. `status` — 狀態 chip（`hideable: false`）
  8. `reason` — 原因
- 不開 filter（現況無 query string、業務量小、status 已先在 query 篩成 in_transit/partial/received）
- 不開 `onImport`
- 不開 inline edit
- rowActions：
  - status ∈ {in_transit, partial} 且 `canEdit` → 顯示 `<ReceiveTransferButton>`
  - 其他狀態（received / closed）→ 不顯示按鈕
- 保留「沒入庫權限」提示
- Toolbar 顯示「共 N 筆在途/到貨調撥」
- Banner state 由 `<ReceiveTransferButton>` 用 `onResult` callback 上拋 board 顯示（fixed bottom-right）

### C. `_components/receive-transfer-button.tsx` — 換 import + 加 Modal

- L5 import: `@/lib/parts/actions` → `@/domain/transfers`、`receiveTransferAction` → `receiveTransfer`
- 移除 `if (!confirm(...))`
- 加 inline confirm Modal（樣式與 `orders-board.tsx` 的 `confirmModal` 一致）
  - 標題：`確認收貨`
  - 訊息：`確認收貨 {tr_no}？在途庫存將翻成可用。`
  - 取消：白底灰邊；確認：success 綠 `#0F6E56`
- 新增 `onResult?: (r: { ok: boolean; msg: string }) => void` prop（讓 board 接 banner）
- 維持 `useTransition`、pending 時 disabled + 文字換「收貨中⋯」

## 4. 不動

- ❌ 不動 `src/lib/parts/actions/index.ts`（含 `receiveTransferAction`）
- ❌ 不動 supabase RPC / schema
- ❌ 不動其他模組（po-grn / internal-sale / orders / requisitions / replenishment / returns）
- ❌ 不開 worktree、不 commit

## 5. 驗證

- `npx tsc --noEmit` 0 errors
- `npx eslint "src/app/(workspace)/parts/receipt/transfer-in" src/domain/transfers.ts` 0 errors
- 視覺對齊 orders-board.tsx
- 不跑 Playwright

## 6. 後續（不在本次）

- Ming 統一清除 `src/lib/parts/actions/index.ts` 內已遷至 domain 的 mutations
