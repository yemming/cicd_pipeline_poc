/**
 * RS_M2 業績報表（銷售管理 / 主管視角）helper — server-only。
 *
 * 對應 nav_node `6c385e0a-a0b2-46de-a25c-b9dc396c3170`（Indian / 銷售管理 / 業績報表）。
 * Phase 1：return constants 組成的物件。
 * Phase 2：接 sales_metrics_monthly view + kpi_targets 表。
 */

import "server-only";

import {
  LAYER1_KPIS,
  LAYER2_KPIS,
  LAYER3_KPIS,
  BEP_DATA,
  MONTHLY_TREND,
  MONTHLY_CHART_TARGET,
  RS_RANKING,
  MODEL_SALES,
  WEEKLY_TREND,
  LAST_UPDATED,
} from "./sales-manager-report.constants";

export async function getSalesManagerReportData() {
  return {
    layer1: LAYER1_KPIS,
    layer2: LAYER2_KPIS,
    layer3: LAYER3_KPIS,
    bep: BEP_DATA,
    monthlyTrend: MONTHLY_TREND,
    monthlyChartTarget: MONTHLY_CHART_TARGET,
    rsRanking: RS_RANKING,
    modelSales: MODEL_SALES,
    weeklyTrend: WEEKLY_TREND,
    lastUpdated: LAST_UPDATED,
  };
}

export type SalesManagerReportData = Awaited<ReturnType<typeof getSalesManagerReportData>>;
