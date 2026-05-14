/**
 * 客服功能導覽總覽 helper — server-only。
 *
 * 對應 nav_node d1746283-a79c-40bb-831d-96cefd99541a（Indian / 客服功能導覽 CRM00 v2）。
 * 全部資料目前為靜態元資料（CRM A/B 系列模組目錄、串接關係、檔案清單），
 * 透過 helper 包一層 async function，未來真要動態化（DB-driven CRM registry）
 * 不動 UI 即可換實作。
 */

import "server-only";

import {
  CS_OVERVIEW_HERO,
  CS_OVERVIEW_KPIS,
  CS_OVERVIEW_PANELS,
  CS_OVERVIEW_CONNECTIONS,
  CS_MODULE_FILES,
} from "./customer-service-overview.constants";

export async function getCustomerServiceOverview() {
  return {
    hero: CS_OVERVIEW_HERO,
    kpis: CS_OVERVIEW_KPIS,
    panels: CS_OVERVIEW_PANELS,
    connections: CS_OVERVIEW_CONNECTIONS,
    files: CS_MODULE_FILES,
  };
}

export type CustomerServiceOverviewData = Awaited<
  ReturnType<typeof getCustomerServiceOverview>
>;
