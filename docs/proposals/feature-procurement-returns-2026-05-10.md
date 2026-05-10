---
slug: procurement-returns
source: docs/DUCATI_庫存管理模組_串接版_20260510_最新版/04_採購管理_採購退貨.html
date: 2026-05-10
stage: 架構提案（待用戶拍板）
---

# 提案：採購退貨（Procurement Returns）

> 來源：`docs/DUCATI_庫存管理模組_串接版_20260510_最新版/04_採購管理_採購退貨.html`
> 階段：架構提案（待 Ming 拍板）

## 1. 結構摘要

對「已入庫」備件發起退貨，從原採購單 (PO) 挑明細 → 建退貨單 (RT) → 主管審核 → 物流寄出 → 完成；審核通過時觸發**庫存出庫**回沖（接 `stock_issues`）+ 維護 `purchase_order_lines.qty_returned` 累計避免重複退。Day 1 純做 CRUD + 狀態機，副作用（stock_issues / 通知 / 沖帳）全標 Phase 2。

## 2. Schema 草案

### ✅ 不需要新表、不需要 ALTER TABLE

現存 schema 完全 ready：

| 表 | 角色 | 關鍵欄位 | RLS |
|---|---|---|---|
| `purchase_returns` | header | `rt_no`, `po_id` (nullable, 允許「無 PO 退貨」), `vendor_id`, `warehouse_id`, `return_reason` (CHECK 6 種), `status` (CHECK 5 種), `qty_return_total`, `amount_total`, `refund_amount`, `logistics_provider`, `logistics_tracking_no`, `approved_by/at`, `gl_posted`, `metadata` | ✅ 4 條 brand_scoped policy 已建 |
| `purchase_return_lines` | lines | `rt_id`, `line_no`, `po_line_id` (nullable), `item_id`, `qty_return` (CHECK > 0), `unit_price`, `line_amount`, `metadata` | ✅ 4 條 brand_scoped policy 已建 |

且 `purchase_order_lines` 早已預留 `qty_returned numeric DEFAULT 0` — approve 時 increment。

### CHECK constraints（DB 層硬約束、UI 跟 helper 必照）

```
purchase_returns.return_reason ∈ {spec_mismatch, quality_issue, overship, wrong_item, damaged, other}
purchase_returns.status        ∈ {pending, approved, shipped, completed, cancelled}
purchase_return_lines.qty_return > 0
```

HTML UI 對映：

| HTML 顯示 | DB 值 | 備註 |
|---|---|---|
| 規格不符 | `spec_mismatch` | |
| 品質問題（瑕疵品） | `quality_issue` | |
| 數量多送 | `overship` | |
| 錯誤商品 | `wrong_item` | |
| 其他 | `other` | |
| —（HTML 沒列） | `damaged` | dropdown 加「破損」對應 |
| 「待審核」 b-pend | `pending` | |
| —（HTML 沒 chip） | `approved` | 中間態：審核通過、物流未寄；UI 顯示 b-teal 「待出貨」 |
| 「退貨中」 b-navy | `shipped` | 物流階段 |
| 「已完成」 b-done | `completed` | |
| —（隱藏） | `cancelled` | UI 上靠「刪除/作廢」進入 |

### 欄位分類（typed vs jsonb）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `rt_no` | typed text UNIQUE | list 主索引、人會打、唯一 |
| `po_id` | typed FK (nullable) | FK 完整性；nullable 允許無 PO 退貨（少數 case） |
| `vendor_id` | typed FK | report group by |
| `warehouse_id` | typed FK NOT NULL | RLS 範圍 + 出庫源 |
| `return_reason` | typed text + CHECK | 6 種固定、會 group by 月度統計 |
| `return_date` | typed date | 報表篩選 |
| `status` | typed text + CHECK | list filter 主軸 + KPI |
| `qty_return_total` / `amount_total` | typed numeric | 報表 sum |
| `refund_amount` | typed numeric (nullable) | 退款追蹤；先 typed、後續加退款流程穩 |
| `logistics_provider` / `logistics_tracking_no` | typed text (nullable) | 雖然單頁用、但人會輸入 + 未來物流串接會吃 |
| `approved_by` / `approved_at` | typed | audit 起點 |
| `gl_posted` / `gl_posted_at` | typed | 沖帳追蹤 |
| `notes` | typed text | 退貨說明、長度 ~500 字 |
| `metadata` | jsonb | 收口未定義欄位（如「退貨照片 URLs」、「客戶意見」、「外部參考號」） |

