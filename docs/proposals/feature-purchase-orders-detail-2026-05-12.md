# Feature Proposal — /parts/purchase/orders Detail Page + New 美化

**日期**：2026-05-12
**範圍**：補 detail page（修 catch-all 攔截 bug）+ new 頁分區段美化
**範本**：`parts/receipt/po-grn/[id]` detail-view + `parts/setup/items/[id]` 多區段 layout

---

## 1. 問題

**Bug 1**：list 上 PO 號 link 跳到 `/parts/purchase/orders/{id}` → 但 detail page 不存在 → `parts/[...slug]` catch-all 接走 → 顯示「庫存管理 - 此頁面尚未對應到任何設計稿」placeholder。

**Bug 2**：`/parts/purchase/orders/new` 視覺陽春，跟其他 design pattern 頁面落差大：
- 沒分區段卡片（基本資料 / 採購明細 / 金額 / 備註 分區）
- 明細表沒有品項代碼 / 單位欄、視覺差
- 沒金額卡片（小計 / 稅 / 總計 突顯不夠）
- 表單 control 太擠

PO 是經銷商門面、Ming 強調要做最完整。

## 2. Schema

**不動 DB**。沿用 `purchase_orders` + `purchase_order_lines`。

> 兩表已存在 `notes` / `metadata` 欄位，edit 限定欄位用既有。

## 3. Domain Helper（`src/domain/orders.ts`）

append：

```ts
export type PurchaseOrderDetailLine = {
  id, line_no, item_id, item_code, item_name, item_uom,
  qty_ordered, qty_received, qty_returned,
  unit_price, tax_rate,
  line_amount_pretax, line_amount_tax, line_amount_total,
  notes,
};

export type PurchaseOrderDetail = PurchaseOrderRow & {
  vendor_name, vendor_code,
  warehouse_name, warehouse_code,
  created_by_name, approved_by_name,
  source_req_no: string | null,        // 來源需求單號（join requisitions）
  lines: PurchaseOrderDetailLine[],
  receipts: Array<{                    // 入庫紀錄
    id, gr_no, receipt_date, qty_received_total, amount_total, status,
  }>,
};

export async function getPurchaseOrderById(id): Promise<PurchaseOrderDetail | null>;

export type UpdatePurchaseOrderInput = {
  notes?, eta_date?, purchase_type?,
  line_notes?: Array<{ id; notes }>,
};
export async function updatePurchaseOrder(id, patch): Promise<Result<{ id }>>;
```

**Edit mode 受限欄位**：notes / eta_date / purchase_type / line notes — 不能改 qty / unit_price（已過稅、會破壞庫存帳）。

不寫新的 voidPurchaseOrder — 既有 `cancelPurchaseOrder` 已涵蓋。

## 4. 副作用

- `updatePurchaseOrder`：只改 header notes/eta/type + lines.notes，不 revalidate 其他模組
- `cancelPurchaseOrder`（既有）：把 PO 改 status='cancelled'、`status='draft'` 才能取消（既有守門）

## 5. Detail Page Layout

| 區段 | 內容 |
|---|---|
| 1. Breadcrumb + CRUD pill | [返回][＋ 新增採購單][審核（draft）][修改][取消（draft）] |
| 2. Title Card | 左 PO 號 + 狀態 chip + 供應商 chip + 收貨倉 chip + 下單日；右金額卡片（含稅 NT$ + 收貨進度條） |
| 3. ▼ 基本資料 | KV grid 3 欄：PO 號 / 狀態 / 採購類型 / 下單日 / 預計到貨 / 收貨進度（pct）/ 供應商 / 收貨倉 / 來源需求單 / 核准時間 / 核准人 / GL 過帳 / 備註（跨 3 欄）|
| 4. ▼ 金額 | KV grid 3 欄：未稅 / 稅 / 含稅 |
| 5. Tabs | (a) 採購明細（line items table、每行進度條）(b) 入庫紀錄（gr_no list、Link 跳 po-grn detail）(c) 異動紀錄（placeholder）|
| 6. Banner | 樂觀更新 toast |

**CRUD pill 狀態邏輯**：

| status | 修改 | 取消 | 審核 |
|---|---|---|---|
| draft | ✓（可改全部 edit 欄位）| ✓ | ✓ |
| approved | ✓（只改 notes/eta）| ✓（部分收貨後守門擋）| — |
| partial_received | ✓（只 notes）| ✗ | — |
| received | ✗ | ✗ | — |
| cancelled | ✗ | ✗ | — |

## 6. New 頁面美化（`new-po-form.tsx` 重做）

跟 detail 視覺對齊。**分區段卡片**：

```
1. Breadcrumb + 建立模式 badge + [取消][建立採購單] pill
2. Title Card（建立中：caption + 未命名 PO + chip 列 — 跟 items create mode 一致）
3. ▼ 基本資料 KV grid 3 欄
   - 供應商 / 採購類型 / 預計到貨
   - 收貨倉 / [來源需求單（從現有 requisitions 選或空）]
4. ▼ 採購明細
   - header row：行號 / 品項 / 單位 / 數量 / 單價 / 金額 / 移除
   - 每行可選品項（dropdown 顯示 code + name）、單位自動帶
   - 「＋ 加一行」按鈕
   - 動態小計列
5. ▼ 金額卡片（吸引視覺的 box）
   - 未稅 / 稅 (5%) / 含稅
   - 大字突顯總金額
6. ▼ 備註（textarea）
7. Banner（樂觀建立反饋）
```

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/app/(workspace)/parts/purchase/orders/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/purchase/orders/[id]/_components/purchase-order-detail-view.tsx` |
| 改寫 | `src/app/(workspace)/parts/purchase/orders/new/_components/new-po-form.tsx` — 分區段 + 美化 |
| 修改 | `src/domain/orders.ts` — append `getPurchaseOrderById` / `updatePurchaseOrder` + 型別 |

## 8. Verification

1. tsc 0 / eslint 0
2. List 點 PO 號 → 進 detail page（不再跑庫存頁）
3. Detail KV / tabs / 金額 / 入庫紀錄子表都顯示
4. Edit mode 改 notes 存 → 落地
5. Approve draft → status='approved'、CRUD pill 切換
6. Cancel approved → status='cancelled'、進度條凍結
7. New 頁面：分區段、金額卡片、明細表完整 — 跟 detail 視覺一致

## 9. 內定決策

- 不動 DB schema
- Detail edit 限定 notes/eta/type/line notes
- Approve / Cancel reuse 既有 server actions
- Receive 不在 detail page、走既有 PO row actions「去入庫」按鈕
- new 美化跟 detail 對齊（分區段、Title card、金額卡片、明細表）
- create mode 不整合到 detail page（PO 有 lines 複雜度高、獨立 /new 比較清楚）
