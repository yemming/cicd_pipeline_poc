# 提案：寄存管理（/parts/operations/consignment）

> 來源：http://43.153.159.135:3000/parts/operations/consignment（既有頁面、單頁 List + Modal/Drawer、未過 spec-to-feature）
> 日期：2026-05-13
> 階段：架構提案（待 Ming 拍板）

## 1. 結構摘要

供應商把零件「寄放」在 DealerOS 倉庫的紀錄表。三個業務動作：
- **register**：登錄寄存（新增單據 + 在 `stock_items` 開一行 `status='consignment'`，不計入可用庫存）
- **transfer-in**：確認轉入正式庫存（`stock_items.status='consignment' → 'available'`、寄存單 `status='transferred'`）
- **return**：退還給供應商（刪除 `stock_items` 行、寄存單 `status='returned'`、metadata 記 `return_reason / returned_at`）

UI 走 5 個 bucket pill：all / active / near (≤7 天) / expired / done。

⚠️ **既存頁面評估**：頁面已運作、無天條違規（grep `@/lib/supabase` = 0 hit）、helper 三件套 + 三 actions 完整。spec-to-feature 在此情境的價值：
1. 補 Detail page（`[id]` 獨立路由、麵包屑可直接 share URL）+ New page（`/new`、跟兄弟頁 internal-sale / repair-pick 對齊）
2. 拆 1116 行的 `consignment-board.tsx`（Register Modal、Detail Drawer、KvSm、Pill、StatCard 都塞同檔）
3. **修脆弱的 stock_items 反向關連**（`ilike notes "寄存 CON...%"` 是 anti-pattern）
4. 評估 register / transfer / return 是否要接會計 engine（目前完全不接、無 stock_movement audit）

依 §邊界 SOP「設計稿跟規格衝突時規格贏」+ design pattern「list / detail 雙交付」— 不適用「純資訊頁可只做 list」例外（有 mutation、有狀態機）。

## 2. Schema 草案

### 既有表（不動 schema、改用法）

`consignment_stocks`（單表、無 lines）：
```
id, brand_id, con_no UNIQUE(brand_id,con_no),
supplier_id FK, item_id FK, warehouse_id FK, bin_id FK?,
initial_qty, remaining_qty, transferred_qty (default 0), unit_cost?,
start_date, end_date, status, notes, transferred_at?,
metadata jsonb DEFAULT '{}'::jsonb,
created_at/by, updated_at
```

Index：`(brand_id, con_no)` UNIQUE、`(brand_id, status)`、`(brand_id, end_date) WHERE status='active'`、`supplier_id`、`warehouse_id`。
RLS：4 條 `brand_scoped_*`（select/insert/update/delete）— ✓ 完整。

### 變更（建議）— 修反向關連

**Option A（推薦）**：給 `stock_items` 加 typed FK 欄位
```sql
ALTER TABLE stock_items
  ADD COLUMN consignment_id uuid REFERENCES consignment_stocks(id) ON DELETE SET NULL;

CREATE INDEX idx_stock_items_consignment ON stock_items(consignment_id)
  WHERE consignment_id IS NOT NULL;
```

register/transfer/return 改用 `consignment_id` 對單，而非 `notes ILIKE '寄存 CON...%'` 字串 match。

**Option B**：完全不動 schema、把反向關連改塞 `stock_items.metadata.consignment_id`（jsonb），helper 內部認這個 key。

兩案 Stage 3 拍板。Option A 是「promote 成 typed」的標準動作（reference: field-classification.md §Promote 案例）。

### 欄位分類審視（既有）

| 欄位 | 目前 | 評語 |
|---|---|---|
| con_no, supplier_id, item_id, warehouse_id, status, initial/remaining/transferred_qty, start/end_date, unit_cost | typed | ✓ 都該 typed（FK / 報表 / list filter） |
| notes | typed text | ✓ 單一字串、長度有限 |
| return_reason, returned_at | metadata.jsonb | ✓ 用得對（單頁專用、不報表）|
| created_by | typed uuid | ✓ |
| metadata | jsonb | ✓ |

