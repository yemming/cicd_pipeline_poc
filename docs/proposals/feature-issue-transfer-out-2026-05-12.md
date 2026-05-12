# Feature Proposal — 調撥出貨 design pattern 升級

**Slug**: `parts/issue/transfer-out`
**Sprint**: 6.2（出庫第二頁、對標已升好的 transfer-in §5.2）
**Date**: 2026-05-12
**範本來源**：
- list view → `parts/issue/repair-pick/_components/repair-pick-board.tsx`（DataGrid + filter + rowActions Modal）
- detail page → `parts/receipt/transfer-in/[id]/_components/transfer-detail-view.tsx`（view / edit / 作廢 已完整）
- new form → `parts/issue/repair-pick/new/_components/new-repair-pick-form.tsx`（兩步驟同頁、FIFO preview 紅警）
- mutation → `src/lib/parts/actions/index.ts` 既有 `createAndShipTransfer`（L348）+ `cancelTransfer`（L545），搬進 `@/domain/transfers`

---

## 1. 現況

`/parts/issue/transfer-out` 是「從本倉開單出貨到其他倉」入口，跟剛升好的 `transfer-in`（調撥入庫）成對：

- `page.tsx` 已走 `@/domain/transfers.listTransfers` ✅，天條 OK
- `_components/transfer-out-board.tsx`（99 行）**手刻 `<table>`**，無 DataGrid / 無 filter / 無 rowActions
- `_components/new-transfer-form.tsx` **存在但沒被掛進 page.tsx** — `+ 新增調撥`按鈕 disabled、tooltip 寫「Phase 2 開放」
- `_components/cancel-transfer-button.tsx` 存在但也沒被 board 引用（孤兒 button）
- 天條違規兩處（皆為 `@/lib/parts/actions` 舊 server action 鏈）：
  - `new-transfer-form.tsx` L5: `import { createAndShipTransfer } from "@/lib/parts/actions"`
  - `cancel-transfer-button.tsx` L5: `import { cancelTransfer } from "@/lib/parts/actions"`
- 沒 detail page

業務目的：倉管選來源倉 → 選目標倉 → 加料件清單 → 預覽 FIFO 配置 → 一鍵「建單並出貨」，產 `tr_no = TR{yyyymmdd}-NNN`、status=`in_transit`、扣源倉 stock_items、目標倉建 `in_transit` stock_items（等對面 transfer-in 收貨翻 available）。

跟 repair-pick / po-grn / transfer-in 設計準則對齊：CRUD pill `[返回列表][＋ 新增調撥][修改][取消調撥]`、view-only 為主、edit 限定欄位（notes / reason / 預計到貨 / 物流 / line.notes）、取消守門（status ∈ draft/in_transit/partial 才能取消；received 就走 transfer-in 端的「作廢」）。

## 2. Schema 草案

**不動 schema**：

- `stock_transfers` 已有 `voided_at / voided_by / void_reason`（transfer-in 那輪加的）
- `stock_transfers` typed core 完全夠用：`tr_no / status / source_warehouse_id / target_warehouse_id / transfer_type / reason / ship_date / expected_arrival_date / actual_arrival_date / qty_*_total / shipped_at / shipped_by / received_at / received_by / logistics_provider / logistics_tracking_no / notes / metadata jsonb`
- `stock_transfer_lines` 也夠

**狀態值對齊**（現有資料一致、不動）：
- `draft` — 預留（目前 createAndShipTransfer 直接跳到 in_transit、未來如果要拆兩步才會用）
- `in_transit` — 已出貨、在途
- `partial` — 部分收貨
- `received` — 全部收貨
- `cancelled` — 已取消
- `closed` — 預留結案狀態（目前未使用）

## 3. Domain Helper 規劃

`src/domain/transfers.ts` append/補：

