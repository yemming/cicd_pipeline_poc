# 提案：RS_M2 業績報表（銷售管理 / 主管視角）

> 來源：nav_node `6c385e0a-a0b2-46de-a25c-b9dc396c3170` (Indian / 銷售管理 / 業績報表)
> HTML：`indian/6c385e0a-a0b2-46de-a25c-b9dc396c3170.body.html` (Supabase Storage `nav-html`)
> 日期：2026-05-14
> 階段：架構提案（已自決拍板，批次工項 #4/14）

## 1. 結構摘要

主管視角的業績儀表板。三層 KPI 結構（結果 / 過程 / 行為）+ 損益平衡進度 + 月趨勢 + RS 個人排行 + 車系分析 + 週趨勢 + 財務預留。**純 read-only dashboard**，所有資料 mock，無 CRUD、無 DB 寫入、無會計事件。

跟 RS_M1 銷售漏斗（`/sales/manager/funnel`）為兄弟頁：funnel 是「漏斗轉化率」視角，本頁是「業績達成 / 損益平衡」視角。

## 2. Schema 草案

無 schema 變更。

Phase 1 全部 mock constants（跟 RS_M1 同策略）。Phase 2 接：
- `sales_metrics_monthly` view（Layer 1/2/3 KPI 月度聚合）
- `kpi_targets` 表（已在 RS_M1 規劃過）
- `sales_orders` / `vehicle_deliveries` / `customer_visits`（已存在的 transactional 表）
- `vehicle_models` 表（已存在）

## 3. Domain Helper 規劃

- 檔案：`src/domain/sales-manager-report.ts` + `src/domain/sales-manager-report.constants.ts`
- 簽名：

```ts
export async function getSalesManagerReportData(): Promise<SalesManagerReportData>;
```

內部實作（Phase 1）：直接 return constants 組成的物件，跟 `sales-manager-funnel.ts` 同 pattern。

## 4. 副作用清單

無。

## 5. 會計事件分析

**無** — 本頁是純查詢 / 報表展示，不產生資金流。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 業績報表 | `/sales/manager/sales-report` | Dashboard | `sales/manager/funnel/_components/sales-manager-funnel-board.tsx` |

不適用 §Design Pattern 的 List View + Page View（dashboard 類，沒 CRUD entity）。沿用兄弟頁 funnel 的 dashboard 骨架。

## 7. nav_nodes（更新既有節點）

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/sales/manager/sales-report'
 WHERE id = '6c385e0a-a0b2-46de-a25c-b9dc396c3170';
-- 只動 Indian brand（這個節點只在 Indian 存在）
-- html_storage_path 保留當歷史檔
```

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/sales-manager-report.constants.ts` |
| 新增 | `src/domain/sales-manager-report.ts` |
| 新增 | `src/app/(workspace)/sales/manager/sales-report/page.tsx` |
| 新增 | `src/app/(workspace)/sales/manager/sales-report/_components/sales-manager-report-board.tsx` |
| 更新 | `nav_nodes` (UPDATE 1 row) |

## 9. Verification

1. `npx tsc --noEmit` 0 errors
2. `npx eslint <touched>` 0 errors
3. `grep -rn "@/lib/supabase" <touched UI>` 0 hits
4. Playwright CLI 開 `/sales/manager/sales-report` 截圖、檢查關鍵 element（layer titles、kpi cards、bep panel、rs ranking table、model grid）

## 10. 自決決策（批次模式預先授權）

- ✅ Phase 1 走 mock constants（與兄弟頁 funnel 對齊）
- ✅ 路徑 `/sales/manager/sales-report`（鄰居 funnel 已用 `/sales/manager/funnel`）
- ✅ Domain module 命名 `sales-manager-report`
- ✅ 期間 / 人員 filter 用 local state（client-side），無 URL 同步（dashboard 不需要分享 URL state）
- ✅ 「匯出 Excel」/「列印」按鈕保留視覺、Phase 1 用 toast 提示尚未實作（跟 HTML 一致）
- ✅ 跨頁按鈕（返回總覽 / 漏斗看板 / 主管設定）改用實際 Link 連到對應路由 (`/sales/overview`、`/sales/manager/funnel`)；主管設定路由暫無對應頁面改成 toast 提示
