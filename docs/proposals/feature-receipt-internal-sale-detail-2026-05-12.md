# Feature Proposal — /parts/receipt/internal-sale Detail Page

**日期**：2026-05-12
**範圍**：補做內售入庫 detail page（純 readonly），完成 list + page view 雙交付
**範本**：`parts/receipt/po-grn/[id]` 同模板、退化成 readonly（無 edit / 無作廢）
**前置脈絡**：2026-05-11 完成 list 升 DataGrid + 遷 domain，這次補 detail。

---

## 1. 結構摘要

`parts_internal_sale_receipts` 是個外部資料的鏡像 summary table：

- **沒有 lines 子表**（不像 stock_receipts / stock_transfers 有 line items）
- 沒有 receive workflow / 沒有庫存 side effect
- 純粹是把 NetSuite / 別系統的內售紀錄同步進來給 dashboard 看
- 雙 brand 各 3 筆 seed、metadata 都是 {}

依 CLAUDE.md skill §邊界規定：「純資訊頁可以只做 list + readonly KV grid detail」— 這頁正好符合。

**Detail page 只做 view、沒有 edit / 沒有作廢 / 沒有 tabs**（沒 lines 可看）。

## 2. Schema 草案

**不動 DB**。沿用 `parts_internal_sale_receipts`、不 ALTER、不新增欄位。

## 3. Domain Helper

`src/domain/internal-sale-receipts.ts` append：

```ts
export type InternalSaleReceiptDetail = InternalSaleReceiptRow;

export async function getInternalSaleReceiptById(
  id: string,
): Promise<InternalSaleReceiptDetail | null>;
```

簡單 select + brand scope。

## 4. 副作用

無。view-only detail page，連 `revalidatePath` 都不需要。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| Detail | `/parts/receipt/internal-sale/[id]` | Readonly Page View | `parts/receipt/po-grn/[id]` 簡化版 |

**Layout（3 段）**：

1. **Breadcrumb + pill bar**
   - 麵包屑：內售入庫 › `{doc_no}`
   - Pill：[返回列表] 一顆（白底灰邊）
2. **Title Card**
   - 左：caption「內售入庫單」+ H1 doc_no + chip 列（狀態 / 來源 / 倉別 / 入庫日期）
   - 右：260×120 金額卡片（NT$ XX,XXX + 共 N 件）
3. **▼ 基本資訊**（KV grid 3 欄）
   - 單號 / 狀態 / 入庫日期
   - 來源 / 入庫倉
   - 入庫總量 / 入庫金額
   - 備註（跨 3 欄）

**不做**：CRUD pill（修改/作廢/新增）、tabs（沒 lines）、modal、banner。

## 6. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/app/(workspace)/parts/receipt/internal-sale/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/receipt/internal-sale/[id]/_components/internal-sale-detail-view.tsx` |
| 修改 | `src/domain/internal-sale-receipts.ts` — append `getInternalSaleReceiptById` |
| 修改 | `src/app/(workspace)/parts/receipt/internal-sale/_components/internal-sale-board.tsx` — `doc_no` cell 加 Link |

## 7. Verification

1. tsc 0 errors / eslint 0 errors
2. List 點 doc_no → detail page、KV 完整、Title card 顯示金額
3. Playwright 跑通 list → detail

## 8. 內定決策

- Readonly only — 沒 edit / 沒作廢 / 沒 tabs
- 不 ALTER DB
- List `doc_no` cell 加 Link 跳 detail