→ 沒有欄位需要 promote / demote。

## 3. Domain Helper 規劃

檔案：`src/domain/consignment.ts`（**既有檔擴 append**、不重寫）

### 既有（保留 / 微調 signature）

```ts
listConsignments(filter): Promise<ConsignmentListRow[]>            // ✓ 保留
getConsignmentStats(): Promise<ConsignmentStats>                    // ✓ 保留
getConsignmentLookup(): Promise<ConsignmentLookup>                  // ✓ 保留
getConsignmentPageData(filter): Promise<{...}>                       // ✓ 保留
registerConsignmentAction(input): Promise<ActionResult<{con_id,con_no}>>  // ✓ 保留（內部換 FK 寫法）
transferConsignmentInAction(id): Promise<ActionResult<{id}>>        // ✓ 保留（內部換 FK 寫法）
returnConsignmentAction(id, reason?): Promise<ActionResult<{id}>>   // ✓ 保留（同上）
```

### 缺、待補

```ts
// Detail page 用：撈單筆 + 對應 stock_items 行（FK join）
export async function getConsignmentById(id: string): Promise<{
  con: ConsignmentListRow;
  stockItems: Array<{
    id: string; qty: number; unit_cost: number | null;
    status: string; bin_id: string | null;
    serial_no: string | null; batch_no: string | null;
    last_movement_at: string | null;
  }>;
} | null>;

// New page 用：撈 form lookup（既有 getConsignmentLookup 即可 reuse）
// 直接 reuse、不另開 fn
```

Day 1 內部實作策略：全部 supabase 直連。register/transfer/return 三個 mutation 已 reuse 既有 server actions（已 `"use server"` + ActionResult 型別、不 redirect — 符合 design pattern §Step 2）。

### `notes ILIKE` 換 FK 寫法（內部改寫、UI 不動）

before（脆弱）：
```ts
.from("stock_items").update({...})
  .eq("item_id", con.item_id).eq("warehouse_id", con.warehouse_id)
  .eq("status", "consignment")
  .ilike("notes", `寄存 ${con.con_no}%`);
```

after（採 Option A）：
```ts
.from("stock_items").update({status:"available", notes:`轉入自寄存 ${con.con_no}`})
  .eq("brand_id", brandId).eq("consignment_id", con.id);
```

return 同理（DELETE 改 `.eq("consignment_id", con.id)`）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| registerConsignmentAction | INSERT consignment_stocks + INSERT stock_items（`status='consignment'` + `consignment_id` FK）；revalidatePath consignment + balance | ✓ |
| registerConsignmentAction | **不寫** stock_movements（寄存進倉不算庫存異動） | ✓ |
| registerConsignmentAction | 不推 LINE 給供應商 | ✓ 確定（單據量大不需推送） |
| registerConsignmentAction | 不接會計 engine | [需確認] Q3 — 寄存進倉只是「寄放」、沒過戶、不該入庫存資產帳；推薦不接 |
| transferConsignmentInAction | UPDATE stock_items.status `consignment → available`；UPDATE consignment_stocks (transferred_qty/remaining=0/status=transferred/transferred_at) | ✓ |
| transferConsignmentInAction | **缺**：未寫 stock_movements audit row | [需確認] Q4 |
| transferConsignmentInAction | 接會計 engine：產生 `PARTS_PURCHASE` 分錄（D 庫存 / C AP）— 寄存轉購本質是採購進貨 | [需確認] Q3 |
| returnConsignmentAction | DELETE stock_items（依 consignment_id）；UPDATE consignment_stocks（status=returned, metadata.return_reason/returned_at） | ✓ |
| returnConsignmentAction | 不接會計（沒過戶就沒貸 AP，退還 = 拿回供應商東西、不沖任何帳） | ✓ 推薦不接 |
| 到期前 7 天提醒 | UI 文案有寫「系統自動發送提醒通知」— 目前**未實作** | [需確認] Q5 |

