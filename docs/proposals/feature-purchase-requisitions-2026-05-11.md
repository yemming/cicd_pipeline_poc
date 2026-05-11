# 採購需求處理（§4.3）design pattern 升級

**日期**：2026-05-11
**目標頁面**：`/parts/purchase/requisitions`
**範本**：`(workspace)/parts/setup/dictionaries/_components/dictionaries-board.tsx`（同輪剛升好的 DataGrid 範本）

---

## 範圍

| 子任務 | 動作 |
|---|---|
| A. Domain helper 遷移 | 把 `src/lib/parts/actions/requisition-actions.ts` 全部 export 搬進 `src/domain/requisitions.ts`，命名去掉 `Action` 字尾；邏輯一字不改、`"use server"` 維持。 |
| B. Board 升 DataGrid | 重寫 `_components/requisitions-board.tsx`：移除手刻 `<table>` 改用 `<DataGrid>`，加 column visibility / 排序 / Excel 匯出（內建）。filter bar + toolbar 樣式照規格。 |
| C. Row workflow actions | 在 DataGrid 的 `rowActions` 依 `status + canEdit(PR_APPROVE)` 條件顯示「核准」「拒絕」「轉採購單」。拒絕走 custom Modal 確認、不用 `confirm()`。 |
| D. detail-view + new page import 切換 | `requisition-detail-view.tsx` 把 import path 從 `@/lib/parts/actions/requisition-actions` 改成 `@/domain/requisitions`，函式名去掉 `Action`；同時把 `confirm()` 三處改為 custom Modal（CLAUDE.md 規範）。 |
| E. 刪檔 | 移除 `src/lib/parts/actions/requisition-actions.ts`。`src/lib/parts/actions/index.ts` 沒 re-export 過此檔，不需修改。 |

不動：replenishment、`/parts/purchase/flow`、DB schema、RPC。

---

## Domain helper API（`src/domain/requisitions.ts`）

新增：

```ts
export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
// 舊 ActionResult 改名為 Result，內容相同

export type RequisitionInput = {
  org_id: string | null;
  required_date: string | null;
  notes: string | null;
  item_id: string | null;
  qty_required: number;
  uom: string | null;
  expected_date: string | null;
};

export type RequisitionStatus = "draft" | "submitted" | "approved" | "converted" | "cancelled";

export async function createRequisition(input: RequisitionInput): Promise<Result<{ id: string; req_no: string }>>;
export async function updateRequisition(id: string, input: RequisitionInput): Promise<Result<{ id: string }>>;
export async function approveRequisition(id: string): Promise<Result<null>>;
export async function rejectRequisition(id: string): Promise<Result<null>>;
export async function convertRequisition(id: string): Promise<Result<null>>;
export async function deleteRequisition(id: string): Promise<Result<null>>;
```

既有 `listRequisitions` / `getRequisitionsPageData` 不動。

**決策：拒絕原因**
舊 `rejectRequisitionAction(id)` 沒收原因參數、DB 也沒 `rejection_reason` 欄位 — 維持簡單，custom Modal 只做「確認拒絕？」二擇一、不問原因。日後要記理由再擴 `notes` 或 metadata jsonb。

---

## Row action 條件表（list 頁）

| Status | 顯示按鈕（左→右） |
|---|---|
| `draft` | 詳細 |
| `submitted` | 詳細 / 核准 / 拒絕（後兩個需 `canEdit`） |
| `approved` | 詳細 / 轉採購單（需 `canEdit`） |
| `converted` | 詳細 |
| `cancelled` | 詳細 |

按鈕配色：
- 詳細：白底灰邊
- 核准：`bg-[#0F6E56] text-white`（綠）
- 拒絕：`bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000]`（紅）
- 轉採購單：`bg-[#1A3A5C] text-white`（深藍）

全部 `h-[26px] px-2.5 rounded text-[11.5px]`。

---

## DataGrid columns

| id | header | width | 排序 | hideable | 備註 |
|---|---|---|---|---|---|
| `req_no` | 需求單號 | 140 | ✓ | ✗ | mono 深藍粗體 |
| `store_name` | 提出門店 | 160 | ✓ | ✓ | |
| `item` | 料號 / 品名 | 240 | ✓ | ✓ | 雙行顯示：name + mono code，多筆顯示 `+N` |
| `qty` | 需求數量 | 100 | ✓ | ✓ | align=right, mono |
| `required_date` | 需求日期 | 120 | ✓ | ✓ | |
| `status` | 狀態 | 110 | ✓ | ✗ | chip 套 STATUS_LABEL |
| `notes` | 備註 | — | ✓ | ✓ | |

`persistKey="parts/purchase/requisitions"`、`exportFileName="requisitions"`、無 `onImport`、無 inline edit（workflow 性質）。

---

## Critical files

**新建/重寫**：
- `src/domain/requisitions.ts`（加 6 個 mutation function + 型別）
- `src/app/(workspace)/parts/purchase/requisitions/_components/requisitions-board.tsx`（全重寫）

**改 import path**：
- `src/app/(workspace)/parts/purchase/requisitions/[id]/_components/requisition-detail-view.tsx`

**刪除**：
- `src/lib/parts/actions/requisition-actions.ts`

**不動**：
- `src/lib/parts/actions/index.ts`（沒 re-export 過 requisition）
- `src/app/(workspace)/parts/purchase/requisitions/page.tsx`（純 server，已用 domain）
- `src/app/(workspace)/parts/purchase/requisitions/[id]/page.tsx`、`new/page.tsx`（沒 import 舊 actions）

---

## Verification checklist

- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `npx eslint "src/app/(workspace)/parts/purchase/requisitions" src/domain/requisitions.ts` → 0 errors
- [ ] `grep -r "requisition-actions" src/` → 0 hits
- [ ] List 頁 column visibility 偏好可存（localStorage key `data-grid:v1:parts/purchase/requisitions`）
- [ ] 各 status 顯示對應 row actions（spot check `submitted` 顯示核准/拒絕）
- [ ] 拒絕 Modal 走 custom UI、非 browser `confirm()`
- [ ] Detail page approve / reject / convert / delete 仍可運作（custom Modal 取代 `confirm()`）
