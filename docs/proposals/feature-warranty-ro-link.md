# 提案：保固索賠 — 與 RO 工單串接設定（11.5）

> 來源：`docs/DUCATI_庫存管理模組_串接版_20260510_最新版/11_保固索賠_RO工單串接.html`
> 日期：2026-05-11
> 階段：架構提案（user 已預先批准，直接進落地）

## 1. 結構摘要

DMS（Dealer Management System）↔ DealerOS 庫存的串接設定頁。三大區塊：
1. 串接系統設定卡（DMS 連線狀態 + 5 個同步欄位 toggle + 同步頻率）
2. 保固觸發規則卡（VIN/料件/人為 3 條條件展示 + fallback 動作 + 到期告警天數）
3. 近期 RO-保固串接記錄表（demo data，含手動驗證動作）

這是 **Setting Page + Records Table**（不是標準 List/Detail），單頁兩半 + 表格。

## 2. Schema 草案

### 既有表 — 不動 DDL

兩張表已存在（前 session 落地過）：

- `parts_warranty_ro_link_config`（PK = brand_id，brand-singleton 設定）
- `parts_warranty_ro_link_records`（多筆 RO demo 記錄）

欄位完整對得上規格，**本次不改 schema**。

### 欄位分類（typed vs jsonb）

| 欄位 | 落腳 | 理由 |
|---|---|---|
| brand_id / sync_* / sync_frequency / fallback_action / expiry_alert_days | typed | 結構穩、會被 UI 直接讀寫 |
| dms_label / dms_endpoint | typed | 規格直接展示 |
| ro_no / vin / model / warranty_type / sync_status / out_no / claim_no | typed | 表格欄位、會排序 |
| metadata jsonb | jsonb | 預留（未來放最後驗證時間、webhook payload snapshot） |

## 3. Domain Helper 規劃

檔案：`src/domain/warranty.ts`（既有，append RO link 函式）

```ts
// RO link section
export type RoLinkConfigRow = ...
export type RoLinkRecordRow = ...
export type RoLinkConfigPatch = { ... }

export async function getRoLinkConfig(): Promise<RoLinkConfigRow | null>
export async function listRoLinkRecords(): Promise<RoLinkRecordRow[]>
export async function updateRoLinkConfig(patch: RoLinkConfigPatch): Promise<ActionResult<{ brand_id: string }>>
export async function verifyRoLinkRecord(id: string): Promise<ActionResult<{ id: string }>>
export async function testRoLinkConnection(): Promise<ActionResult<{ latencyMs: number }>>
```

實作策略：直連 supabase（POC Day 1）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| updateRoLinkConfig | 寫 parts_warranty_ro_link_config | 確定 |
| verifyRoLinkRecord | 寫 parts_warranty_ro_link_records.sync_status | 確定 |
| testRoLinkConnection | 純模擬（無外部呼叫） | 確定 — POC 不接真實 DMS |
| 未來：sync_estimate toggle 開啟 | 應該觸發 cost-recovery 模組事件 | [需確認，本次不做] |

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| RO 工單串接設定 | /parts/warranty/ro-link | Setting Page + Table | 自定（單頁兩半 + DataGrid 表格） |

沒有 detail page，這頁是設定頁性質（user 拍板邊界內：純資訊 + setting）。

## 6. nav_nodes（補 ducati 那筆）

```sql
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
SELECT 'ducati', parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon
FROM nav_nodes WHERE id = 'b05be608-f7fe-4784-836e-70d5734e67e7'
ON CONFLICT DO NOTHING;
```

（或直接 hard-code 對應的 ducati parent）

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 修改 | `src/domain/warranty.ts`（append RO link helper） |
| 修改 | `src/app/(workspace)/parts/warranty/ro-link/page.tsx`（移除直連 supabase） |
| 修改 | `src/app/(workspace)/parts/warranty/ro-link/_components/ro-link-board.tsx`（套 design pattern + DataGrid） |
| 刪除 | `src/lib/parts-setup/warranty-ro-link-actions.ts`（孤兒；功能遷到 domain helper） |
| 新增 nav_node | ducati 補一筆 |

## 8. Verification

1. UI 不能 import `@/lib/supabase/*`
2. 表格用 `<DataGrid>`
3. 色碼 / 字級照 §Design Pattern
4. pending 鎖 UI + 文字換進行式
5. tsc --noEmit 0 errors / eslint 0 errors
6. 雙 brand sidebar 都看得到入口

## 9. 已批准項目（user 預先授權，直接進落地）

- typed/jsonb 分配照表
- 直接刪舊 server actions 檔（0 caller 後）
- 補 ducati nav_node
- 不開新 detail page（setting + table 性質）