⚠️ 既有 `stock_items` 反向關連用 `notes ILIKE` — 第一輪落地必修（Option A or B）。

## 5. 會計事件分析（MANDATORY）

> 本功能會產生會計事件的，**只有 transfer-in**（寄存轉購 = 採購）。register / return 都是「物理保管權移動、不過戶」。

| # | 業務動作 | 對應 transaction_type code | 狀態 | cash_flow_section | 觸發位置 |
|---|---|---|---|---|---|
| 1 | register（登錄寄存） | — 無 | — | — | 不接 engine — 物理進倉、無過戶 |
| 2 | transfer-in（確認轉入） | `PARTS_PURCHASE` | ✅ 已 seed | operating | `src/domain/consignment.ts → transferConsignmentInAction()` 結尾 `after()` |
| 3 | return（退還供應商） | — 無 | — | — | 不接 engine — 退還 = 取回未過戶的物 |

**目前已 seed 的相關 transaction_types**（query 結果）：
- `PARTS_PURCHASE`（採購進零件）✅
- `PARTS_RETURN_TO_SUPPLIER`（零件退回供應商）— **不適用此頁**（這是已過戶 PO 的退貨；寄存退還沒過戶過）
- `STOCK_ADJUSTMENT_GAIN / LOSS`、`PARTS_RETAIL_SALE`、`PAYMENT_RECEIPT_BANK`、`VENDOR_PAYMENT_BANK` — 與本功能無關

**transfer-in 接點寫法**（Q3 拍板採 a 才落實）：

```ts
import { after } from "next/server";
import { instantiateTransaction, TX_TYPES } from "@/domain/transactions";

// transferConsignmentInAction 結尾、UPDATE 都 commit 後
after(async () => {
  const amount = remain * Number(con.unit_cost ?? 0);
  if (!(amount > 0)) return;  // 無單價 → 不過帳（讓人補單價）
  const res = await instantiateTransaction(TX_TYPES.PARTS_PURCHASE, {
    supplier_id: con.supplier_id,
    item_id: con.item_id,
    net_amount: amount,
    tax_amount: 0,   // 寄存轉購是否含稅 [需確認] — Q3.b
    warehouse_id: con.warehouse_id,
    store_id: null,  // 寄存單無 store 維度
  }, { autoPost: true, userId });
  if (!res.ok) console.error("[accounting] 寄存轉購 auto-post 失敗：", res.error);
});
```

**對主檔 coa binding 影響**：
- 依賴 `items.gl_inventory_coa_id`（庫存科目）+ `suppliers.gl_payable_coa_id`（AP 科目）— 沿用 PARTS_PURCHASE 既有 template，無新增。
- 不新增 dim、不新表。

**不需要會計事件的場景**：
- register（登錄寄存）— 物理進倉但無資金 / AP 變動
- return（退還）— 物理出倉但無沖帳
- 純改 metadata（如 reason）— 無資金流

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 寄存管理 list | `/parts/operations/consignment` | List View + DataGrid + 5 bucket pill + Stats 4 卡 | `parts/operations/exceptions/_components/exceptions-board.tsx`（同模組鄰居）|
| 寄存單詳情 | `/parts/operations/consignment/[id]` | Page View（含 view / edit / 不適用 create — 寄存單建立後不修改基本欄位、只切狀態）| `parts/issue/repair-pick/[id]/_components/repair-pick-detail-view.tsx` |
| 登錄寄存品項 | `/parts/operations/consignment/new` | New Form 獨立路由 | `parts/issue/internal-sale/new/_components/new-internal-sale-form.tsx` |

**Page View 模式特例**：寄存單沒有「修改」（基本欄位不可改、只能切 transferred / returned 狀態），CRUD pill bar 只 4 顆：
```
[返回列表（白）] [＋ 新登錄（綠）] [刪除（紅、僅 active 且 stock 未動）] [<狀態動作（依 status 切色）>]
```

