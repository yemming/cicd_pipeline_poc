import { getSalesManagerFunnelData } from "@/domain/sales-manager-funnel";
import SalesManagerFunnelBoard from "../manager/funnel/_components/sales-manager-funnel-board";

export const metadata = {
  title: "銷售漏斗 | DealerOS",
};

/**
 * /sales/funnel — RS_M1 銷售漏斗看板（v5 升級）
 *
 * 與 /sales/manager/funnel 共用同一個 board 元件（資料、視角、KPI 三層、漏斗、RS 比較、客群畫像）。
 * 差別只在 sidebar / breadcrumb 入口語義：
 *   - /sales/funnel        ← 銷售管理 → 銷售漏斗（S2-6 客戶與分析）
 *   - /sales/manager/funnel ← 主管工作台 → 銷售漏斗
 *
 * 資料層走 @/domain/sales-manager-funnel，未來接 sales_funnel_metrics view 時兩個 route 一起升級。
 */
export default async function SalesFunnelPage() {
  const data = await getSalesManagerFunnelData();
  return (
    <>
      <SalesManagerFunnelBoard
        data={data}
        pageHeader={{
          title: "銷售漏斗看板",
          breadcrumb: [{ label: "銷售管理" }, { label: "銷售漏斗" }],
        }}
      />
    </>
  );
}
