# 提案：庫存盤點作業（/parts/operations/count-ops）

> 來源：http://43.153.159.135:3000/parts/operations/count-ops（既有 page.tsx 簡單版）+ Stitch 設計稿 `docs/DUCATI_庫存管理模組_串接版_20260510_最新版/07_庫存作業_庫存盤點作業.html`
> 日期：2026-05-13
> 階段：架構提案（待 Ming 拍板）

## 1. 結構摘要

「盤點任務 dashboard」——管理進行中 / 待覆核 / 已完成的盤點 session（`inventory_counts`），不負責掃條碼建明細（那走 `8.2 盤點處理`、後續再做）。

**3 個業務動作**：
- **建立盤點 session**（從本頁新增）→ 拍當下 stock_items 快照、產 `CTYYYYMMDD-NNN`、status='counting'
- **提交首盤**（線上補 qty_final → status='pending_approval'，計差異）→ 已有 `submitCountSessionAction`
- **核准盤點** → 已有 `approveCountAdjustmentAction`，內部 reuse `createAdjustment` engine → 已串 `STOCK_ADJUSTMENT_GAIN/LOSS` 會計事件 ✓

⚠️ **本提案範疇限定 dashboard / list / detail / new session**。實際掃條碼 / 一行一行填首複盤的「操作頁」屬 `8.2 盤點處理`（後續另一輪 spec-to-feature），本次不做。

⚠️ **現有 page.tsx 評估**：簡單版 read-only list，**無天條違規**（用 `listInventoryCounts()` helper）。spec-to-feature 在此情境的價值：
1. 套 design pattern（DataGrid + KPI cards + filter bar + toolbar pill）
2. 補 **Detail page**（`[id]` 看明細 + 動作 [提交首盤] [核准 / 退回] [刪除 draft]）
3. 補 **New page**（`/new` 建 session — 選倉、選 plan、選 ABC filter，建 → 跳 detail）
4. KPI 跟「平均盤點準確率」要 derive query

## 2. Schema 草案

### 既有表（不動 schema）

3 張表都已建好且 RLS 完整：
- `inventory_counts`（主表）— ct_no UNIQUE(brand_id,ct_no)、status text、warehouse_id FK、plan_id FK、total/variance_lines、variance_amount、freeze_warehouse、first/second_counter_id、approver_id、approved_at、metadata
- `inventory_count_lines`（明細）— ct_id FK、item_id FK、bin_id FK、qty_system/first/second/final、variance、variance_amount
- `inventory_count_plans`（計畫，可選 FK）— plan_name、plan_type、abc_filter、schedule_cron

**狀態機**（既有 server actions 已實作）：
```
draft  →  counting  →  first_done  →  pending_approval  →  completed
            ↑ snapshot 後                                        ↑ 過 STOCK_ADJUSTMENT engine
            startCountSessionAction()                             approveCountAdjustmentAction()
```

### 欄位分類審視

| 欄位 | 目前 | 評語 |
|---|---|---|
| ct_no, status, count_date, warehouse_id, plan_id, total_lines, variance_lines, variance_amount | typed | ✓ 對（FK / report / filter） |
| freeze_warehouse, first_counter_id, second_counter_id, approver_id, approved_at | typed | ✓ |
| **count_type**（A類全盤 / 月度例盤 / 抽盤 / 動態盤）| ❌ **缺**，可走 metadata 或 promote | 詳見 §10 開放問題 1 |
| **scope_label**（盤點範圍人類可讀，如「主零件倉 A 區」）| ❌ 缺 | derive from warehouse + bin filter，**不存** |
| **counter_label**（負責人）| derive from first_counter_id → users.email | 不存 |

→ 唯一需要決策：`count_type` typed 還是 metadata。

## 3. Domain Helper 規劃

檔案：`src/domain/count.ts`（**既有檔擴 append**）

### 新增

