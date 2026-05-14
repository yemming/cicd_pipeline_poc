# 提案：客服功能導覽總覽（CRM00）

> 來源：nav_node `d1746283-a79c-40bb-831d-96cefd99541a`（Indian brand · static_html · `客服功能導覽`）
> Stitch URL：`http://43.153.159.135:3000/n/d1746283-a79c-40bb-831d-96cefd99541a`（跳 /login，HTML 從 Supabase Storage `nav-html/indian/d1746283-...body.html` 直抓）
> 兄弟頁 #1：`/sales/overview`（RS00）— 同模式、可參考的 canonical 範本
> 日期：2026-05-14
> 階段：架構提案（spec-to-feature subagent 自決拍板）

## 1. 結構摘要

「CRM00 客服管理模組 導覽總覽 v2」是一張**純靜態導覽 dashboard**，給經銷商銷售顧問 / 服務顧問 / 店長快速跳到 CRM A 系列 (銷售側) 7 支 + B 系列 (售後側) 6 支 + 共用模組 2 支共 15 個模組。內容結構：

- **Hero header**：CRM 模組總覽標語 + 4 個 stat（15 CRM / 7 銷售側 / 6 售後側 / ✅）
- **4 個 KPI 卡片**：銷售側 A 系列 7、售後側 B 系列 6、店長報表 1、跨部門串接點 13
- **3 個 tabs**（比 RS00 少「設計原則」）：
  1. **模組總覽** — 3 個 panel（銷售側 A 系列 / 售後側 B 系列 / 店長跨部門報表），每個 panel 內含 3-col module card grid + layer subtitle
  2. **串接關係** — 13 條 RS↔CRM↔SA 串接明細表
  3. **檔案清單** — 15 個模組檔案的版本/狀態/說明

**沒有任何 CRUD、沒有 DB 寫入、沒有副作用、沒有會計事件**。所有資料皆為內建元資料。

## 2. Schema 草案

**無 DB 變更**。所有資料硬編在 `src/domain/customer-service-overview.constants.ts`，理由跟 RS00 相同：
- 模組清單是「系統定義」、不是用戶資料
- 14 張兄弟頁批次落地，當靜態元資料一起 ship 是最低風險路徑
- 之後要動再升級成 `customer_service_module_registry` table

## 3. Domain Helper 規劃

```ts
// src/domain/customer-service-overview.ts (server-only, async fn)
export async function getCustomerServiceOverview(): Promise<CustomerServiceOverviewData>

// src/domain/customer-service-overview.constants.ts (純 type + const)
export type CsModuleAccent / CsModuleCard / CsModulePanel / CsModuleConnection / CsModuleFile
export const CS_OVERVIEW_HERO / CS_OVERVIEW_KPIS / CS_OVERVIEW_PANELS / CS_OVERVIEW_CONNECTIONS / CS_MODULE_FILES
```

實作策略：Day 1 hardcoded constants（同 RS00），未來改 DB-driven 不動 UI。

## 4. 副作用清單

無。純展示頁、僅 useState 控制 tab 切換 + toast。

## 5. 會計事件分析

**無 — 本功能屬於純資料展示 / 純查詢、不產生資金流。**

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 客服功能導覽 | `/customer-service/overview` | Dashboard (single page) | `src/app/(workspace)/sales/overview/_components/sales-overview-board.tsx` |

骨架元件 1:1 reuse RS00：Hero / KPI row / Tab bar / PanelHeader / PanelBlock / ModuleCard / Toast。差異：
- 無 ConnectionsFlowChart SVG（CRM00 原 HTML 也沒這個區塊，只用明細表）
- 無 principles tab
- Hero 配色保留 navy→red gradient（CRM 設計稿也用 DUCATI 主色）

## 7. nav_nodes 處置

**只動 Indian 一筆**（這 node 只在 Indian brand 存在；parent 是 Indian-only 的「DUCATI 銷售與客服模組導覽」）：

```sql
UPDATE nav_nodes
   SET page_kind = 'react_route',
       href      = '/customer-service/overview'
 WHERE id = 'd1746283-a79c-40bb-831d-96cefd99541a';
```

`html_storage_path` 保留當歷史檔（skill 階段 4 規定）。

## 8. Critical Files

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/customer-service-overview.constants.ts` |
| 新增 | `src/domain/customer-service-overview.ts` |
| 新增 | `src/app/(workspace)/customer-service/overview/page.tsx` |
| 新增 | `src/app/(workspace)/customer-service/overview/_components/cs-overview-board.tsx` |
| 修改 | `nav_nodes`（UPDATE 1 筆 indian node） |

## 9. Verification

1. 進 `/customer-service/overview` 看到 hero / 4 KPI / 3 tabs
2. tab 切換正常、toast 顯示
3. 15 個模組卡片渲染對應 accent / version badge
4. 串接表 13 筆、檔案表 15 筆
5. `grep -rn "@/lib/supabase" src/app/\(workspace\)/customer-service src/domain/customer-service-overview*` 必須 0 hit
6. tsc + eslint 0 errors
7. Sidebar 進這個 node 從 HTML 變 REACT 入口

## 10. 已自決開放問題（spec-to-feature subagent 預設拍板）

- [x] 路由命名 → `/customer-service/overview`（不擠進 `/sales`；CRM 是平行模組，未來 customer-service 底下還會有 CRM01A~07）
- [x] 只動 Indian 單筆 nav_node（parent 也是 Indian-only）
- [x] 不重用 `sales-overview.constants.ts` 的 types（CRM 未來會獨立演化，先拷一份）
- [x] 移除 principles tab、移除 SVG flow chart（CRM00 HTML 沒這兩塊）
