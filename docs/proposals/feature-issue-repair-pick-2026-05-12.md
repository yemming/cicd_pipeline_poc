# Feature Proposal — 維修領料（RO 工單一鍵領料）design pattern 升級

**Slug**: `parts/issue/repair-pick`
**Sprint**: 6.1（出庫第一頁、對標入庫 §5.1 po-grn）
**Date**: 2026-05-12
**範本來源**：
- list view → `parts/purchase/orders/_components/orders-board.tsx`（DataGrid + rowActions + Modal confirm）
- detail page → `parts/receipt/po-grn/[id]/_components/receipt-detail-view.tsx`（view / edit 兩 mode + 作廢 banner）
- mutation → `src/lib/parts/actions/index.ts` 既有 `issueForRepair` + `cancelIssue`（搬進 `@/domain/issues`、修兩處 drift）

---

## 1. 現況

`/parts/issue/repair-pick` 是「維修工單派工後從庫存領料」入口，跟剛升好的 `po-grn`（採購入庫）成對：

- `page.tsx` 已走 `@/domain/issues` ✅，沒有天條違規
- list view 透過 `internal-sale/_components/issues-board.tsx` 共用（手刻 `<table>`，無 DataGrid、無 row actions、無 Excel 匯出）
- 「＋ 新增出庫」**按鈕 disabled**、tooltip 寫「Phase 2 開放」— **這頁從來沒有真正的建單流程**
- 沒有 detail page
- 既有 server actions `issueForRepair` + `cancelIssue` 寫在 `src/lib/parts/actions/index.ts`（L66-258），**兩處 drift**：
  - **type drift**：action insert `type='ro_picking'`、list 查詢用 `type='repair_pick'` → 過去就算有人造過單也查不出來
  - **status drift**：action insert `status='completed'`、IssuesBoard 的 `STATUS_LABEL` 只認 `draft / posted / cancelled` → chip 顯示會落到 fallback
- 業務目的：技師憑 RO 工單編號 → 倉管刷單一鍵把工單需料一次性扣帳，產 `gi_no = ISSyyyymmdd-NNN` 並寫 `stock_issue_lines`，FIFO 配置 stock_items

跟 po-grn / transfer-in 的設計準則對齊：CRUD pill `[返回列表][＋ 新增領料][修改][作廢]`、view-only 為主、edit 限定欄位（notes / line.notes）、作廢守門（避免錯領料無法挽回）。

## 2. 目標

把這頁從「空殼 placeholder 入口」變成「可建單、可看 detail、可作廢」的完整 transactional 模組，並補上跟兄弟頁一致的天條紀律 + DataGrid + Modal UX。

## 3. Schema 草案

### ALTER stock_issues — 加作廢三欄（typed，與 po-grn / transfer-in 對齊）

```sql
ALTER TABLE stock_issues ADD COLUMN IF NOT EXISTS voided_at timestamptz;
ALTER TABLE stock_issues ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id);
ALTER TABLE stock_issues ADD COLUMN IF NOT EXISTS void_reason text;
```

跟兄弟頁同欄位名 → 報表 join 路徑統一。`metadata jsonb` 已存在、不動。

### 修舊資料 drift（清乾淨）

```sql
-- 若有 type='ro_picking' 的歷史殘留，改成 'repair_pick'
UPDATE stock_issues SET type='repair_pick' WHERE type='ro_picking';
-- 若有 status='completed'，改成 'posted'
UPDATE stock_issues SET status='posted' WHERE status='completed';
```

（落地時先 SELECT 確認筆數，預期 0，沒有就 skip。）

### 不動

- `stock_issues` typed core 完全夠用：`gi_no / type / status / warehouse_id / customer_id / ro_id / source_doc_type / source_doc_id / issue_date / qty_issued_total / amount_total / posted_at / posted_by / gl_posted` 全部現成
- `stock_issue_lines` typed core 也夠：`gi_id / line_no / item_id / bin_id / qty_issued / uom / unit_cost / unit_price / line_amount / serial_no / batch_no / notes`
- 不開新表
- 不動 RLS（既有 brand-aware policy 已生效）

## 4. Domain Helper 規劃

`src/domain/issues.ts` append（既有 `listIssues` / `getIssuesPageData` 保留不動，但 type 對映 / status 對映在 detail/action 也要校準）：