```ts
// ── 已存在（不動）──
// listTransfers / getTransferInPageData
// receiveTransfer / getTransferById / updateTransfer / voidTransfer

// ── 新增 ──

// list helper：給 transfer-out 用（包 warehouses 下拉、預設不過濾 status）
export async function getTransferOutPageData(filter: {
  status?: string;
  q?: string;
  source_warehouse_id?: string;
} = {}): Promise<{
  rows: TransferListRow[];
  canEdit: boolean;
  warehouses: Array<{ id: string; code: string | null; name: string }>;
}>;
//  ─ listTransfers 升級加 status / source_warehouse_id filter（不卡死成 status_in），
//    既有 getTransferInPageData 簽名保留不動（仍走 status_in = [in_transit, partial, received]）

// new form data
export type NewTransferFormData = {
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  items: Array<{ id: string; code: string; name: string; base_uom: string | null }>;
};
export async function getNewTransferFormData(): Promise<NewTransferFormData>;

// preview（FIFO 預覽配置；要不要直接落地交由 UI 二次確認）
export type TransferPreviewLine = {
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string;
  qty_requested: number;
  qty_available: number;
  shortage: number;
  picks: Array<{ stock_id: string; bin_id: string | null; bin_label: string | null; qty: number; unit_cost: number; serial_no: string | null; batch_no: string | null }>;
};
export type TransferPreview = {
  source_warehouse_id: string;
  target_warehouse_id: string;
  lines: TransferPreviewLine[];
  can_post: boolean;
  qty_total: number;
  amount_total: number;
};
export async function previewTransfer(input: {
  source_warehouse_id: string;
  target_warehouse_id: string;
  lines: Array<{ item_id: string; qty_requested: number; source_bin_id?: string | null }>;
}): Promise<Result<TransferPreview>>;

// mutation：建單即出貨（從 src/lib/parts/actions/index.ts L348 createAndShipTransfer 拷貝；
// 不改業務邏輯）
export type CreateTransferInput = {
  source_warehouse_id: string;
  target_warehouse_id: string;
  transfer_type?: string;        // 預設 'inter_store'
  reason?: string;
  notes?: string;
  expected_arrival_date?: string;
  logistics_provider?: string;
  logistics_tracking_no?: string;
  lines: Array<{
    item_id: string;
    qty_requested: number;
    source_bin_id?: string;
    target_bin_id?: string;
    line_notes?: string | null;
  }>;
};
export async function createTransfer(
  input: CreateTransferInput,
): Promise<Result<{ id: string; tr_no: string }>>;
//  ─ 內部分兩步：1) previewTransfer 預檢配置（任一料件不夠就 abort）；
//                2) Insert stock_transfers / stock_transfer_lines / stock_items in_transit + 扣源
//  ─ 套 ISSUE_CREATE / TRANSFER_CREATE 權限（與 listTransfers 一致用 TRANSFER_CREATE）
//  ─ revalidate /parts/issue/transfer-out, /parts/receipt/transfer-in,
//    /parts/operations/transfers-in-transit, /parts/operations/balance

// mutation：取消調撥（從 src/lib/parts/actions/index.ts L545 cancelTransfer 拷貝）
export async function cancelTransfer(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>>;
//  ─ 守門：status ∈ {draft, in_transit, partial} 才能取消；received/closed → 阻擋
//  ─ 邏輯：撈 in_transit stock_items → 翻 available + warehouse_id 改回源倉 + last_movement_at
//  ─ 加 voided_* 三欄：voided_at / voided_by / void_reason（與 transfer-in voidTransfer 對齊）
//  ─ revalidate 4 條 path
```

**Result 型別**：沿用既有 `transfers.ts` 已 export 的 `Result<T>`。

**舊檔不刪**：`src/lib/parts/actions/index.ts` 的 `createAndShipTransfer` / `cancelTransfer` 留著當孤兒（0 callers 確認後可一起清；不在本任務範圍）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `createTransfer` | 1. FIFO 配置源倉 stock_items 2. 任一不夠 → 整批 abort 3. INSERT stock_transfers (status='in_transit'、shipped_at/by) 4. INSERT stock_transfer_lines 5. UPDATE 源 stock_items qty -= 6. INSERT 目標倉 in_transit stock_items（unit_cost/serial/batch 細粒度）7. revalidate 4 path | 確定（拷自既有 action） |
| `createTransfer` | 推 LINE 通知目標倉收貨人「在途調撥已出貨」 | **[需確認]** |
| `cancelTransfer` | 1. 守門 status ∈ {draft, in_transit, partial} 2. 把 in_transit stock_items 翻 available + warehouse_id 改回源倉 3. UPDATE stock_transfers SET status='cancelled' + voided_* 三欄 4. revalidate 4 path | 確定（拷自舊 + 加 voided_*） |
| `updateTransfer` | 既有 helper、不動（限定 notes/reason/物流/line_notes） | — |

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| Transfer-Out List | `/parts/issue/transfer-out` | List View（DataGrid + filter + rowActions） | `parts/issue/repair-pick/_components/repair-pick-board.tsx` |
| Transfer-Out Detail | `/parts/issue/transfer-out/[id]` | Page View（view / edit / 取消調撥） | `parts/receipt/transfer-in/[id]/_components/transfer-detail-view.tsx` |
| Transfer-Out New | `/parts/issue/transfer-out/new` | New form（chooser + FIFO preview + 一鍵出貨） | `parts/issue/repair-pick/new/_components/new-repair-pick-form.tsx` |