`purchase_return_lines`：

| 欄位 | 落腳 | 理由 |
|---|---|---|
| `rt_id` / `line_no` / `item_id` / `po_line_id` | typed | FK + 排序 |
| `qty_return` / `unit_price` / `line_amount` | typed numeric | 報表 + sum |
| `uom` / `notes` | typed | 顯示 |
| `metadata` | jsonb | 線上 attach 例如「破損部位照片」 |

## 3. Domain Helper 規劃

新增檔案：`src/domain/procurement.ts`（**不分多檔** — 採購退貨 / 採購單 / 採購合約 同一個 domain）

```ts
'use server'

// === 採購退貨（本次落地） ===
export async function listPurchaseReturns(filter?: {
  brand_id?: string
  status?: string
  vendor_id?: string
  return_reason?: string
  date_from?: string
  date_to?: string
  q?: string  // 模糊搜 rt_no / po_no / vendor.name
}): Promise<{ rows: PurchaseReturnRow[]; total: number }>

export async function getPurchaseReturnById(id: string): Promise<PurchaseReturnDetail | null>
//  └─ 帶 lines + vendor + po + warehouse 的 join

export async function getPurchaseReturnKpis(brand_id: string): Promise<{
  pending_count: number       // status=pending
  shipped_count: number       // status=shipped（退貨中物流）
  completed_this_month: number
  amount_this_month: number   // sum(amount_total) where status=completed
}>

export async function addPurchaseReturn(input: AddPurchaseReturnInput): Promise<{ id: string; rt_no: string }>
//  └─ Day 1：寫 header + lines（事務）；計算 amount_total/qty_return_total；產 rt_no（RT-yyyymmdd-NNN）
//  └─ status 預設 'pending'；warehouse_id 從 PO 帶或 UI dropdown

export async function updatePurchaseReturn(id: string, patch: UpdatePurchaseReturnPatch): Promise<{ id: string }>
//  └─ pending 才可改 lines；其他狀態只能改 logistics / notes / metadata

export async function approvePurchaseReturn(id: string): Promise<{ id: string }>
//  └─ Day 1：UPDATE status='approved' + approved_by/at；UPDATE purchase_order_lines.qty_returned += qty_return（per line）
//  └─ Phase 2：INSERT stock_issues (type='purchase_return', source_doc_id=rt_id) + lines；INSERT 推 LINE 給申請人
//  └─ Phase 3：寫 GL 沖銷分錄

export async function shipPurchaseReturn(id: string, input: { logistics_provider: string; logistics_tracking_no: string }): Promise<{ id: string }>
//  └─ status approved → shipped；填物流欄

export async function completePurchaseReturn(id: string, input?: { refund_amount?: number }): Promise<{ id: string }>
//  └─ status shipped → completed；可帶實退金額

export async function cancelPurchaseReturn(id: string, reason: string): Promise<{ id: string }>
//  └─ pending / approved 才可作廢；reject reason 寫 metadata.cancel_reason

export async function deletePurchaseReturn(id: string): Promise<{ id: string }>
//  └─ 只允許 pending；其他狀態請走 cancel

// === Lookup helpers（給 list filter / form dropdown 用） ===
export async function listPurchaseOrderOptions(filter?: { vendor_id?: string; only_received?: boolean }): Promise<POOption[]>
//  └─ 「只顯示已入庫的 PO」(qty_received_total > 0) 給退貨 form 挑

export async function getPurchaseOrderLinesForReturn(po_id: string): Promise<POLineForReturn[]>
//  └─ 帶該 PO 的 lines + 已退數 (qty_returned) + 可退數 (qty_received - qty_returned)

export async function listVendorOptions(): Promise<VendorOption[]>  // reuse 既有 src/domain/* 若有；不然就地建
```

實作策略（Day 1 預設）：

- 全部 supabase 直連（`src/lib/supabase/server` server client）
- `addPurchaseReturn` / `approvePurchaseReturn` 用 supabase RPC 包事務（Postgres function）— 因為要原子寫 header + lines + 改 qty_returned；不接受半套
- 副作用全標 Phase 2，Day 1 不做 stock_issues / 通知 / GL

## 4. 副作用清單

