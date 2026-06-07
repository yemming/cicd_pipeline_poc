import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
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
  // ─── 權限 gate ───────────────────────────────────────────
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-10 text-center">
        <div className="inline-block bg-white border border-[#F5AEAD] rounded-lg px-6 py-5">
          <div className="text-[40px] mb-2">🔒</div>
          <div className="text-[14px] font-semibold text-[#C8001A] mb-1">權限不足</div>
          <div className="text-[12px] text-[#5A5955]">
            您沒有檢視銷售漏斗的權限（需要 sales.order.view）。請聯繫系統管理員。
          </div>
        </div>
      </main>
    );
  }

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