### 5.1 List view（重點變更）

- 重寫 `transfer-out-board.tsx` → 用 `<DataGrid>`、`persistKey="parts/issue/transfer-out"`
- columns（8 欄）：
  1. `tr_no` — 調撥單號（mono、`hideable: false`、Link 進 detail）
  2. `source_warehouse_name` — 來源倉
  3. `target_warehouse_name` — 目標倉
  4. `transfer_type` — 類型 chip（inter_store / intra_store / warranty_to_temp / consignment_to_main）
  5. `ship_date` — 出貨日（mono）
  6. `expected_arrival_date` — 預計到貨（mono）
  7. `qty_requested_total` — 申請數（`align: 'right'`、mono）
  8. `status` — 狀態 chip（`hideable: false`）
- filter bar：狀態下拉 + tr_no 搜尋 + 來源倉下拉
- rowActions：
  - status ∈ {draft, in_transit, partial} 且 `canEdit` → `[取消調撥]`（紅）
  - 其他狀態 → 不顯示
- 不開 inline edit
- 不開 onImport
- Toolbar：「共 N 筆、申請總數 X 件、出貨總數 Y 件」
- Banner state 由 rowAction 上拋

### 5.2 Detail view

CRUD pill view mode 5 顆：`[返回列表][＋ 新增調撥][修改][取消調撥]`（取消用紅、不是綠）
edit mode：`[儲存變更（綠）][取消（白）]`

layout（與 transfer-in detail 對齊、KV 多一格 actual_arrival_date）：

1. Breadcrumb：`調撥出庫 › TR20260512-001`（+ 編輯模式 amber badge）
2. Title Card：
   - 左：caption `調撥單` + H1 `TR20260512-001` + chip 列（狀態 + 來源倉→目標倉 + 類型）
   - 右：總申請/出貨/收貨數卡片
3. ▼ 基本資訊（KV grid 3 欄）
   - 調撥單號 / 狀態 / 類型
   - 來源倉 / 目標倉 / 調撥原因
   - 出貨日 / 預計到貨 / 實際到貨
   - 物流商 / 物流單號 / —
   - 出貨時間 / 出貨人員 / —
   - 收貨時間 / 收貨人員 / —
   - 取消時間 / 取消人員 / 取消原因（只在 cancelled 顯示）
   - 備註（跨 3 欄、edit 為 textarea）
4. Tabs：`明細行 / 異動紀錄（placeholder）`
5. 明細表格 10 欄：行號 / 品項代碼 / 品項名稱 / 源倉位 / 目標倉位 / 申請 / 出貨 / 收貨 / 單位 / 單價 / 備註

取消流程：點 `[取消調撥]` → Modal 問 reason（textarea、必填）→ `[確認取消（紅）]` → pending → 成功 → banner 綠 + status 切 cancelled。

**邊界**：transfer-out detail page 的「取消」只走 `cancelTransfer`（status<received 時）；status='received' 後若需作廢，從 transfer-in detail page 走 `voidTransfer`（這個分工已在現有 helper 註解寫死）。detail page 自動依 status 顯示對應按鈕，避免使用者混淆。

### 5.3 New form（與 repair-pick 同形態）

路徑：`/parts/issue/transfer-out/new`

**兩步驟同頁** UX：

**Step A — 填單**：
- 來源倉 + 目標倉 dropdown（同一倉不可選自己；目標倉 filter 出非來源倉）
- 調撥類型 dropdown（4 選一，預設 inter_store）
- 調撥原因 input
- 預計到貨日 date picker（選填）
- 物流商 / 物流單號（選填）
- 備註 textarea（選填）
- 明細表格：每行 `[品項] [申請數] [源倉位 *選填] [備註]` + ＋新增一行
- 右下「預覽配置 →」