`<狀態動作>` 依目前 status 切換：
- `active` → `[確認轉入（綠）] [退還（amber）]`
- `transferred / returned` → `[—]`（disabled、僅顯示）

⚠️ **「新增」按鈕不開新頁、不開 inline create mode**（寄存單建立流程涉及 5 個必填外鍵 + 進倉副作用、不適合 detail page 同頁切 create）。改為**獨立 `/new` 路由**、跟兄弟頁 internal-sale/repair-pick 對齊。Detail page 的「+ 新登錄」就是 `router.push('/parts/operations/consignment/new')`。

## 7. nav_nodes

**不動**：兩個節點都已 `react_route` + `/parts/operations/consignment`（雙 brand 各一筆，sort_order=1 in their parent）。

```sql
-- 不需要 SQL，這節留紀錄
-- ducati: ac685f2e-8a96-4f4f-b7d4-1e573abeb65d
-- indian: 82bde9a3-a29b-4cfb-a3b4-f3179c02b437
```

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| DB migration（採 Option A）| `ALTER TABLE stock_items ADD COLUMN consignment_id ...` + index |
| Type regenerate | `src/lib/database.types.ts`（`generate_typescript_types` 重生）|
| 改 | `src/domain/consignment.ts`（append `getConsignmentById`、改 register/transfer/return 內部走 FK；視 Q3 加 `after(...) instantiateTransaction`）|
| 改 | `src/app/(workspace)/parts/operations/consignment/page.tsx`（不大動、可能加 pagination）|
| 改 | `src/app/(workspace)/parts/operations/consignment/_components/consignment-board.tsx`（**從 1116 行 → ≈ 350 行**：拆檔、移除 Drawer 邏輯、「+ 登錄」改 `router.push('/new')`、列尾「寄存單號」改 `<Link href={`/consignment/${id}`}>`）|
| 新 | `src/app/(workspace)/parts/operations/consignment/[id]/page.tsx` |
| 新 | `src/app/(workspace)/parts/operations/consignment/[id]/_components/consignment-detail-view.tsx`（Page View 6 層 + KV grid + 對應 stock_items section + 操作 pill 列）|
| 新 | `src/app/(workspace)/parts/operations/consignment/new/page.tsx` |
| 新 | `src/app/(workspace)/parts/operations/consignment/new/_components/new-consignment-form.tsx`（從現 `RegisterModal` 抽出來、保留所有欄位 + 驗證 + 規則說明）|
| 拆 | `consignment-board.tsx` 內部的 `StatCard` / `Pill` / `KvSm` 三個小元件 — 留在 board 同檔（小、單頁用）|
| 刪 | `consignment-board.tsx` 內部的 `RegisterModal` + `DetailDrawer`（移到對應 `/new` 和 `/[id]` 後刪除原檔內函式）|
| 新 | `scripts/pw-smoke-consignment.mjs`（list / new / detail 三 URL smoke）|

## 9. Verification（落地完手測）

1. **天條 audit**：`grep -rn "@/lib/supabase" "src/app/(workspace)/parts/operations/consignment"` = 0 hit
2. **schema audit**：`stock_items.consignment_id` FK 在；舊 `notes ILIKE '寄存 CON...%'` 字串在 helper 中 = 0 hit
3. **list flow**：filter / pill 切換 / stats 4 卡數字正確、列表「寄存單號」可點進 detail
4. **new flow**：`/new` 路由填表 → 建單 → 跳 `/[id]` → stats `active_count` +1、`stock_items` 多一行 `status='consignment'` 且 `consignment_id` 已連
5. **detail flow（active）**：KV grid 完整、stock_items section 顯示連動的那行、操作 pill `確認轉入` / `退還` 都會跑
6. **transfer-in flow**：點「確認轉入」→ stock_items 該行 `status='available'`、consignment_stocks `status='transferred'`、stats「本月已轉入」+1；若 Q3=a + unit_cost > 0 → 跑 `journal_entries` 看有 1 筆 `PARTS_PURCHASE` posted、借貸平衡、period 為 OPEN
7. **return flow**：點「退還」→ stock_items 該行被刪、consignment_stocks `status='returned'` 且 `metadata.return_reason / returned_at` 寫入
8. **權限**：無 `parts.consignment.ops` 的 user：list 看得到、按鈕 disabled / 不可送
9. **tsc / eslint**：0 errors
10. **Playwright smoke**：list + new + detail 三頁能 render（不卡 client error）

