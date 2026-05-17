import { getKpiTargetsPageData } from "@/domain/sales-kpi-targets";
import KpiTargetsView from "./_components/kpi-targets-view";

export const metadata = {
  title: "KPI 目標與 HABC 閾值 | DealerOS",
};

/**
 * RS_M3 主管設定 — KPI 目標值 + HABC 閾值設定
 *
 * 設計稿來源：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html § Tab 0
 * 提案：docs/proposals/feature-rs-m3-kpi-targets-phase1.md
 *
 * 後續串接：
 *   - /sales/funnel 紅 / 黃 / 綠閾值讀 sales_kpi_target.value
 *   - RS_M1 漏斗看板 HABC 自動建議讀 habc_threshold.value
 */
export default async function SalesManagerKpiTargetsPage() {
  const data = await getKpiTargetsPageData();
  return <KpiTargetsView data={data} />;
}