**Step B — FIFO 預覽**：
- 表格：previewTransfer 結果，每行顯示 `需求 / 可用 / 缺貨 / FIFO 配置（bin × qty × unit_cost）`
- 缺貨行紅底警示、can_post=false → 一鍵出貨 disabled
- 右下：`[← 返回修改][建單並出貨（綠）]`
- 成功 → `router.push('/parts/issue/transfer-out/<id>')`

CRUD pill：`[返回列表]`（建立模式不顯示其他）

## 6. nav_nodes

**不動**。路徑沒變、`page_kind='react_route'` 已是現狀。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 修改 | `src/domain/transfers.ts` — append 5 個函式 + 4 個型別、`listTransfers` 加 status / source_warehouse_id filter |
| 修改 | `src/app/(workspace)/parts/issue/transfer-out/page.tsx` — 改吃 `getTransferOutPageData` |
| 重寫 | `src/app/(workspace)/parts/issue/transfer-out/_components/transfer-out-board.tsx` — DataGrid 版 |
| 刪除 | `src/app/(workspace)/parts/issue/transfer-out/_components/new-transfer-form.tsx` — 用新版取代 |
| 刪除 | `src/app/(workspace)/parts/issue/transfer-out/_components/cancel-transfer-button.tsx` — 改用 board 內 modal |
| 新增 | `src/app/(workspace)/parts/issue/transfer-out/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/transfer-out/[id]/_components/transfer-out-detail-view.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/transfer-out/new/page.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/transfer-out/new/_components/new-transfer-out-form.tsx` |

**舊檔不刪**：`src/lib/parts/actions/index.ts` 的 `createAndShipTransfer` / `cancelTransfer` 留著當孤兒。

## 8. Verification（落地完手測）

1. `npx tsc --noEmit` 0 errors
2. `npx eslint <touched>` 0 errors
3. `grep -rn "@/lib/supabase" "src/app/(workspace)/parts/issue/transfer-out"` = 0 hit
4. `grep -rn "@/lib/parts/actions" "src/app/(workspace)/parts/issue/transfer-out"` = 0 hit（連舊 action 路徑也不該再 import）
5. List filter：狀態 / tr_no / 來源倉三軸有效
6. 點 tr_no → detail page → KV 正確顯示
7. New page：
   - 選來源/目標倉（相同不可）+ 加 lines → 預覽 → 一鍵出貨 → router.push 到 detail
   - 故意選庫存不夠的 → 紅警 + 按鈕 disabled
8. Detail edit：改 notes / reason / 物流 / line_notes → 存 → banner 綠 + 落地
9. Detail 取消：reason 必填 → 確認 → status='cancelled'、voided_* 三欄寫入、in_transit stock_items 翻 available 並搬回源倉
10. 對面 transfer-in：建單後到 transfer-in 看得到該筆、可點「確認收貨」翻 received

## 9. 開放問題（階段 3 拍板）

A. **建單是否要支援草稿模式（status='draft'，先存不出貨）**？
   - 推薦：**先只做「建單即出貨」單一動作**（與既有 createAndShipTransfer 行為一致），草稿之後再開

B. **createTransfer 副作用：要不要推 LINE 給目標倉收貨人**？
   - 推薦：**不做**（這輪純庫存帳；LINE 通知留下一輪 commit）

C. **List view 預設 filter**？
   - 推薦：**預設「全部」**（與 orders / po-grn 一致、不過濾），讓 user 自己選

D. **detail 的「取消」按鈕守門範圍**？
   - 推薦：**status ∈ {draft, in_transit, partial} 才顯示**；received/closed/cancelled 自動隱藏（與 voidTransfer 互補、避免 UX 混淆）

E. **要不要在 detail 偵測到 status='received' 時、自動加一顆「轉到 transfer-in detail 端作廢 →」link**？
   - 推薦：**先不加**（保持 detail 純粹；用戶從 receive 端進入即可）

## 10. 不動 / 不做

- ❌ 不刪 `src/lib/parts/actions/index.ts` 的 `createAndShipTransfer` / `cancelTransfer`（孤兒留後續清理）
- ❌ 不動 RLS / Supabase RPC
- ❌ 不動其他模組
- ❌ 不寫推 LINE / Notification hub 接點
- ❌ 不改 schema（已具備 voided_* 三欄）
- ❌ 不動 sidebar / nav_nodes
- ❌ 不做草稿模式 / 兩階段（建單 → 出貨拆開）
- ❌ 不開 worktree
