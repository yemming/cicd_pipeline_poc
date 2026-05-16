# 提案：/parts home v2 圖卡式導覽

> 來源：docs/DUCATI_v2_output/04_庫存管理/01_基礎設定/00_庫存管理模組_導覽總覽.html + 00_庫存管理模組_流程關係圖.html
> 日期：2026-05-16
> 階段：架構提案（落地中 — Phase 3C D1.1）

## 1. 結構摘要

把 `/parts` 模組首頁從「fs-read Stitch HTML inline」升級成 v2 圖卡式 `<ModuleHomeGallery>`，與 `/sales`、`/crm`、`/service`、`/parts/aftersales` 同一套規格。Hero banner + KPI row + 9 個 panel section，每 panel 列既有現役 route 卡（共 52 卡，覆蓋規格 30 支 HTML 全集 + 既有路由）。

## 2. Schema 草案

無 — 純前端 home page，不動 DB。

## 3. Domain Helper 規劃

無 — home 是 static layout，不撈資料。

## 4. 副作用清單

無。純 layout 替換。

## 5. 會計事件分析

無 — home 是純導覽頁、不產生資金 / 庫存 / 業務動作。

## 6. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 |
|---|---|---|---|
| 庫存管理首頁 | /parts | Module Home (Gallery) | src/app/(workspace)/sales/page.tsx |

實作要點：
- `"use client"` + `useSetPageHeader({ title: "庫存管理", breadcrumb: [{ label: "庫存管理" }] })`
- 拷貝 sales/page.tsx 結構、改 HERO / KPIS / PANELS
- 9 個 PANELS 對應規格 7 GROUP 的展開（B 拆成 採購/入庫/出庫 = 3 區）

## 7. 9 區 PANELS 結構

| # | Panel | tone | 卡數 | 對應規格 GROUP | 對應現有 route 前綴 |
|---|---|---|---|---|---|
| 1 | 基礎設定 | blue | 14 | GROUP A · 1.x/2.x/3.x | /parts/setup/* |
| 2 | 採購管理 | navy | 5 | GROUP B · 4.x | /parts/purchase/* |
| 3 | 入庫管理 | teal | 4 | GROUP B · 5.x | /parts/receipt/* |
| 4 | 出庫管理 | teal | 3 | GROUP B · 6.x | /parts/issue/* |
| 5 | 庫存作業 | blue | 7 | GROUP C · 7.x | /parts/operations/*, /parts/setup/items |
| 6 | 盤點管理 | navy | 3 | GROUP D · 8.x | /parts/count/* |
| 7 | 預警告警 | blue | 5 | GROUP E · 10.x | /parts/alerts/* |
| 8 | 保固索賠舊件 | navy | 6 | GROUP F · 11.x | /parts/warranty/* |
| 9 | 分析報表 | blue | 5 | GROUP G · 12.x | /parts/analytics/* |

## 8. nav_nodes

無變更 — `/parts` 為現役 react_route，本任務只是 page 內容升級。

## 9. Critical Files

| 動作 | 路徑 |
|---|---|
| 改寫 | src/app/(workspace)/parts/page.tsx |
| 新增 | scripts/verify-parts-home.mjs |

## 10. Verification

1. status 200、H1「庫存管理」（topbar）、Hero「DUCATI 庫存管理模組」
2. KPI row 顯示 4 張、Panels 顯示 9 區
3. 每區 layer 標題正確、卡 code（如 SETUP01、PUR01 ...）顯示
4. 截圖 /tmp/parts-home-verify.png
5. tsc / eslint 0 errors
6. grep audit @/lib/supabase 在 parts/page.tsx 0 hit
