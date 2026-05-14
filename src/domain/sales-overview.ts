/**
 * 銷售模組導覽總覽 helper — server-only。
 *
 * 對應 nav_node 2e029972-042a-495f-b610-8c0775cb572e（Indian / 銷售模組導覽 RS00 v4）。
 * 全部資料目前為靜態元資料(模組目錄、串接關係、原則、檔案清單)，
 * 透過 helper 包一層 async function，未來真要動態化(主管自訂導覽 / DB-driven)
 * 不動 UI 即可換實作。
 */

import "server-only";

import {
  SALES_OVERVIEW_HERO,
  SALES_OVERVIEW_KPIS,
  SALES_OVERVIEW_PANELS,
  SALES_OVERVIEW_CONNECTIONS,
  SALES_DESIGN_PRINCIPLES,
  SALES_MODULE_FILES,
} from "./sales-overview.constants";

export async function getSalesOverview() {
  return {
    hero: SALES_OVERVIEW_HERO,
    kpis: SALES_OVERVIEW_KPIS,
    panels: SALES_OVERVIEW_PANELS,
    connections: SALES_OVERVIEW_CONNECTIONS,
    principles: SALES_DESIGN_PRINCIPLES,
    files: SALES_MODULE_FILES,
  };
}

export type SalesOverviewData = Awaited<ReturnType<typeof getSalesOverview>>;