```ts
// ── Detail ──
export type StockIssueDetailLine = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  bin_id: string | null;
  bin_label: string | null;
  qty_issued: number;
  uom: string;
  unit_cost: number | null;
  unit_price: number | null;
  line_amount: number | null;
  serial_no: string | null;
  batch_no: string | null;
  notes: string | null;
};

export type StockIssueDetail = StockIssueRow & {
  warehouse_name: string | null;
  customer_name: string | null;          // 若 customer_id null 則 null
  ro_no: string | null;                  // ro_id join work_orders.ro_no
  posted_by_name: string | null;
  voided_by_name: string | null;
  lines: StockIssueDetailLine[];
};

export async function getIssueById(id: string): Promise<StockIssueDetail | null>;

// ── New form data（給 new page 的 chooser）──
export type RepairPickFormData = {
  warehouses: Array<{ id: string; name: string; code: string | null }>;
  openWorkOrders: Array<{
    id: string;
    ro_no: string;
    customer_name: string | null;
    vehicle_label: string | null;       // plate + model（從 vehicles join）
    status: string;
    parts_qty_total: number;            // 該 WO kind='parts' 且 item_id NOT NULL 的 qty 加總
    already_picked: boolean;            // 已有 type='repair_pick' status='posted' 的 stock_issues
  }>;
};

export async function getRepairPickFormData(): Promise<RepairPickFormData>;

// ── Preview（讓 UI 在按「一鍵領料」前可看料件夠不夠）──
export type RepairPickPreview = {
  warehouse_id: string;
  work_order_id: string;
  lines: Array<{
    line_no: number;
    item_id: string;
    item_code: string | null;
    item_name: string;
    qty_needed: number;
    qty_available: number;
    shortage: number;                   // qty_needed - sum(picks)
    picks: Array<{ stock_id: string; bin_label: string | null; qty: number; unit_cost: number }>;
  }>;
  can_post: boolean;
  amount_total: number;
};

export async function previewRepairPick(input: {
  work_order_id: string;
  warehouse_id: string;
}): Promise<Result<RepairPickPreview>>;

// ── Mutation ──
export type CreateRepairPickInput = {
  work_order_id: string;
  warehouse_id: string;
  notes?: string;
};

export async function pickForWorkOrder(
  input: CreateRepairPickInput,
): Promise<Result<{ id: string; gi_no: string }>>;
//  ─ 從 src/lib/parts/actions/index.ts `issueForRepair` 拷貝邏輯，**修兩處 drift**：
//    1. type: 'ro_picking' → 'repair_pick'
//    2. status: 'completed' → 'posted'
//    3. posted_at / posted_by 補齊（auth.user）
//    4. 回傳 { id, gi_no } 對齊兄弟 helper 命名

export type UpdateIssueInput = {
  notes?: string;
  line_notes?: Array<{ id: string; notes: string }>;
};
export async function updateIssue(
  id: string,
  patch: UpdateIssueInput,
): Promise<Result<{ id: string }>>;
//  ─ 限定欄位、不動數量/金額/狀態/帳

export async function voidIssue(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>>;
//  ─ 守門：status='posted' 才能作廢；status='cancelled' / 'draft' 阻擋
//  ─ 守門：(暫無)技師簽收欄位先不擋（schema 沒有 confirmed_at 概念 — 跟舊 cancelIssue 一致）
//  ─ 邏輯：拷貝舊 cancelIssue 「建新 available stock_items row 還原」+ UPDATE stock_issues
//    SET status='cancelled', voided_at, voided_by, void_reason
//  ─ revalidatePath: /parts/issue/repair-pick, /parts/issue/repair-pick/[id], /parts/operations/balance
```

**Result 型別**：domain 內定義 `type Result<T> = { ok: true; data: T } | { ok: false; error: string }`，與 orders.ts / transfers.ts 同名同形。

**`"use server"` directive**：`src/domain/issues.ts` 既有檔頂 `"use server"` 保留 — 所有 `export` 都是 async function（無常數 export）。

**舊檔不刪**：`src/lib/parts/actions/index.ts` 的 `issueForRepair` / `cancelIssue` 保留為孤兒（Ming 之後一次清理；目前 0 callers 確認後可一起刪，但不在本任務範圍）。

