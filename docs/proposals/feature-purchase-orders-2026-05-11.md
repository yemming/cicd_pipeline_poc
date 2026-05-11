# Feature — 商品採購 PO list (§4.4) 升 DataGrid + mutation 遷 domain

- **日期**：2026-05-11
- **範圍**：`src/app/(workspace)/parts/purchase/orders` + `src/domain/orders.ts` + `src/lib/parts/actions/index.ts`
- **狀態**：已落地、tsc / eslint 0 errors

## 範圍

1. **Mutation 遷進 domain**：`createPurchaseOrder` / `approvePurchaseOrder` / `cancelPurchaseOrder` 三支 1:1 從 `src/lib/parts/actions/index.ts` 搬進 `src/domain/orders.ts`，`ActionResult<T>` 統一為 domain 慣例 `Result<T>`。其他 actions（`createItem`、`receiveStock`、`issueForRepair` 等）原封不動。
2. **Actions index 清理**：刪除 3 個 PO function（原 L44-197）+ unused `TAX_RATE` 常數；以 4 行 comment 標示「已遷至 @/domain/orders」。檔案從 2283 行 → 2129 行。
3. **Import 切換**：
   - `_components/new-po-button.tsx` L4：`@/lib/parts/actions` → `@/domain/orders`
   - `_components/po-row-actions.tsx` L4：同上
4. **Board 升 DataGrid**：`_components/orders-board.tsx` 完整重寫，從手刻 `<table>` 改用 `<DataGrid>`；加 confirm modal + banner、重置鈕、row actions。
5. **PoRowActions 微調**：移除 browser `confirm()`/`alert()`（違反 §UX 規範），改新增可選 prop `onApproveAsk` / `onCancelAsk` / `onResult`，由 board 顯 confirm modal + banner。Button class 統一為 design pattern `h-[26px] text-[11.5px]`。

## Domain API 簽名（新增）

```ts
// src/domain/orders.ts
export type Result<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

export type CreatePurchaseOrderInput = {
  vendor_id: string;
  warehouse_id: string;
  purchase_type?: string;
  notes?: string;
  eta_date?: string;
  lines: Array<{ item_id: string; qty_ordered: number; unit_price: number; uom?: string }>;
};

export async function createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<Result<{ id: string; po_no: string }>>;
export async function approvePurchaseOrder(poId: string): Promise<Result<null>>;
export async function cancelPurchaseOrder(poId: string): Promise<Result<null>>;
```

邏輯與舊版本 1:1（PO 編號 `PO{yyyymmdd}-{NNN}` 自動產號 / 5% 稅 / pending → approved / qty_received_total > 0 不可取消）。

## Row action 條件表

| 狀態 (`status`) | 顯示 button |
|---|---|
| `pending` | `審核`（綠）`取消`（紅） |
| `approved` / `partial_received` | `去入庫 →`（深藍，連 `/parts/receipt/po-grn?po={id}`） |
| 其他（`closed` / `cancelled` / `draft` / `submitted`） | `—`（弱化文字） |

`詳細`（白底灰邊）按鈕一律顯示，連到 `/parts/purchase/orders/{id}`。
無 `PO_CREATE` 權限時整個 `<PORowActions>` 不渲染、只顯示「詳細」。

## DataGrid 設定

- `persistKey="parts/purchase/orders"`
- `exportFileName="purchase-orders"`
- 不傳 `onImport`（不開放 master data Excel 匯入）
- Columns：`po_no`（mono, hideable=false）/ `vendor_name` / `warehouse_name` / `purchase_type` / `po_date` / `eta_date` / `amount_total`（align=right）/ `receipt_progress_pct`（align=right）/ `status`（chip, hideable=false）

## Filter（page.tsx → board）

維持原樣只擴 status options（對齊 DB 真實值）：
- `pending` / `approved` / `partial_received` / `closed` / `cancelled`
- 舊版 options 有 `draft`/`submitted`/`partial` 與 DB / row-actions 不一致，本次修正

## 狀態 chip 色票

| status | label | chip |
|---|---|---|
| `pending` / `submitted` | 待審核 / 已送出 | amber `bg-[#FDF3E3] text-[#854F0B]` |
| `approved` | 已核准 | 綠 `bg-[#EAF3DE] text-[#3B6D11]` |
| `partial_received` | 部分到貨 | 藍 `bg-[#EAF4FB] text-[#185FA5]` |
| `closed` / `draft` | 已結案 / 草稿 | 灰 `bg-[#F2F2F2] text-[#6B6A68]` |
| `cancelled` | 已取消 | 紅 `bg-[#FDECEA] text-[#CC0000]` |

## Critical files

- `src/domain/orders.ts`（+170 lines；新增 3 mutation + Result 型別）
- `src/lib/parts/actions/index.ts`（-156 lines；刪 3 function + TAX_RATE）
- `src/app/(workspace)/parts/purchase/orders/_components/orders-board.tsx`（完全重寫）
- `src/app/(workspace)/parts/purchase/orders/_components/po-row-actions.tsx`（去 confirm/alert、加 callback props）
- `src/app/(workspace)/parts/purchase/orders/_components/new-po-button.tsx`（單行 import）

## Verification

- [x] `npx tsc --noEmit` 0 errors
- [x] `npx eslint "src/app/(workspace)/parts/purchase/orders" src/domain/orders.ts src/lib/parts/actions/index.ts` 0 errors
- [x] `grep -rn "createPurchaseOrder\|approvePurchaseOrder\|cancelPurchaseOrder" src` 確認沒有殘留 caller 指向舊路徑
- [x] PO mutations 邏輯與舊版本 1:1（PO 編號、稅率、狀態機、qty_received_total 檢查皆未動）
- [x] 不動 `requisitions` / `returns` / `replenishment` / `flow` 任何檔案
- [x] 未開 worktree、未 commit

## 紀律 check

- ✅ 沒用 `confirm()` / `alert()`
- ✅ 沒動 supabase RPC / DB schema
- ✅ Actions index 的非 PO export（`createItem` / `receiveStock` / `issueForRepair` / count / transfer / consignment / threshold / alert / oldpart / abc / stub）全保留
- ✅ Domain helper `"use server"` directive 保留、無 export 非 async value