| 動作 | 副作用 | 類型 | 確定性 |
|---|---|---|---|
| `addPurchaseReturn` | 純 INSERT header + lines（單一事務） | — | 確定 |
| `addPurchaseReturn` | 推 LINE 給審核者（主管） | B 通知 | **[需確認]** 範圍 |
| `approvePurchaseReturn` | UPDATE status + UPDATE `purchase_order_lines.qty_returned` += qty_return | A 跨表事務 | 確定（Day 1 必做） |
| `approvePurchaseReturn` | INSERT `stock_issues` (type='purchase_return') + `stock_issue_lines` + 減 `stock_items.qty` | A 跨表事務 | 確定畫面寫「庫存自動回沖」、但**[Phase 2 後做]** — 需要先確認 stock_issues 出庫單規格 |
| `approvePurchaseReturn` | 推 LINE 給申請人「你的退貨單已通過」 | B 通知 | **[需確認]** |
| `shipPurchaseReturn` | 寫物流欄、status → shipped；可選推外部物流 API | E 外部 | 物流 API **[Phase 3]** |
| `completePurchaseReturn` | INSERT 退款憑證（如果已收）+ 寫 GL credit memo | A 跨表 + D Audit | **[Phase 3]** GL 接通後做 |
| `cancelPurchaseReturn` | 純改 status；如已 approved 則回沖 `purchase_order_lines.qty_returned` -= | A 條件性事務 | 確定（Day 1 必做） |
| 任何狀態變更 | 寫 `audit_log`（如表存在） | D Audit | **[需確認]** 是否要 |
| `synced_at` / `external_id` 欄位 | 同步 NetSuite | E 外部 | **[Phase 3]** |

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 採購退貨清單 | `/parts/purchase/returns` | List View + 4 KPI cards + slide-in panel 新增 | `parts/setup/items/_components/items-board.tsx` + KPI card grid |
| 採購退貨詳情 | `/parts/purchase/returns/[id]` | Page View | `parts/setup/items/[id]/_components/item-detail-view.tsx` |
| 新增（同頁 create-mode） | `/parts/purchase/returns/new` | 同 detail view + initialMode='create' | 同上 |

### List View 結構特殊點

- HTML 設計**有 4 個 KPI card** 在 filter bar 上方（待處理 / 退貨中 / 本月完成 / 本月金額）— 加在 list view header 底下、filter 上方
- 「新增退貨申請」開 **slide-in side panel**（不是 modal）— design pattern 多了一個 panel 元件選項；PoC 階段先沿用 modal 即可（用 modal 跑得通就先 modal、不為一頁訂新元件）
- Filter 欄位：狀態 / 供應商 / 退貨原因 / 申請日期區間 / 模糊搜尋（rt_no / po_no / 供應商）
- 列尾「操作」隨 status 變化：
  - `pending` → 「審核」（綠）+ 「編輯」+ 「作廢」（紅）
  - `approved` → 「填物流」（深藍）+ 「作廢」
  - `shipped` → 「物流」（白）+ 「標記完成」（綠）
  - `completed` → 「查看」（白）

### Page View 結構特殊點

- Title card 左：rt_no + 狀態 chip + 供應商 chip + 退貨原因 chip；右：圖片框改為「來源 PO 卡片」（PO 號 + PO 日期 + 點擊跳 PO detail）
- 區段卡片：
  - ▼ 退貨資訊（rt_no / 供應商 / 倉庫 / 退貨原因 / 退貨日期 / 申請人 / 審核人）
  - ▼ 物流資訊（provider / tracking_no / 出貨日 / 預計到貨 / 簽收照片 from metadata）
  - ▼ 金額（qty_return_total / amount_total / refund_amount）
- Tabs：
  - 「退貨明細」（lines table，每行：line_no / item / qty_return / unit_price / line_amount / 對應 PO line 的 qty_received / qty_returned 進度）
  - 「狀態歷程」（從 audit_log 或 metadata.status_history 撈，Phase 2 才接）
- CRUD pill：view mode 視 status：pending 才有「修改」/「刪除」；其他狀態主操作換成業務動詞（審核 / 填物流 / 標記完成）

## 6. nav_nodes（**不動**）

DB 檢查結果：

- ✅ Indian 已有 `/parts/purchase/returns` row（id `464de4c4-...`, sort_order=4, parent=`60a48b77` 採購管理）
- ❌ Ducati 沒有「採購管理」level=2 父節點

