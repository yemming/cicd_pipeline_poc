# Feature Proposal — /parts/receipt/po-grn 升 Design Pattern

**日期**：2026-05-11
**範圍**：採購入庫（§5.1）list view 升 DataGrid + mutation 遷 domain
**參考範本**：`/parts/purchase/orders`（2026-05-11 同性質 transactional list）

---

## 1. 現況

- `page.tsx` 已用 `getReceiptsPageData` from `@/domain/receipts`（read 已遷）
- `_components/receipts-board.tsx` 164 行手刻 `<table>`，無 row actions、無 column visibility、無 Excel 匯出
- `_components/receive-button.tsx` import `receiveStock` from `@/lib/parts/actions`（尚未遷 domain）
- 「+ 新增入庫」按鈕目前 disabled（Phase 2 開放），保留現狀

## 2. 提案

### A. Mutation 遷進 `src/domain/receipts.ts`

新增 export（從 `src/lib/parts/actions/index.ts` 拷貝 function body，不動原檔）：

- `Result<T>` 型別（沿用 domain 慣例）
- `ReceiveStockInput` 型別
- `receiveStock(input): Promise<Result<{ receipt_id: string; gr_no: string }>>`

邏輯不改：產 GR 號 / insert GR + lines / 產 stock_items / 更新 PO line received_qty / 更新 PO 整單狀態 / revalidatePath 4 條。

⚠️ **不刪 `src/lib/parts/actions/index.ts` 內的 `receiveStock`** — 待後續批次清理。

### B. `receipts-board.tsx` 重寫 — 用 `<DataGrid>`

**columns**（依任務 spec）：
1. `gr_no` — 入庫單號，mono 深藍粗體，`hideable: false`，width 150
2. `vendor_name` — 供應商，width 180
3. `warehouse_name` — 入庫倉，width 140
4. `receipt_date` — 入庫日期，mono，width 110
5. `qty_received_total` — 入庫總數，`align: right`，mono，width 110
6. `amount_total` — 入庫金額，`align: right`，mono，width 140
7. `status` — chip（draft 灰 / posted 綠 / cancelled 紅），`hideable: false`，width 100

**props**：
- `persistKey="parts/receipt/po-grn"`
- `exportFileName="stock-receipts"`
- `disabled={isPending}`
- 不傳 `onImport`（不開放 Excel 匯入）
- 不傳 `rowActions`（transactional 性質、入庫單已過帳；「進入入庫流程」屬 PO 端，這頁是入庫歷史檢視，cell `gr_no` 不做 link — 既有也沒 detail page，保持單純）
- 不開 inline edit

**Toolbar / Filter**：
- Filter bar 維持：狀態 dropdown + 入庫單號搜尋
- 右側按鈕：`[查詢][重置][+ 新增入庫]`，新增按鈕保留 disabled + Phase 2 提示
- 加 `resetFilter()` 跟 orders 一致
- 「共 N 筆採購入庫」放 filter bar 下方
- Banner fixed bottom-right（雖然本頁無 mutation，留著給未來新增入庫用）

### C. `receive-button.tsx` import 切換

```diff
- import { receiveStock } from "@/lib/parts/actions";
+ import { receiveStock } from "@/domain/receipts";
```

其餘邏輯不動。原本就用 inline modal（不是 confirm / prompt / alert），無需改寫。

## 3. 影響範圍

| 檔案 | 動作 |
|------|------|
| `src/domain/receipts.ts` | + `Result<T>` / `ReceiveStockInput` / `receiveStock` |
| `src/app/(workspace)/parts/receipt/po-grn/_components/receipts-board.tsx` | 全重寫（手刻 table → DataGrid） |
| `src/app/(workspace)/parts/receipt/po-grn/_components/receive-button.tsx` | 改 1 行 import |
| `src/lib/parts/actions/index.ts` | **不動**（仍保留 `receiveStock` 原 function） |

## 4. 驗收

- `npx tsc --noEmit` 0 errors
- `npx eslint` on receipt/po-grn + receipts.ts 0 errors
- list 顯示 / filter / 查詢 / 重置 / column chooser / 排序 / Excel 匯出 OK

## 5. 不做

- 不動 PO detail page 內 `receive-button.tsx` 的 modal UX
- 不做「入庫單詳情頁」（list-only，符合 §邊界「純資訊頁」）
- 不刪 `src/lib/parts/actions/index.ts` 內任何 export