```ts
// list page 用 — 一次撈齊 rows + stats + lookup（warehouse / plan / counter）
export async function getCountOpsPageData(filter: {
  status?: "active" | "pending_approval" | "completed" | "all";
  warehouse_id?: string;
  q?: string;
}): Promise<{
  rows: CountOpsListRow[];        // ct + warehouse_name + plan_name + counter_label + progress%
  stats: CountOpsStats;            // 4 KPI: 進行中 / 待覆核 / 本月完成 / 平均準確率
  warehouses: { id: string; name: string }[];
  canEdit: boolean;
}>;

export interface CountOpsStats {
  in_progress: number;        // status IN ('counting','first_done','second_done')
  pending_approval: number;
  completed_this_month: number;
  accuracy_last_3: number | null;  // 1 - sum(|var|)/sum(total_lines) over last 3 completed
}

export interface CountOpsListRow extends CountRow {
  warehouse_name: string | null;
  plan_name: string | null;
  count_type_label: string | null;    // 從 plan_type / metadata.count_type 取
  counter_label: string | null;       // first_counter_id → users.email/display_name
  counted_lines: number;              // count(lines WHERE qty_final IS NOT NULL)
  progress_pct: number;                // counted_lines / total_lines * 100
}

// detail page 用
export async function getCountSessionById(id: string): Promise<{
  ct: CountOpsListRow;
  lines: Array<{
    id: string; line_no: number; item_id: string;
    item_code: string | null; item_name: string | null;
    bin_id: string | null; bin_label: string | null;
    qty_system: number; qty_first_count: number | null;
    qty_final: number | null; variance: number | null;
    variance_amount: number | null; status: string;
  }>;
} | null>;

// new page 用 — 撈 form 候選清單
export async function getNewCountSessionFormData(): Promise<{
  warehouses: { id: string; name: string }[];
  plans: { id: string; plan_name: string; warehouse_id: string; plan_type: string; abc_filter: string | null }[];
}>;
```

### 既有保留 / 移除

- `listInventoryCounts()` — 簡單版 list helper，**保留**但給孤兒掃描（新版改用 `getCountOpsPageData`）
- `listCountSessions` / `getCountSessionsPageData` — 給 `/parts/count/sessions` 用（不同路由），不動

### Server actions（既有不動、UI reuse）

- `startCountSessionAction` ✓
- `submitCountSessionAction` ✓
- `approveCountAdjustmentAction` ✓

需要補的：
- `cancelCountSessionAction(id)` — 取消尚未送審的 session（status IN ('counting','first_done')）：set status='cancelled'、清 lines
- （可選）`reopenCountSessionAction(id)` — 從 pending_approval 退回 counting 讓 user 修

### 內部實作策略

Day 1 直連 supabase（既有風格一致）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| startCountSession | 拍 stock_items 快照、INSERT counts + lines（**不寫庫存帳**）| ✅ 既有實作 |
| submitCountSession | UPDATE lines.qty_final + status='pending_approval' | ✅ 既有實作 |
| approveCountAdjustment | 1) reuse `createAdjustment` 寫 inventory_adjustments + 改 stock_items.qty<br>2) Engine `STOCK_ADJUSTMENT_GAIN/LOSS` auto-post journal_entries | ✅ 已串（commit 37f3c7c）|
| cancelCountSession（新）| DELETE lines / set count.status='cancelled' | 🆕 需實作 |

## 5. 會計事件分析（MANDATORY）

> 本功能會產生的會計事件：**0 個直接、2 個間接**

| # | 業務動作 | 對應 transaction_type code | 狀態 | 觸發位置 |
|---|---|---|---|---|
| 1 | 核准盤點且 variance > 0（盤盈）| `STOCK_ADJUSTMENT_GAIN` | ✅ 已 seed + 接 | `src/lib/parts/actions/index.ts → approveCountAdjustmentAction()` → `createAdjustment(...)` → engine |
| 2 | 核准盤點且 variance < 0（盤虧）| `STOCK_ADJUSTMENT_LOSS` | ✅ 已 seed + 接 | 同上 |