這個非對稱**不是 bug**：套用 memory「WMS 範圍 — Ducati 不做」原則 — 採購退貨屬於 WMS / 庫存進出庫範圍，Ducati 此模組不開放；Indian 側既有 nav 已生效，**完全不需要動 `nav_nodes`**。

> 跟 spec-to-feature skill 預設「雙 brand 必補」是有意例外，理由 = WMS 範圍。

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/procurement.ts` |
| 新增 | `src/app/(workspace)/parts/purchase/returns/page.tsx` |
| 新增 | `src/app/(workspace)/parts/purchase/returns/_components/returns-board.tsx` |
| 新增 | `src/app/(workspace)/parts/purchase/returns/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/purchase/returns/[id]/_components/return-detail-view.tsx` |
| 新增 | `src/app/(workspace)/parts/purchase/returns/new/page.tsx` |
| 新增 RPC（Phase 1）| `apply_migration` 寫一支 `create_purchase_return(...)` Postgres function（事務）+ 一支 `approve_purchase_return(rt_id)` |
| 修改 | `src/lib/database.types.ts` 重生（如有 RPC 回傳型別）|

## 8. Verification（落地完手測 checklist）

1. **list KPI 一致性**：手動建 1 筆 pending、1 筆 shipped、1 筆 completed 今月、1 筆 completed 上月 → KPI 4 卡分別顯示 1 / 1 / 1 / 上月那筆金額**不**算入
2. **list filter**：狀態 / 供應商 / 退貨原因 / 日期區間 / 模糊搜尋 各跑一次，URL query string 有同步推 `?status=...`
3. **add flow**：點「+ 新增退貨申請」→ slide-in / modal 開 → 選 PO → 自動帶 vendor + warehouse + lines → 勾品項 + 填 qty → submit → list 立刻看到 + KPI「待處理」+1
4. **PO line 防重複**：對同一 PO line 連退兩次，第二次 `qty_received - qty_returned` 應該扣掉第一次量；超過可退量應 reject（DB CHECK 或 helper validation）
5. **approve 事務**：approve pending 單 → status 變 approved + 對應 PO line 的 `qty_returned` 增加 + UI list 顯示「待出貨」chip
6. **cancel 回沖**：approve 後 cancel → `qty_returned` 應該扣回（不能讓退貨單作廢但 PO 還記著退過）
7. **detail page 三 mode**：view → 點「修改」變 edit + 模式 badge amber；按「新增」進 create mode + 欄位清空 + tabs 隱藏；建立成功後 `router.push` 到新 id
8. **brand RLS**：切換 active brand 從 ducati → indian，list 應該分別顯示各 brand 的單；INSERT 進另一 brand 應該被 RLS 擋
9. **紀律驗證**：`grep -r "from '@/lib/supabase" src/app/\(workspace\)/parts/purchase/returns` = 0 行
10. **build 綠**：`npx tsc --noEmit` 0 errors、`npx eslint <touched paths>` 0 errors

## 9. 開放問題（階段 3 拍板）

### Q1. Phase 1 副作用切到哪裡？

選項 A（保守，**推薦**）：Day 1 只做 CRUD + 狀態機 + `qty_returned` 維護；`stock_issues` 出庫 + LINE 通知 + GL 全部 Phase 2 / Phase 3。理由：跑得起來再回頭加，符合 Day 1 預設策略。

選項 B（一步到位）：Day 1 同時接 `stock_issues` 寫入。風險：要先確認 stock_issues 出庫單規格（gi_no 流水、type 是否要新增 `purchase_return`、是否要 post 過程、跟 stock_items qty 同步邏輯）— 戰線拉長 1.5x。

### Q2. 「新增退貨申請」用 slide-in panel 還是 modal？

選項 A（**推薦**）：照 design pattern 既有 `<Modal>`（pattern 一致、不為單頁訂新元件）。
選項 B：照 HTML 設計做 slide-in 右側 panel — 美感勝出，但要在 design pattern 加新元件規範。

### Q3. 退貨原因要不要加 `damaged`「破損」？

選項 A（**推薦**）：dropdown 加「破損」進 5 + 1 → 6 種，跟 DB CHECK 對齊。
選項 B：照 HTML 只開 5 種，DB 留 damaged 給未來。

### Q4. 通知範圍

選項 A（**推薦**）：Phase 1 暫不推 LINE；Phase 2 接 `notifications.dispatch({ code: 'purchase_return.approved', ... })` 只推給申請人。
選項 B：建單時推主管（要先有「採購主管」role / target 對應）+ 審核完成推申請人。

### Q5. 路徑 / 命名

`src/domain/procurement.ts` 一檔涵蓋採購退貨 + 採購單 + 採購合約（之後新增 helper 加進來）— 確認路徑命名可用？

### Q6. CRUD pill 在不同 status 顯示不同主動作

「pending 顯示審核」/「approved 顯示填物流」/「shipped 顯示標記完成」這個動態 pill 設計是否 OK？還是統一 5 顆 pill + 業務動作另外開一排？

---

## 拍板紀錄（2026-05-10）

| # | 問題 | 拍板結果 | 影響 |
|---|---|---|---|
| Q1 | Day 1 副作用範圍 | **B. 一步到位**：approve 同時寫 `stock_issues` (type=`vendor_return`) + `stock_issue_lines` + 改 `stock_items` | 階段 4 多寫 1-2 支 RPC、要 ALTER stock_issues.type CHECK |
| Q2 | 新增 form UI | **A. 用既有 Modal**；**強約束：必須綁原 PO**（無 PO 不給退） | helper `addPurchaseReturn` 內部 validate `input.po_id` 不為 null；UI dropdown 不放「無 PO」選項；`purchase_returns.po_id` DB 仍保 nullable（避免破壞既有資料 / 留外部同步退路），業務規則只在 helper 層擋 |
| Q3 | 退貨原因 | **A. 加 damaged**，dropdown 6 種 | UI dropdown 加「破損」對應 `damaged` |
| Q4 | LINE 通知 | **A. 全不推、靜默** | 不接 `notifications.dispatch`；未來要推再說 |
| Q5 | helper 命名 | **A. `src/domain/procurement.ts` 一檔**涵蓋採購全域 | 之後採購單 / 採購合約 helper 加進同一檔 |
| Q7 | `stock_issues.type` 新值 | **B. `vendor_return`** | `apply_migration` 跑 `ALTER TABLE stock_issues DROP CONSTRAINT stock_issues_type_check; ADD CONSTRAINT ... CHECK (type IN (...原 7 種, 'vendor_return'))` |
| Q8 | `stock_items` 出貨策略 | **C. 三進一**：讀對應 `purchase_order_lines.serial_required`，true 走 B（UI 指定 serial）/ false 走 A（FIFO 減 qty） | `purchase_return_lines.metadata` 收口 `selected_serial_nos: []`（Phase 1 form 暫時統一收 array、空 array 代表走 FIFO）；RPC 內讀 PO line 的 `serial_required` 決定分支 |

> 通知 (Q4) / pill 動態主動作 (Q6, 未問) 走推薦預設、不阻擋。

## 階段 4 落地順序

> 高 blast radius（DB schema 改動 + 多支 RPC + 6 個新檔）。需 Ming 點頭啟動。

1. **DB migration**（apply_migration）
   - ALTER `stock_issues_type_check` 加 `'vendor_return'`
   - 寫 RPC `procurement_create_return(...)` — 接 input、產 rt_no、寫 header + lines（事務）
   - 寫 RPC `procurement_approve_return(rt_id)` — 寫 stock_issues + stock_issue_lines + 改 stock_items（FIFO 或 serial）+ 改 PO line.qty_returned + 改 RT.status；全 atomic
   - 寫 RPC `procurement_cancel_return(rt_id, reason)` — pending 直接 cancel；approved 要先回沖 stock_items / qty_returned 再 cancel
   - 寫 RPC `procurement_ship_return(rt_id, provider, tracking_no)`
   - 寫 RPC `procurement_complete_return(rt_id, refund_amount)`
2. `generate_typescript_types` 重生 `src/lib/database.types.ts`
3. 寫 `src/domain/procurement.ts`（10 個 helper、'use server'）— 內部全走 supabase RPC、不直連 table
4. 寫 list page：`/parts/purchase/returns/page.tsx` + `_components/returns-board.tsx`（KPI cards + filter + table + Modal）
5. 寫 detail page：`/parts/purchase/returns/[id]/page.tsx` + `_components/return-detail-view.tsx`（含三 mode）+ `/new/page.tsx`
6. （nav_nodes 不動 — Indian 已有、Ducati 不開）
7. `npx tsc --noEmit` + `npx eslint <touched>` 必 0 errors
8. 輸出階段 5 verification checklist 給 Ming 手測（見 §8）