## 5. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `pickForWorkOrder` | 1. FIFO 配置 stock_items（按 created_at asc）2. 任一料件不夠 → 整批 abort、不部分扣 3. INSERT stock_issues（status='posted'、posted_at=now、posted_by=auth.uid）4. INSERT stock_issue_lines（一個 alloc.picks pick 一行）5. UPDATE stock_items qty -=、qty<=0 翻 status='issued' 6. revalidate 3 條 path | 確定（拷自既有 action） |
| `pickForWorkOrder` | 推 LINE 給 SA / 技師（「料件已備齊，可開工」） | **[需確認]** 拍板 |
| `pickForWorkOrder` | 寫 work_orders 狀態（parts_amount 累加 / 自動翻 'in_progress'） | **[需確認]** 拍板 |
| `voidIssue` | 1. 守門 status='posted' 2. SELECT stock_issue_lines 全部 3. INSERT 新 stock_items rows（available + 註記「{gi_no} 取消還原」）4. UPDATE stock_issues SET status='cancelled' + voided_* 三欄 5. revalidate 3 條 path | 確定（拷自舊 cancelIssue + 加 voided_*） |
| `voidIssue` | 守門：技師「已確認收料」後就不能作廢 | **[需確認]** 拍板（目前無 schema 支持，schema 要加 `confirmed_at` 才能擋；先不做） |
| `updateIssue` | 只動 notes / line.notes，不動數量金額狀態帳 | 確定 |

⚠️ **[需確認]** 項目用 AskUserQuestion 問 Ming。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| Repair-pick List | `/parts/issue/repair-pick` | List View（DataGrid + rowActions） | `parts/purchase/orders/_components/orders-board.tsx` |
| Repair-pick Detail | `/parts/issue/repair-pick/[id]` | Page View（view / edit / 作廢） | `parts/receipt/po-grn/[id]/_components/receipt-detail-view.tsx` |
| Repair-pick New | `/parts/issue/repair-pick/new` | New form（RO chooser → preview → 一鍵領料） | 不抄 — 新形態 chooser，但沿用 CRUD pill / banner / modal token |

### 6.1 List view（重點變更）

- 不再共用 `internal-sale/_components/issues-board.tsx`，**獨立** `repair-pick/_components/repair-pick-board.tsx`
- 用 `<DataGrid>`，`persistKey="parts/issue/repair-pick"`
- columns（8 欄）：
  1. `gi_no` — 領料單號（mono、`hideable: false`、cell 是 `<Link href="...">`）
  2. `ro_no` — RO 工單號（mono、可點跳工單 detail）
  3. `customer_name` — 車主
  4. `warehouse_name` — 出庫倉
  5. `issue_date` — 出庫日（mono、`sortValue` 對日期 string）
  6. `qty_issued_total` — 出庫數（`align: 'right'`、mono）
  7. `amount_total` — 出庫金額（`align: 'right'`、mono、千分位）
  8. `status` — 狀態 chip（`hideable: false`）
- filter bar：狀態下拉 + gi_no 搜尋 + 出庫倉下拉（**新加**，跟 orders 一致）
- rowActions：
  - status='posted' 且 `canEdit` → `[作廢]`（紅）
  - 其他狀態 → 不顯示
- 不開 inline edit（金額類欄位不該手改）
- 不開 onImport（沒場景）
- Toolbar 顯示「共 N 筆領料單 / 顯示 K 筆 / 總金額 NT$ …」
- Banner state 由 rowAction button onResult 上拋 board 顯示

### 6.2 Detail view（CRUD pill 5 顆）

view mode CRUD pill：`[返回列表][＋ 新增領料][修改][作廢]`
edit mode：`[儲存變更（綠）][取消（白）]`

layout（跟 po-grn detail 對齊）：

1. Breadcrumb：`維修領料 › ISS20260512-001`（+ 編輯模式 / 作廢中 amber badge）
2. Title Card：
   - 左：caption `領料單` + H1 `ISS20260512-001` + chip 列（狀態 + RO 連結 + 客戶 + 出庫倉 + 出庫日）
   - 右：總金額卡片（amount_total 千分位 + 出庫總數 qty_issued_total）
3. ▼ 基本資訊（KV grid 3 欄）
   - 領料單號 / 狀態 / 出庫日
   - RO 工單號（Link）/ 車主 / 出庫倉
   - 過帳時間 / 過帳人員 / —
   - 備註（跨 3 欄、edit 為 textarea）
   - 作廢時間 / 作廢人員 / 作廢原因（只在 status='cancelled' 顯示）
4. Tabs：`明細行 / 異動紀錄（placeholder）`
5. 明細表格 9 欄：行號 / 品項代碼 / 品項名稱 / 倉位 / 出庫數 / 單位 / 單價 / 金額 / 備註（edit 模式 notes 可改）

作廢流程：點 `[作廢]` → Modal 問 reason（textarea、必填）→ `[確認作廢（紅）]` → pending 「作廢中⋯」→ 成功 → banner 綠 + status 切 cancelled + voided_* 三欄落地。