**本提案不新增 transaction_type**。會計接點已在 `createAdjustment` 內處理，本頁 UI 不需再寫 `instantiateTransaction`。

**不需要會計事件的場景**：
- startCountSession（拍快照）— 不寫庫存帳、無資金流
- submitCountSession（填首盤）— 還沒核准，無事件
- cancelCountSession — 取消、無事件

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 庫存盤點作業（list）| `/parts/operations/count-ops` | List View（KPI + DataGrid）| `parts/operations/consignment/_components/consignment-board.tsx` |
| 盤點單 detail | `/parts/operations/count-ops/[id]` | Page View（明細表 + CRUD pill）| `parts/operations/consignment/[id]/_components/consignment-detail-view.tsx` |
| 新建盤點 session | `/parts/operations/count-ops/new` | New Form | `parts/operations/consignment/new/_components/new-consignment-form.tsx` |

**List 視覺**（照 Stitch）：
- Header：「庫存盤點作業」+ chip `7.4` + caption「執行中的盤點任務管理・連結盤點計畫（8.1）與盤點處理（8.2）」
- 4 KPI cards：進行中盤點 / 待覆核 / 本月已完成 / 平均盤點準確率（最近 3 次）
- Filter Bar：status pill bucket（全部 / 進行中 / 待覆核 / 已完成）+ 倉庫 select + q 搜尋
- Toolbar：左「共 N 筆」、右 `[建立盤點 session]`（既有 `/parts/count/plans` 入口指引留個 ghost button 跳轉）+ DataGrid 內建 Excel 匯出
- DataGrid columns：盤點任務號 / 盤點類型 / 盤點範圍 / 負責人 / 應盤點 / 已盤點 / 進度（progress bar）/ 差異數 / 狀態 / 操作（[繼續][審核][差異報告]）

**Detail 視覺**：
- Breadcrumb + CRUD pill bar（view mode 5 顆：返回 / 新增 / 修改（鎖、本頁不直接改 ct 主檔）/ 刪除（僅 draft）/ 取消）
- Title card：ct_no + 狀態 chip + 倉庫 + plan + 負責人 + count_date
- 區段卡片 1：基本資料（warehouse / plan / count_date / counter / approver）
- 區段卡片 2：差異彙總（total_lines / variance_lines / variance_amount / progress%）
- Tab 1：明細（lines DataGrid — item_code / bin / qty_system / qty_first / qty_final / variance / variance_amount）
- Tab 2：時間線（snapshot_at / submitted_at / approved_at / status changes）
- 動作 pill 列（依 status 顯示）：
  - `counting / first_done` → `[提交首盤]` `[取消盤點]`
  - `pending_approval` → `[核准]` `[退回修改]`
  - `completed` → readonly

**New 視覺**：
- Form：倉庫 select（必填）、plan select（可選、選了會帶 abc_filter）、count_date（預設今天）、abc_class_filter select（可選 A/B/C/全部）、freeze_warehouse checkbox
- 提交 → `startCountSessionAction` → 成功 → `router.push('/parts/operations/count-ops/[新 ct_id]')`

## 7. nav_nodes（補 Ducati）

**目前狀態**：只有 Indian 有 `6a912557-...`（react_route ✓），**Ducati 缺**。

```sql
-- 先查 Ducati '庫存作業' parent
SELECT id FROM nav_nodes WHERE name='庫存作業' AND brand_id='ducati' AND level=2;
-- 取得 <ducati-parent>，sort_order 跟 Indian 的 2 對齊

INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES ('ducati', '<ducati-parent>', 3, 2, '庫存盤點作業', 'fact_check', '/parts/operations/count-ops', 'react_route', true, false);
```

