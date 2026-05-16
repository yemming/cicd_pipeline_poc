# 提案：報損報溢審核 (/parts/count/loss-overflow)

> 來源：`docs/DUCATI_v2_output/04_庫存管理/06_盤點管理/08_盤點管理_報損報溢.html`
> 日期：2026-05-16
> 階段：架構提案（已自動拍板 — 跑單 agent 模式）

## 1. 結構摘要

盤點審批流程「第 4 站」：盤點處理產出差異 → 系統計算差異 → **財務主管確認損溢單** → 庫存帳面正式更新。
跟 `/parts/count/adjustments` 看的同一批 row（`inventory_counts` 差異 session），但視角是「正式損溢單 LG-*」的審批狀態 — draft / review / done / reject 四態，不重複建表。

## 2. Schema 草案

**不新增表**。Reuse `inventory_counts` + `count_lines`。

- LG 單號用 `ct_no` 衍生展示（前端 mapping，不落 DB）：`LG-{count_date}-{seq}` ← 不存 DB、視覺呈現
- LG status mapping（client side）：
  - `first_done` / `second_done` → `draft`（剛從盤點處理帶過來、未提交審批）
  - `pending_approval` → `review`（待財務審批）
  - `completed` → `done`（審批通過、帳面已調整）
  - `cancelled` → `reject`（駁回）

## 3. Domain Helper 規劃

檔案：`src/domain/count.ts`（append）

```ts
// 報損報溢審核 list 視角（reuse adjustments 過濾邏輯，但展示維度改成 LG 單）
export async function getCountLossOverflowPageData(filter: {
  status?: string;            // LG status: draft | review | done | reject
  q?: string;                 // 來源盤點單號關鍵字
  warehouse_id?: string;
}): Promise<{
  rows: CountSessionListRow[];  // 仍用 CountSessionListRow，client 端做 LG view 轉換
  warehouses: { id: string; name: string; code: string }[];
  canEdit: boolean;             // PERMISSIONS.COUNT_ADJUST
}>
```

## 4. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| 進列表 | 純讀 | ✅ |
| 點查看 | 連到 `/parts/count/adjustments/{id}` reuse | ✅ |
| 審批通過 / 駁回 | **本頁不暴露 mutation**，導去 adjustments detail 操作 | ✅ |

## 5. 會計事件分析

無 — 本功能屬於**純查詢視角**，loss/gain 過帳邏輯在 adjustments approve 流程裡（既有 `STOCK_ADJUSTMENT` engine）。本頁只列單、點進去走既有路徑。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 報損報溢審核 | /parts/count/loss-overflow | List View | parts/count/adjustments/_components/count-adjustments-board.tsx |

## 7. nav_nodes（Indian placeholder → react_route）

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route',
       coming_soon = false
 WHERE id = 'e5ae4744-2dc3-482b-acbe-ff9ea2c5bc51';
```

Ducati 未開 placeholder（其 nav 同名節點仍指 adjustments），本任務不動。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | src/domain/count.ts（append `getCountLossOverflowPageData`、LG status helper） |
| 新增 | src/app/(workspace)/parts/count/loss-overflow/page.tsx |
| 新增 | src/app/(workspace)/parts/count/loss-overflow/_components/loss-overflow-board.tsx |
| UPDATE | nav_nodes (Indian) |
| 新增 | scripts/verify-parts-count-loss-overflow.mjs |

## 9. Verification

1. /parts/count/loss-overflow status 200
2. H1「報損報溢審核」、Sprint chip「庫存 · 8.3」、Caption 含「財務主管確認損溢單」
3. Filter Bar 含倉庫 / 審批狀態（4 態）/ 來源盤點單關鍵字
4. DataGrid 渲染至少 1 row（demo Indian）
5. 點 row 連到 `/parts/count/adjustments/{id}`
6. tsc / eslint 0 errors
7. grep `@/lib/supabase` on loss-overflow 目錄 = 0 hit