### 6.3 New form（不抄、新形態）

路徑：`/parts/issue/repair-pick/new`

兩步驟（單頁 UX）：

**Step A — 選工單 + 選倉**：
- 左卡片：開放工單清單（status ∈ {dispatched, in_progress, qc}、parts_qty_total > 0、not already_picked）
  - 顯示 `ro_no / 車主 / 車型車牌 / 狀態 chip / 料件 N 項共 K 件`
  - 點一張 row → 右側帶出 Step B
- 右卡片：選出庫倉（dropdown）+「預覽配置 →」按鈕

**Step B — 預覽配置 + 一鍵領料**：
- 表格：`previewRepairPick()` 的 lines 結果，每行顯示「需求 X / 配置 Y / 缺 Z」
- 缺貨行紅底警示、`can_post=false` → 一鍵領料 button disabled
- 右下：`[取消][一鍵領料並過帳（綠）]`
- 過帳成功 → `router.push('/parts/issue/repair-pick/<新 id>')`

CRUD pill view：`[返回列表]`（建立模式不顯示 [新增 / 修改 / 作廢]，跟兄弟頁規則一致）。

## 7. 副作用 / 跨模組關聯

- `/parts/operations/balance` revalidate（庫存可用量被改）
- `/service/workorders/<wo_id>` — 工單 detail 反查領料記錄（如果有的話、後續再做）
- `/admin/master-data/work-orders/<wo_id>` — 既有 admin work-order detail（舊 action 就有 revalidate 這條，保留）

## 8. nav_nodes

**不動**。路徑沒變、`page_kind='react_route'` 已是現狀。

## 9. Critical Files

| 動作 | 路徑 |
|---|---|
| 修改 | `src/domain/issues.ts` — append 6 個函式 + 4 個型別、改 `listIssues` join warehouse_name（已有）/ ro_no（新加） |
| 新增 | `src/app/(workspace)/parts/issue/repair-pick/_components/repair-pick-board.tsx` — 獨立 list view |
| 修改 | `src/app/(workspace)/parts/issue/repair-pick/page.tsx` — 改吃自己的 board |
| 新增 | `src/app/(workspace)/parts/issue/repair-pick/new/page.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/repair-pick/new/_components/new-repair-pick-form.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/repair-pick/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/repair-pick/[id]/_components/repair-pick-detail-view.tsx` |
| 新增 | `src/app/(workspace)/parts/issue/repair-pick/[id]/_components/void-issue-button.tsx` |
| ALTER | `stock_issues` 加 `voided_at / voided_by / void_reason` 三欄 |
| Regen | `src/lib/database.types.ts`（mcp generate_typescript_types） |

**舊檔不刪** — `src/lib/parts/actions/index.ts` 的 `issueForRepair` / `cancelIssue` 留著當孤兒（待後續清理 batch）。

## 10. Verification（落地完手測）

1. tsc 0 errors / eslint 0 errors
2. `grep -rn "@/lib/supabase" "src/app/(workspace)/parts/issue/repair-pick"` = 0 hit（天條）
3. List 篩 status='posted' / gi_no 搜尋 / 倉別 filter — 三個都對
4. 點 list 的 gi_no → detail page → KV 正確顯示
5. 點 list 的 ro_no → 跳 work-orders detail（如果路徑通）
6. New page：
   - 選一張 open WO + 倉 → 預覽 → 一鍵領料 → router.push 到 detail
   - 故意選庫存不夠的 → 預覽顯示紅警 + 按鈕 disabled
   - 已領過的 WO 不出現在清單
7. Detail edit：改 notes / line.notes → 存 → banner 綠 + 落地
8. Detail 作廢：reason 必填 → 確認 → status='cancelled'、voided_* 三欄寫入、stock_items 新增還原 row、可用量回升

## 11. 開放問題（階段 3 拍板）

A. **建單流程是否同時支援 ad-hoc**（不綁 RO 的手動領料）？
   - schema 上 `ro_id` 可 null、`source_doc_type/id` 也是 nullable，技術上做得起來
   - 推薦：**先只做「RO 一鍵領料」**，ad-hoc 之後再開一個獨立 mode（或乾脆走 `exception_out` 異常出庫頁）

B. **`pickForWorkOrder` 的副作用 — 推 LINE / 更新 WO 狀態**？
   - 推 LINE 給 SA + 技師（「料件已備齊，可開工」）：notifications hub 有 `feedback_ticket.created` 範例，這頁要不要加 `repair_pick.posted` event_code？
   - 自動把 work_orders.status 從 `dispatched` → `in_progress`：業務上合理但耦合
   - 推薦：**這輪都不做**（純庫存帳變動），LINE / WO 狀態改下一輪 commit 視需求加

