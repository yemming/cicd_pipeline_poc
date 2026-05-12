# Feature Proposal — /parts/receipt/return-in Detail Page + Bug Fix

**日期**：2026-05-12
**範圍**：補 detail page + 升 list DataGrid + 修 type 過濾 bug
**範本**：`parts/receipt/po-grn`（共用 stock_receipts 表）

---

## 1. 結構摘要

「領料退貨入庫」是工單未用完料件退回庫存的紀錄，跟採購入庫 / 調撥入庫**共用 `stock_receipts` 表**、用 `type` 區分：

- 採購入庫：`type='purchase'`
- 調撥入庫：`type='transfer'`
- 領料退貨：`type='ro_return'`（實際 insert 用此值）
- 內售入庫：另一張表 `parts_internal_sale_receipts`

頁面現況：

- ❌ **type 過濾 bug**：`page.tsx` 用 `type: 'material_return'` 過濾、但 `returnIssueLines` 寫入 `type: 'ro_return'`，所以列表永遠 0 筆
- ❌ list 是手刻 `<table>`、未升 DataGrid
- ❌ 沒 detail page
- ✅ domain helper `getReceiptsPageData` 已存在、reuse 同套
- ✅ source_doc_type='stock_issue' / source_doc_id 指向工單發料記錄

## 2. Schema 草案

**不動 DB**。沿用 stock_receipts、不 ALTER。

> stock_receipts 上次已加 `voided_at/by/reason` 三欄（給 po-grn），這頁直接 reuse。

## 3. Bug Fix

**page.tsx 改成過濾 `type='ro_return'`**（跟實際寫入值對齊、影響面最小）：

```ts
const { rows, canEdit } = await getReceiptsPageData({
  type: "ro_return",   // 改前是 'material_return'
  ...
});
```

不改 `returnIssueLines` 那邊的 type 值 — 動到 mutation 風險大（會跟既有資料報表脫鉤）。

## 4. Domain Helper

擴 `getReceiptById` 讓 source label 支援多種 source_doc_type：

```ts
// 既有：source_doc_type='purchase_order' → source_po_no
// 新增：source_doc_type='stock_issue'    → source_gi_no（領料單號）
// 新增：source_doc_type='stock_transfer' → source_tr_no（調撥單號）
```

把 `source_po_no` field 改名通用 `source_label` + `source_doc_label_type`、或加新 fields 並存。**選後者**（不動 po-grn 既有顯示）：

```ts
export type StockReceiptDetail = StockReceiptRow & {
  // 既有
  vendor_name, warehouse_name, source_po_no, posted_by_name, voided_by_name, lines,
  // 新增
  source_gi_no: string | null;     // stock_issue.gi_no（領料退貨用）
  source_tr_no: string | null;     // stock_transfer.tr_no（調撥用、未來如有需要）
};
```

## 5. 頁面骨架

### A. List View 升級

`return-in-board.tsx` 重寫成 DataGrid（跟 po-grn 同模板）：

- columns 7 個：`gr_no`（Link → detail）/ `source_gi_no` / `warehouse_name` / `receipt_date` / `qty_received_total` / `amount_total` / `status` / `notes`
- filter bar：狀態 + 入庫單號（沿用既有兩個）
- 「+ 新增退料入庫」維持 disabled / Phase 2 提示
- `persistKey="parts/receipt/return-in"`

### B. Detail View

`/parts/receipt/return-in/[id]/page.tsx` + `return-in-detail-view.tsx`：

從 po-grn `receipt-detail-view.tsx` 拷貝後改：

- 標題 `採購入庫` → `領料退貨入庫`
- 路由前綴 `/parts/receipt/po-grn` → `/parts/receipt/return-in`
- `來源 PO` KV → `來源領料單`（顯示 source_gi_no、Link 到 issue 詳情頁 — 但 issue 詳情頁不確定存在、先不加 Link 純顯示）
- `供應商` KV 移除（material return 沒供應商）
- 加 `退料工單` KV（從 stock_issue.work_order_id join 出 ro_no — 未來補、本次先顯示 source_gi_no）
- CRUD pill 一致：[返回][＋ 新增退料入庫 disabled][修改][作廢]
- Edit / Void 邏輯 reuse `updateReceipt` / `voidReceipt`（同一個 domain helper、無需新增）

## 6. 副作用

- `voidReceipt` 對 material_return（ro_return）row：
  - 沖回 stock_items（退料進庫的那批）
  - **不會** 改 PO line（source_line_type 不是 po_line）— 既有邏輯已守
  - 不還原工單發料記錄（因為原始發料事實沒變、只是「退進來」事件被撤）
  - 這 OK，業務上「作廢退料入庫」就是把退進來的料當作沒退過

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 修 bug | `src/app/(workspace)/parts/receipt/return-in/page.tsx` — type 改 'ro_return' |
| 改寫 | `src/app/(workspace)/parts/receipt/return-in/_components/return-in-board.tsx` — 升 DataGrid |
| 新增 | `src/app/(workspace)/parts/receipt/return-in/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/receipt/return-in/[id]/_components/return-in-detail-view.tsx` |
| 修改 | `src/domain/receipts.ts` — getReceiptById 加 stock_issue source join、+ source_gi_no field |

## 8. Verification

1. tsc 0 errors / eslint 0 errors
2. List 頁 200（DB 沒 row、empty state）
3. 之後 user 真的跑一次 returnIssueLines 後 list 顯示得到、cell 跳 detail page、各欄位顯示正確

## 9. 內定決策

- Bug fix：page.tsx 改 type 'ro_return'（不動 mutation）
- detail page：拷貝 po-grn 模板、改字眼、reuse domain mutations（update / void）
- domain helper：擴 getReceiptById 加 source_gi_no field（不改 source_po_no 簽名）
- list 升 DataGrid（補做 design pattern 標準）