## 10. 開放問題（Stage 3 拍板）

- **Q1 反向關連修法**：(a) 加 `stock_items.consignment_id` typed FK（**推薦** — promote 標準動作、未來查詢方便）/ (b) 塞 `stock_items.metadata.consignment_id` jsonb（無 migration、但無 FK 約束 + 無 index）

- **Q2 板塊拆檔粒度**：現 board 1116 行包含 Modal + Drawer。落地推薦：
  (a) 抽 `RegisterModal` → 變成 `/new` 獨立頁、抽 `DetailDrawer` → 變成 `/[id]` Page View（**推薦** — 對齊 design pattern §Step 7）
  (b) 留 inline modal、不做 detail page（不合規、不建議）
  (c) 折衷：抽 detail page 但 register 保留 modal（修了 detail share URL 但兩種 create 入口不一致）

- **Q3 寄存轉購是否接會計 engine（PARTS_PURCHASE）**：
  (a) 接 — `transferConsignmentInAction` 結尾 `after()` 跑 `instantiateTransaction(PARTS_PURCHASE, ...)`，autoPost、寄存轉購視為一筆採購、產生「D 庫存 / C AP」（**推薦** — 這是真正的會計事件；目前完全不接會造成帳實不符）。子問題 Q3.b：寄存轉購的 `tax_amount` — (b1) 一律 0（轉購時供應商另外開發票）/ (b2) 用 `unit_cost * qty * 5%`（內含稅率，跟 PO 流程一致）
  (b) 不接 — 暫保持現狀，accounting 由 GRN / PO 模組統一處理（**會漏帳**：寄存品永遠走不進 GRN，等於沒過帳）
  (c) 接但 draft 不 autoPost — 走 review 流程（保守）

- **Q4 transfer / return 是否寫 `stock_movements` audit**：(a) 寫（**推薦** — 跟 receipt / issue 模組一致）/ (b) 不寫（目前無、不影響功能但失去 audit trail）

- **Q5 到期前 7 天自動推 LINE 通知**：UI 規則說明寫「到期前 7 天系統自動發送提醒通知」但完全沒實作。(a) 立刻補（需設 cron / Edge Function + 走 notification hub）/ (b) Phase 2 後再做、UI 文案改為「到期前看 dashboard 提醒」/ (c) 立刻補但只走 dashboard 提醒、不推 LINE

- **Q6 `unit_cost` 是否必填**：目前 schema `unit_cost numeric NULL`、form 標「選填」。若 Q3=a（接 engine），不填的單轉購時無法產分錄。(a) form 改必填（推薦搭 Q3=a）/ (b) 保持選填、轉購時 prompt 補單價 / (c) 保持選填、不接會計就無此問題

## 11. 不動 / 邊界

- 不重寫 `listConsignments` / `getConsignmentStats` / `getConsignmentLookup`（已合規、品質夠）
- 不動 `consignment_stocks` schema（已涵蓋所有 typed 欄位、metadata 用法正確）
- 不動 nav_nodes（已 react_route + 雙 brand 已存在）
- 不接 LINE 通知（Q5 預設不接、除非拍 a）
- 不改視覺 token（沿用 board 既有色碼、字級 — 已符合 design pattern）
- 不重命名 helper function（`registerConsignmentAction` / `transferConsignmentInAction` / `returnConsignmentAction` 已符合 naming-conventions §動詞 + 名詞）
