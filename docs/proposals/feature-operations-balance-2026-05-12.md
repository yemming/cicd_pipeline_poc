# 提案：庫存查詢（/parts/operations/balance）

> 來源：http://43.153.159.135:3000/parts/operations/balance（既有頁面升 design pattern）
> 日期：2026-05-12
> 階段：架構提案（待 Ming 拍板）

## 1. 結構摘要

商品庫存即時聚合查詢 — 把 `stock_items` 表（每筆 = 一個 serial/batch 實體）依 (brand, item, warehouse) 群組成 board，列出每組的總庫存量、各 status 拆分。供採購 / 倉管 / 維修在收 / 領 / 調撥前 quick check。

頁面已存在但是舊架構：手刻 `<table>`、孤兒 `balance-filters.tsx` 沒接上、helper 已合天條但 UI 沒套 DataGrid、Phase 2 `querySerialNo` helper 已寫好但無 UI。本提案做 list-view design pattern 升級 + 補序列號查詢 UI。

## 2. Schema 草案

**不動 schema**。`stock_items` / `items` / `warehouses` 三張表既有欄位已足夠：

- `stock_items.{item_id, warehouse_id, qty, status, serial_no, batch_no, source_receipt_line_id, source_transfer_line_id, last_movement_at}`
- `items.{code, name, control_type}`（control_type = 管控等級 A/B/C/D）
- `warehouses.{id, name}`

不新增欄位、不 promote jsonb metadata。

## 3. Domain Helper 規劃

檔案：`src/domain/stock.ts`（**既有檔 append + 擴 signature**）

```ts
// 已存在、擴 signature 加 warehouse_id + control_type
export async function listStockBalance(filter: {
  q?: string;
  warehouse_id?: string;
  control_type?: string;   // ← 新增
  status?: string;         // ← 新增（on_hand/reserved/issued/damaged）
}): Promise<StockBalanceRow[]>

// 已存在、擴回傳加 warehouses 候選清單給 filter
export async function getStockBalancePageData(filter: {
  q?: string;
  warehouse_id?: string;
  control_type?: string;
  status?: string;
}): Promise<{
  rows: StockBalanceRow[];
  canEdit: boolean;
  warehouses: Array<{ id: string; code: string | null; name: string }>;  // ← 新增
}>

// 已存在、不動
export async function querySerialNo(serialNo: string): Promise<SerialTraceResult>
```

`StockBalanceRow` 加 `control_type` 欄位（從 `items` join 帶出來給 UI 顯 chip + 排序）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| listStockBalance | 純查、無副作用 | ✓ |
| querySerialNo | 純查、無副作用 | ✓ |

無寫入動作、無 LINE 通知、無 audit log。

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 庫存查詢 list | `/parts/operations/balance` | List View | `parts/setup/items/_components/items-board.tsx` |
| 序列號查詢 | **見 §9 開放問題 Q1** — modal vs sub-route | — | — |

**無新建 detail page**：每列是 (item, warehouse) 聚合、料號點下去走既有 `/parts/setup/items/[id]`（design pattern §邊界「純資訊頁」例外，list-only 配 readonly KV detail = items detail page 本身）。

## 6. nav_nodes

**不動**：路徑 `/parts/operations/balance` 不變、nav_node 已存在且 `page_kind='react_route'`。

## 7. 頁面結構（升 design pattern 對齊）

依 §Design Pattern §List View 規格的 5 層：

```
1. Page Header     ─ 商品庫存查詢 + 7.0 chip + 副標
2. KPI 卡片（保留）─ 不重複料號 / 總庫存件數 / 行數 — 3 卡 grid
3. Filter Bar      ─ 商品搜尋 + 倉庫 + 管控等級 + 狀態 + [查詢][重置][🔍 序列號查詢]
4. Toolbar         ─ 「共 X 筆，顯示 Y 筆」（DataGrid 自帶 Excel 匯出 / 欄位選擇器）
5. DataGrid        ─ 取代手刻 <table>
```