Indian 既有 nav_node 不動。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 改寫 | `src/app/(workspace)/parts/operations/count-ops/page.tsx`（server，撈 data 傳給 board）|
| 新增 | `src/app/(workspace)/parts/operations/count-ops/_components/count-ops-board.tsx`（client）|
| 新增 | `src/app/(workspace)/parts/operations/count-ops/[id]/page.tsx` |
| 新增 | `src/app/(workspace)/parts/operations/count-ops/[id]/_components/count-session-detail-view.tsx` |
| 新增 | `src/app/(workspace)/parts/operations/count-ops/new/page.tsx` |
| 新增 | `src/app/(workspace)/parts/operations/count-ops/new/_components/new-count-session-form.tsx` |
| 擴 | `src/domain/count.ts`（append `getCountOpsPageData`、`getCountSessionById`、`getNewCountSessionFormData`） |
| 新增（可選）| `src/lib/parts/actions/cancel-count-action.ts`（看開放問題 §10）|
| 新增 | `src/domain/count.constants.ts`（status label / count_type label / pill 配色 — Next 16 "use server" 拆檔，**避免再踩天條**）|
| SQL | 雙 brand nav_nodes Ducati 補 1 筆 |

## 9. Verification（落地完手測）

1. **Helper 紀律 audit**：`grep -rn "@/lib/supabase" "src/app/(workspace)/parts/operations/count-ops"` = 0 hit
2. **tsc / eslint** 0 errors
3. **List 互動**：篩 status pill / 篩倉庫 / 排序 / 欄位選擇器 / Excel 匯出
4. **New flow**：選倉 + plan → 建 session → `router.push` 跳 detail、新 ct 出現在 list 進行中 bucket
5. **Detail flow**：counting → 提交首盤 → status=pending_approval → 核准 → status=completed、查 `inventory_adjustments` 有新增、查 `journal_entries` 自動 post（STOCK_ADJUSTMENT_GAIN/LOSS）
6. **取消**：counting 取消 → status='cancelled'、lines 清掉、UI list 從進行中消失
7. **KPI**：4 卡數字跟 SQL count 對得起來（accuracy_last_3 用 3 筆最新 completed）
8. **nav_nodes**：切 Ducati brand 也看得到該入口、不打 404
9. **權限**：無 `COUNT_VIEW` 看不到頁、無 `COUNT_EXECUTE` 看不到 [建立 session] / [提交] / [核准]

## 10. 開放問題（Stage 3 拍板）

1. **`count_type` 落腳** — A 類全盤 / 月度例盤 / 抽盤 / 動態盤 這欄要：
   - (A) typed column on `inventory_counts.count_type text NOT NULL DEFAULT 'manual'`（推薦：會被 filter 用、會被 KPI 拆分）
   - (B) metadata.count_type（先 jsonb、未來 promote）
   - (C) 完全 derive from `plan_id → plans.plan_type`（無 plan 時 fallback 'manual'）

2. **「待開始」bucket 對映** — 設計稿有「待開始盤點」KPI，但 DB 沒有對應 status。建議：
   - (A) 改 label 成「待覆核」對 `pending_approval`（推薦，貼近實際狀態機）
   - (B) 引入 `inventory_count_plans` 的 `next_run_at <= today AND last_run_at IS NULL` 算成「待開始」（混兩張表、KPI 較複雜）

3. **取消 session UX** — 建議走：
   - (A) Detail 頁 `[取消盤點]` button（只在 status='counting'/'first_done' 顯示）→ 寫 `cancelCountSessionAction`
   - (B) List 列尾 [取消] 也加（同 server action）
   - 兩個都要嗎？只 detail 就夠？

4. **Plan 整合深度** — `/parts/count/plans` 是已存在的計畫頁，本頁的 [建立盤點 session] 是否：
   - (A) 純獨立 form（不選 plan 也能建）
   - (B) 必須先選 plan、依 plan.abc_filter / warehouse 鎖死選擇（推薦：跟設計稿 toolbar 「建立盤點計畫」+ 「執行條碼盤點」分工一致）
   - (C) 兩個並存（form 內 plan select 可空）

5. **Ducati 補 nav 後 demo 資料**：要不要也補 Ducati 的 inventory_counts seed（4 筆模擬）？還是維持「Indian 才測試」？（依 CLAUDE.md「Demo 資料一律 Indian」應該不補。）
