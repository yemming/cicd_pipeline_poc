# Feature Proposal — /parts/receipt/po-grn Detail Page

**日期**：2026-05-12
**範圍**：補做入庫單 `[id]/page.tsx` detail page（view / edit 兩 mode），完成 list + page view 雙交付
**參考範本**：`parts/setup/items/[id]/_components/item-detail-view.tsx`（canonical）
**前置脈絡**：2026-05-11 已完成 list view 升 DataGrid，舊提案 §5 明定「list-only」；現在進入下一階段補 detail page。

---

## 1. 結構摘要

入庫單（GR）是「**過帳型** transactional entity」：建立瞬間就已過帳（domain.ts 寫死 `status='completed'`），會落 `stock_items` 庫存、扣 `purchase_order_lines.qty_received`、推進 `purchase_orders.status`。所以 detail page 跟一般 master-data 不同：

- **view mode 為主**：90% 使用情境就是看一筆已過帳入庫單的內容、來源 PO、明細行
- **edit mode 限定欄位**：過帳後 `qty / unit_cost / line_items` 都不能改，只能改 `notes` 跟 metadata 周邊（不會回流影響庫存與會計）
- **create 不整合在同頁**：reuse 既有 `/new` 路由，從 PO 候選清單入庫 — detail page 不切 create-mode

CRUD pill bar 因此跟範本不同：[返回列表][新增入庫][修改][作廢]，少「啟用/停用」這顆。

## 2. Schema 草案

**不開新表、不加欄位**。沿用 `stock_receipts` + `stock_receipt_lines`。

### 補欄位（最小可選）

提案 ALTER `stock_receipts` 加 3 欄支援「作廢」：

```sql
ALTER TABLE stock_receipts
  ADD COLUMN voided_at  timestamptz,
  ADD COLUMN voided_by  uuid REFERENCES auth.users(id),
  ADD COLUMN void_reason text;
```

替代方案：全塞 `metadata.void = { at, by, reason }`。看階段 3 拍板。

### 欄位分類

| 欄位 | 落腳 | 理由 |
|---|---|---|
| voided_at / voided_by / void_reason | typed | 若做作廢就要常查、會報表用 |
| 內部備註的圖片附件 | jsonb (metadata.attachments) | 變動中、單頁專用 |

## 3. Domain Helper 規劃

檔案：`src/domain/receipts.ts`（既存、append）

```ts
export type StockReceiptDetail = StockReceiptRow & {
  vendor_name: string | null;
  warehouse_name: string | null;
  source_po_no: string | null;       // 來源 PO 編號（join purchase_orders）
  lines: Array<{
    id: string;
    line_no: number;
    item_id: string;
    item_code: string | null;        // join items.code
    item_name: string | null;        // join items.name
    qty_received: number;
    uom: string;
    unit_cost: number;
    line_amount: number;
    bin_id: string | null;
    bin_label: string | null;        // join warehouse_bins.label
    notes: string | null;
  }>;
};

export async function getReceiptById(id: string): Promise<StockReceiptDetail | null>;

export type UpdateReceiptInput = {
  notes?: string | null;
  receipt_date?: string;
  metadata?: Record<string, unknown>;
};

export async function updateReceipt(
  id: string,
  patch: UpdateReceiptInput,
): Promise<Result<{ id: string }>>;

// 作廢：對 status=completed 才能跑，副作用見 §4
export async function voidReceipt(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>>;
```

實作策略：直連 supabase（沿用 domain 慣例）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `updateReceipt` | 只動 stock_receipts row、不寫 audit log、不 revalidate 其他模組 | 確定 |
| `voidReceipt` | 1. UPDATE stock_receipts SET status='cancelled' + voided_*; 2. DELETE stock_items WHERE source_receipt_line_id IN (lines); 3. UPDATE purchase_order_lines SET qty_received -= line.qty; 4. UPDATE purchase_orders SET qty_received_total / receipt_progress_pct / status; 5. revalidatePath('/parts/purchase/orders', '/parts/receipt/po-grn', '/parts/operations/balance') | **[需確認]** |
| `voidReceipt` 守門 | 若任一 stock_item.status != 'available'（已被消耗）→ 阻擋並回錯誤訊息 | **[需確認]** |

