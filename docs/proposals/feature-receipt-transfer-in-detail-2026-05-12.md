# Feature Proposal — /parts/receipt/transfer-in Detail Page

**日期**：2026-05-12
**範圍**：補做調撥入庫 `[id]/page.tsx` detail page（view / edit 兩 mode），完成 list + page view 雙交付
**範本**：`parts/receipt/po-grn/[id]/_components/receipt-detail-view.tsx`（2026-05-12 剛建）
**前置脈絡**：2026-05-11 完成 list 升 DataGrid，舊 spec §6 明定「不做 detail page」，現補做。

---

## 1. 結構摘要

調撥入庫單（TR）是「跨倉的庫存轉移」transactional entity：

- list 顯示三種狀態：`in_transit` / `partial` / `received`
- detail page 主要看 view（基本資訊 + 來源/目標倉 + 出貨/收貨人員 + 明細）
- edit mode 改不影響庫存帳的欄位（notes / reason / 預計到貨日 / 物流資訊）
- 作廢只支援 `received` 狀態（in_transit 的「取消」屬 transfer-out 端 workflow、不在這做）

跟 po-grn 一致的設計準則：CRUD pill `[返回列表][＋ 新增調撥][修改][作廢]`，view-only 為主、edit 限定欄位、作廢守門。

## 2. Schema 草案

### ALTER stock_transfers

```sql
ALTER TABLE stock_transfers ADD COLUMN voided_at timestamptz;
ALTER TABLE stock_transfers ADD COLUMN voided_by uuid REFERENCES auth.users(id);
ALTER TABLE stock_transfers ADD COLUMN void_reason text;
```

跟 po-grn 一致命名、未來報表 join 邏輯統一。

## 3. Domain Helper

`src/domain/transfers.ts` append：

```ts
export type StockTransferDetailLine = {
  id, line_no, item_id, item_code, item_name,
  qty_requested, qty_shipped, qty_received,
  uom, unit_cost,
  source_bin_id, source_bin_label,
  target_bin_id, target_bin_label,
  notes,
};

export type StockTransferDetail = StockTransferRow & {
  source_warehouse_name, target_warehouse_name,
  shipped_by_name, received_by_name, voided_by_name,
  lines: StockTransferDetailLine[],
};

export async function getTransferById(id): Promise<StockTransferDetail | null>;

export type UpdateTransferInput = {
  notes?, reason?, expected_arrival_date?,
  logistics_provider?, logistics_tracking_no?,
  line_notes?: Array<{ id; notes }>,
};
export async function updateTransfer(id, patch): Promise<Result<{ id }>>;

export async function voidTransfer(id, reason): Promise<Result<{ id }>>;
```

## 4. 副作用清單

| 動作 | 副作用 |
|---|---|
| `updateTransfer` | 只動 stock_transfers row（+ lines.notes），不寫 audit、不 revalidate 其他模組 |
| `voidTransfer` | 1. 守門：stock_items（target wh，source_transfer_line_id IN lines）都 available — 任一被消耗 → 阻擋；2. DELETE 那批 stock_items；3. DELETE 對應的 stock_receipts 派生 row（type='transfer', source_doc_id=tr.id）；4. UPDATE stock_transfers SET status='cancelled' + voided_*; 5. UPDATE stock_transfer_lines SET qty_received=0; 6. revalidatePath 4 條 |

## 5. 頁面骨架

| 頁面 | 路徑 | 範本 |
|---|---|---|
| Transfer Detail | `/parts/receipt/transfer-in/[id]` | `parts/receipt/po-grn/[id]/_components/receipt-detail-view.tsx` |

**layout（跟 po-grn 對齊、加 transfer 特有 KV）**：

1. Breadcrumb + CRUD pill bar — `[返回][＋ 新增調撥][修改][作廢]`
2. Title Card — 左 TR 號 + 狀態 chip + 來源倉→目標倉 chip + 出貨日；右總金額卡片
3. ▼ 基本資訊（KV grid 3 欄）
   - TR 號 / 狀態 / 出貨日 / 預計到貨 / 實際到貨
   - 來源倉 / 目標倉 / 調撥原因
   - 物流商 / 物流單號
   - 出貨時間 / 出貨人員 / 收貨時間 / 收貨人員
   - 備註（跨 3 欄、edit 為 textarea）
4. Tabs：明細行 / 異動紀錄（placeholder）
5. 明細表格欄位：行號 / 品項代碼 / 品項名稱 / 來源倉位 / 目標倉位 / 申請 / 出貨 / 收貨 / 單位 / 單價 / 金額 / 備註

## 6. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/app/(workspace)/parts/receipt/transfer-in/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/receipt/transfer-in/[id]/_components/transfer-detail-view.tsx` |
| 修改 | `src/domain/transfers.ts` — append `getTransferById` / `updateTransfer` / `voidTransfer` + 型別 |
| 修改 | `src/app/(workspace)/parts/receipt/transfer-in/_components/transfer-in-board.tsx` — tr_no cell 改 Link |
| ALTER | `stock_transfers` 加三欄 |

## 7. Verification

1. tsc 0 errors / eslint 0 errors
2. List 點 tr_no → detail page、KV 顯示
3. Edit notes/reason/物流欄位 → 存 → banner 綠 + 落地
4. 作廢 status='received' 單 → 守門 OK → stock_items 沖回、stock_transfers 標 cancelled、派生 stock_receipts row 刪除
5. 作廢已消耗庫存的單 → 阻擋

## 8. 內定決策（跟 po-grn 一致，若要改請說）

- 作廢：做完整作廢（typed 三欄）
- Edit 範圍：notes + reason + 預計到貨 + 物流商 + 物流單號 + line.notes
- List cell：tr_no 加 Link
- 作廢守門：stock_items 必須全 available
- in_transit 狀態的「取消」不在本頁做（屬 transfer-out workflow）
