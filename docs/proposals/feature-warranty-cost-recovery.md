# 提案：保固索賠 — 索賠費用回收追蹤（11.6）

> 來源：`docs/DUCATI_庫存管理模組_串接版_20260510_最新版/11_保固索賠_費用回收.html`
> 日期：2026-05-11
> 階段：架構提案（user 已預先批准，直接進階段 4）

## 1. 結構摘要

DealerOS 客戶（經銷商）追蹤每張保固索賠單的「申請 → 審核 → 核准 → 收款」流程；UI 顯示 4 KPI、列表（含狀態 chip + 操作）、自動化設定（提醒 / 成本沖銷 / 月結報告）。費用回收屬保固模組 11.6。

## 2. Schema 草案

DB 已存在（前 session 已 apply）— 本次**不動 schema**：

- `parts_warranty_claims` — 索賠單列表（typed: claim_no, ro_no, item_label, hours_label, warranty_type, apply_amount, approved_amount, status, status_label, expected_pay_date, sort_order；metadata jsonb 保留）
- `parts_warranty_cost_recovery_config` — 自動化設定（每 brand 一筆，6 個 boolean flag）

RLS：`user_has_brand(brand_id)` 兩張表都已配妥。

### 欄位分類

| 欄位 | 落腳 | 理由 |
|---|---|---|
| claim_no / ro_no / item_label / amounts / status / expected_pay_date | typed | 列表必查 / 排序 / 篩選 |
| status_label | typed | UI 直接顯示，避免每次再 map |
| 6 個 config flag | typed | 設定頁直接 binding |
| 未來「申訴內容、附件 url、財務憑證 url」 | metadata jsonb | 之後再升 typed |

## 3. Domain Helper 規劃

把 cost-recovery 函式塞進現有 `src/domain/warranty.ts`（同模組）。

```ts
// src/domain/warranty.ts
export type CostRecoveryConfig = { ... };
export type ClaimRow = { ... };
export type CostRecoveryStats = { pending, paid, reviewing, rejected };
export type ClaimsFilter = { status?, warranty_type?, month?, keyword? };

export async function getCostRecoveryPageData(filter): Promise<{
  config, claims, stats, canEdit
}>
export async function updateCostRecoveryConfig(patch): Promise<ActionResult<...>>
export async function markClaimPaid(id): Promise<ActionResult<...>>
```

Day 1：helper 內部 supabase 直連（與既有 warranty.ts 同模式）。

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| markClaimPaid | 改 row status + expected_pay_date | 確定 |
| markClaimPaid → auto_settle_cost on | 沖銷零件暫估成本（跨模組） | POC 不做，留 TODO |
| markClaimPaid → sync_finance_system on | 推財務系統 | POC 不做 |
| updateCostRecoveryConfig | 改 row | 確定 |

## 5. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 索賠費用回收追蹤 | `/parts/warranty/cost-recovery` | List + Setting | 沿用既有，改 DataGrid + 拆 domain helper |

## 6. nav_nodes

Indian 已有 sort_order=5（OK）。**Ducati 缺**：

```sql
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES ('ducati', '0e7e8483-e047-4a27-b6d0-2043cf6fc15b', 3, 5, '索賠費用回收追蹤', 'paid', '/parts/warranty/cost-recovery', 'react_route', true, false);
```

## 7. Critical Files

| 動作 | 路徑 |
|---|---|
| 修改 | `src/domain/warranty.ts`（追加 cost-recovery 段） |
| 修改 | `src/app/(workspace)/parts/warranty/cost-recovery/page.tsx`（改走 domain helper） |
| 修改 | `src/app/(workspace)/parts/warranty/cost-recovery/_components/cost-recovery-board.tsx`（DataGrid + filter） |
| 移除 | `src/lib/parts-setup/cost-recovery-actions.ts`（功能合入 domain） |
| 新增 SQL | nav_nodes ducati 一筆 |

## 8. Verification

1. tsc --noEmit 0 errors
2. eslint touched paths 0 errors
3. UI 不再 import `@/lib/supabase/*`
4. cost-recovery-actions.ts callers = 0 後刪除
5. 雙 brand 都看得到 nav 入口
6. 標記已收款後資料變化、自動 banner 2.2s 消失

## 9. 已知 TODO

- `auto_settle_cost` / `sync_finance_system` 實際串接（POC 不做）
- 查看 / 憑證 / 申訴 button 流程（POC alert 替代）
