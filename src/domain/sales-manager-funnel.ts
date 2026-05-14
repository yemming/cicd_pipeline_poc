/**
 * RS_M1 銷售漏斗看板（主管工作台）helper — server-only。
 *
 * 對應 nav_node `3b732995-c5a8-46d7-8e2b-730d7c7a8933`（Indian / 主管工作台 / 銷售漏斗）。
 * Phase 1：return constants 組成的物件。
 * Phase 2：接 sales_funnel_metrics view + kpi_targets 表（待 schema）。
 */

import "server-only";

import {
  RS_LIST,
  KPI_TARGETS,
  CUSTOMER_TAG_GROUPS,
  FUNNEL_STAGES,
  LAST_UPDATED,
} from "./sales-manager-funnel.constants";

export async function getSalesManagerFunnelData() {
  return {
    rsList: RS_LIST,
    kpiTargets: KPI_TARGETS,
    tagGroups: CUSTOMER_TAG_GROUPS,
    funnelStages: FUNNEL_STAGES,
    lastUpdated: LAST_UPDATED,
  };
}

export type SalesManagerFunnelData = Awaited<ReturnType<typeof getSalesManagerFunnelData>>;
