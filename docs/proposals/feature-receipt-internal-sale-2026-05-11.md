# 內售入庫 (§5.2) — Design Pattern 升級提案

> 2026-05-11 ・ 範圍：`/parts/receipt/internal-sale` 單頁 ・ Readonly summary list

## 1. 現況問題

`src/app/(workspace)/parts/receipt/internal-sale/page.tsx` (151 行) 違反 §資料存取架構：

- ❌ page server component 直接 `import { createClient } from "@/lib/supabase/server"` 撈 `parts_internal_sale_receipts`
- ❌ 手刻 `<table>` 而非 `<DataGrid>` — 無 column visibility / 排序 / Excel 匯出
- ❌ UI token 漂移：H1 `text-[20px]`、chip 深藍底、卡片邊框 `#E1E1E1`、副標 `#6B6B6B`，未跟 §List View 規格對齊

## 2. 架構提案

照 §資料存取架構 + §List View 規格三件套：

```
page.tsx (server, RBAC 守門)
   │ import getInternalSaleReceiptsPageData()
   ▼
src/domain/internal-sale-receipts.ts (server, supabase 直連)
   │
   ▼
parts_internal_sale_receipts  (DB)

page.tsx
   │ render
   ▼
_components/internal-sale-board.tsx (client)
   │ - header (H1 16px + 藍 chip 5.2 + caption)
   │ - 3 metrics card (入庫單數/總量/總金額)
   │ - <DataGrid> readonly
```

純 readonly summary list，無 CRUD、無 filter、無 modal、無 banner。

## 3. 落地細節

### A. `src/domain/internal-sale-receipts.ts`（新）

- `"use server"`
- `type InternalSaleReceiptRow` — 9 欄位（id, doc_no, source_label, warehouse_label, receipt_date, status, qty_total, amount_total, notes）
- `listInternalSaleReceipts()` — supabase select + `brand_id` scope + `order("sort_order")` + 數字欄位 Number() 正規化
- `getInternalSaleReceiptsPageData()` — `Promise.all` 把 list 跑完，server-side reduce 算 totalQty / totalAmount，回 `{ rows, totalQty, totalAmount }`

### B. `_components/internal-sale-board.tsx`（新）

- `"use client"`
- Header：H1 16px + chip 5.2 (`bg-[#EAF4FB] text-[#185FA5]`) + caption `text-[12px] text-[#9A9890]`
- 3 metrics card：`border-[#EEECE6]` + caption 11px `#9A9890` + 數值區 20px bold (品牌深藍 / 綠 / 翠綠)
- DataGrid：
  - `persistKey="parts/receipt/internal-sale"`
  - `exportFileName="internal-sale-receipts"`
  - columns 8 個：
    - `doc_no` (mono, hideable=false, width 140)
    - `source_label` / `warehouse_label`
    - `receipt_date`
    - `status` (chip: draft 灰 / posted 綠 / void 紅)
    - `qty_total` (align=right, mono)
    - `amount_total` (align=right, mono, `NT$` prefix)
    - `notes`
  - 不傳 `onImport`、不傳 `rowActions` → 純 readonly
  - `emptyMessage="尚無內售入庫記錄"`

### C. `page.tsx` 改寫

- 移除 `createClient` / `loadData` / `getActiveScope`
- 保留 `getCurrentUserAndAdmin` + `hasPermission(RECEIPT_VIEW)`
- 呼叫 `getInternalSaleReceiptsPageData()` → 傳 props 給 `<InternalSaleBoard>`
- 保留 `export const dynamic = "force-dynamic"`

### D. Token 對齊

| 項目 | Before | After |
|------|--------|-------|
| H1 | `text-[20px] font-semibold` | `text-[16px] font-semibold text-[#2C2C2A]` |
| Sprint chip | `rounded bg-[#1A3A5C] text-white` | `rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium` |
| Caption | `text-[12.5px] text-[#6B6B6B]` | `text-[12px] text-[#9A9890]` |
| Metric card border | `border-[#E1E1E1] rounded-md` | `border-[#EEECE6] rounded-lg` |
| Main padding | `px-6 py-6 space-y-4` | `px-6 py-5 space-y-3` |
| Status chip 字級 | `text-[11px]` | `text-[11px] rounded-md whitespace-nowrap` |

## 4. 紀律

- 不動 DB schema、不動其他 receipt 模組、不開 worktree、不 commit
- UI/page 不再直 import `@/lib/supabase/*`
- Readonly — 沒 server action、沒新建 PERMISSIONS