### DataGrid columns

| id | header | 寬 | 排序 | inline edit | 備註 |
|---|---|---|---|---|---|
| item_code | 料號 | 130 | ✓ | ✗ | font-mono、深藍粗體、點擊 Link → /parts/setup/items/[id] |
| item_name | 品名 | auto | ✓ | ✗ | |
| control_type | 管控 | 80 | ✓ | ✗ | chip A 紅 / B 黃 / C 綠 / D 藍（design pattern 規格 token） |
| warehouse_name | 倉庫 | 120 | ✓ | ✗ | |
| on_hand_qty | 數量 | 90 | ✓ | ✗ | right-align、font-mono |
| status_breakdown | 狀態組成 | 200 | ✗ | ✗ | chip 串 在庫:N 保留:N 已發:N 損壞:N |

`persistKey="parts/operations/balance"`，**不傳 onImport**（純查、不准匯入改庫存）。

### Filter 欄位

```
[商品搜尋: 代碼或名稱⋯⋯]  [倉庫▼]  [管控等級▼: 全部/A/B/C/D]  [狀態▼: 全部/在庫/保留/已發/損壞]
                                                          [查詢] [重置] [🔍 序列號查詢]
```

### KPI 卡保留與否？

設計 pattern §List View 規格沒明寫 KPI block，但庫存查詢這類查詢頁有 3 個聚合數很實用。**Stage 3 拍板**（保留 / 拆掉 / 改進 toolbar 文字）。

## 8. Verification（落地完手測）

1. `/parts/operations/balance` 顯示既有資料、KPI 卡計算正確
2. 4 個 filter 條件單測 + 組合測都能 narrow rows
3. DataGrid column visibility 切換、Excel 匯出能下載
4. 序列號查詢（看 Q1 拍板形式） — 輸入 `SN-XXX` 能查到當前位置 + 軌跡（若資料庫有 fixture）
5. 點料號 → 跳 `/parts/setup/items/[id]` 詳情頁
6. `npx tsc --noEmit` + `npx eslint src/app/(workspace)/parts/operations/balance src/domain/stock.ts`
7. 天條 audit `grep -rn "@/lib/supabase" src/app/(workspace)/parts/operations/balance src/components` = 0
8. Playwright smoke `pw-smoke-balance.mjs` — list 頁 + 序列號查詢頁（若獨立 route）

## 9. 開放問題（Stage 3 拍板）

- **Q1 序列號查詢 UI 形態**：(a) Filter Bar 上的 button → 開 Modal（小流量、不污染 list URL） / (b) 獨立 sub-route `/parts/operations/balance/serial`（可分享 URL、方便深 link） / (c) Tab 切換（balance list / serial trace 同一頁切換）
- **Q2 KPI 卡保留**：(a) 保留 3 卡（不重複料號 / 總庫存件數 / 行數） / (b) 拆掉、改 Toolbar 文字「共 X 筆，料號 Y 個，總件數 Z」 / (c) 保留 + 加第 4 卡（低庫存告警 / ABC 分布等）
- **Q3 列表預設範圍**：(a) 預設只顯示 `qty > 0` 的（過濾零庫存實用查詢） / (b) 顯示全部 row（含 status=issued、qty=0 殘留）
- **Q4 分頁**：`listStockBalance` 用 `.limit(2000)` 硬上限。若 master data 累積 > 2000 rows 會切掉。是否現在就上 server-side pagination？(a) 現在補 / (b) 暫不補、限 2000 撐到問題出現

## 10. 不動 / 邊界

- 不刪 `balance-filters.tsx`（孤兒元件、Stage 5 清孤兒時處理）
- 不動 `querySerialNo` helper 內部邏輯（已寫好的 Phase 2 拼軌跡邏輯）
- 不動 nav_nodes
- 不改 stock_items DB schema
- 不加業務副作用（純查詢頁）