⚠️ [需確認] 項目進階段 3。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| Receipt Detail | `/parts/receipt/po-grn/[id]` | Page View（view + edit） | `parts/setup/items/[id]/_components/item-detail-view.tsx` |

**Detail layout（由上到下 5 段）**：

1. **Breadcrumb + CRUD pill bar**
   - 麵包屑：採購入庫 › `{GR-no}` ［編輯模式 amber］（edit 時加）
   - View pill：[返回列表][＋ 新增入庫][修改][作廢]（少「啟用/停用」）
   - Edit pill：[儲存變更（綠）][取消（白）]
   - 作廢按鈕在 `status='cancelled'` 時 disabled
2. **Title Card**
   - 左：caption「採購入庫單」+ H1 GR 編號 + chip 列（狀態 / 來源 PO 號 / 入庫日期）
   - 右：260×120 區改成「總金額卡片」（NT$ XX,XXX，下方小字「共 N 筆 / N 件」）— 入庫單沒有圖片
3. **▼ 基本資訊**（KV grid 3 欄）
   - 入庫單號（mono）/ 狀態 chip / 入庫日期
   - 供應商 / 入庫倉 / 來源 PO（link 到 PO detail）
   - 過帳時間 / 過帳人員 / GL 過帳狀態
   - 備註（單獨一列、跨 3 欄、edit mode 為 textarea）
4. **Tabs**
   - **明細行**（預設選中）— 手刻 `<table>`（不用 DataGrid，因明細通常 ≤ 20 列、不需要 column chooser / Excel 匯出、視覺簡潔）
     - 欄位：行號 / 品項代碼 / 品項名稱 / 入庫倉位 / 入庫數 / 單位 / 單價 / 金額 / 備註
     - 底部一列 total row（合計入庫數、總金額）
   - **異動紀錄**（先放 placeholder「待開發」字樣，metadata.audit 將來補）
5. **Banner**（樂觀更新 toast）

**Create mode**：不在 detail view 做 — 點 [＋ 新增入庫] router.push `/new`（沿用既有從 PO 入庫流程）。

## 6. nav_nodes

**不動**。本頁路由 `/parts/receipt/po-grn` 已存在 nav，detail page 是子路由不需要單獨 nav entry。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/app/(workspace)/parts/receipt/po-grn/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/receipt/po-grn/[id]/_components/receipt-detail-view.tsx` |
| 修改 | `src/domain/receipts.ts` — append `getReceiptById` / `updateReceipt` / `voidReceipt` + 型別 |
| 修改 | `src/app/(workspace)/parts/receipt/po-grn/_components/receipts-board.tsx` — `gr_no` cell 改成 Link 到 `[id]` |
| 可選 ALTER | `stock_receipts` 加 `voided_at / voided_by / void_reason` 三欄（若拍板要做作廢） |

## 8. Verification（落地完手測）

1. `npx tsc --noEmit` 0 errors
2. `npx eslint src/domain/receipts.ts src/app/\(workspace\)/parts/receipt/po-grn` 0 errors
3. List 點任一筆 GR 號 → 進 detail page、KV 顯示正確、tabs 切換正常
4. 進 edit mode → 改備註 → 存 → banner 綠 + 值落地 + 退回 view mode
5. 取消 edit → 表單還原為儲存前值
6. 從 PO detail 點 [入庫] → 走 `/new` → 完成 → list 看見新單 → 點進 detail page 看明細
7. （若做作廢）按 [作廢] → confirm modal 輸入原因 → 送出 → stock_items 該批的 row 都消失、PO line qty_received 回沖、PO status 回到 `partial_received` 或 `approved`
8. （若做作廢）對已消耗庫存的入庫單按 [作廢] → 阻擋 + 錯誤訊息

## 9. 開放問題（階段 3 拍板）

- [ ] **作廢功能要做嗎？** 做 / 不做（先 view-only + edit notes）/ 之後再說
- [ ] **作廢 schema**：typed 三欄 vs 全塞 `metadata.void`
- [ ] **edit mode 可改範圍**：只 notes / notes + receipt_date / notes + receipt_date + 明細備註
- [ ] **List `gr_no` cell 要不要點擊跳 detail page**：建議「要」，否則 detail page 沒入口