C. **作廢守門範圍**？
   - 目前推薦：只擋 `status != 'posted'`（與舊 `cancelIssue` 一致 + 多加 voided_* 三欄）
   - 是否要加「技師已收料就不能作廢」的概念？需要 schema 加 `confirmed_at` / `confirmed_by` 欄
   - 推薦：**不加 confirmed_*、不加技師守門**（schema 沒有就先不擋；之後接技師確認流程時一起加）

D. **schema 變更採 typed 三欄還是 metadata jsonb**？
   - 推薦：**typed 三欄**（跟 po-grn / transfer-in 完全對齊、未來作廢報表 join 路徑統一）

E. **新增 form 是「兩步驟同頁」還是「兩個獨立步驟頁」**？
   - 推薦：**兩步驟同頁**（chooser + preview 都在 `/new`，state 在 client 端、沒有路由切換）

## 11.5 拍板紀錄（2026-05-12 by Ming）

| 議題 | 決議 |
|---|---|
| A. 建單範圍 | **RO 一鍵 + ad-hoc 手動兩 mode 都做** — `/new` 上方 toggle 切換 |
| B. 副作用 | **只動庫存帳**（不推 LINE、不改 WO 狀態） |
| C. 作廢守門 | **只擋 status='posted'**（不加 confirmed_*） |
| D. New form UX | **兩步驟同頁**（chooser + preview 都在 `/new`） |

### Ad-hoc mode 補充 spec

`/new` 頂端加 mode 切換：

```
[● 綁定 RO 工單]  [○ ad-hoc 手動領料]
```

**ad-hoc mode UI（取代 RO chooser 區塊）**：
- 必選：出庫倉
- 選填：車主（customer_id；ad-hoc 可能是內部用料 / 公司車 → 不強制）
- 必填：領料原因（notes、textarea、min 5 字）
- 自加 lines：每行 `[品項搜尋] [出庫數]`，至少 1 行
- 右側 preview 改吃 ad-hoc input：對每個 item_id 跑同樣 FIFO 配置邏輯（共用 `previewRepairPick`，input 改成 union）

**Mutation 加第二個函式**：

```ts
export type CreateAdHocPickInput = {
  warehouse_id: string;
  customer_id?: string;
  notes: string;                  // ad-hoc 必填（取代 ro 來源說明）
  lines: Array<{ item_id: string; qty_needed: number; line_notes?: string }>;
};
export async function pickAdHoc(
  input: CreateAdHocPickInput,
): Promise<Result<{ id: string; gi_no: string }>>;
//  ─ ro_id = null, source_doc_type = null, source_doc_id = null
//  ─ gi_no 同樣走 ISS{date}-{seq}
//  ─ FIFO 配置邏輯與 pickForWorkOrder 相同（抽 helper 內部共用 `allocateStock(warehouse_id, item_id, qty)`）
//  ─ 一行料件不夠 → 整批 abort
```

**Preview 統一型別**：

```ts
export type PreviewInput =
  | { mode: 'ro'; work_order_id: string; warehouse_id: string }
  | { mode: 'adhoc'; warehouse_id: string; lines: Array<{ item_id: string; qty_needed: number }> };

export async function previewRepairPick(input: PreviewInput): Promise<Result<RepairPickPreview>>;
```

ad-hoc mode 的 preview 不需要 `getRepairPickFormData().openWorkOrders` — Form data 改回傳 `{ warehouses, items?: 共用既有 items 搜尋 / 不在這裡 prefetch }`。Items 用既有的 client-side picker（看 transfer-out new-transfer-form 怎麼做）。

## 12. 不動 / 不做

- ❌ 不刪 `src/lib/parts/actions/index.ts` 的 `issueForRepair` / `cancelIssue`（孤兒處置等後續 batch）
- ❌ 不動 RLS / Supabase RPC
- ❌ 不動其他模組（po-grn / transfer-in / internal-sale / transfer-out / return-in）
- ❌ 不寫推 LINE / Notification hub 接點（拍板再加）
- ❌ 不改 work_orders.status（拍板再加）
- ❌ 不加 confirmed_* 欄位（拍板再加）
- ❌ 不動 sidebar / nav_nodes（路徑沒變）
- ❌ 不開 worktree（直接在 main 改、跟前一輪 helper 債清理一致 — Ming 之後決定 commit 策略）
