import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesManagerFunnelData } from "@/domain/sales-manager-funnel";
import SalesManagerFunnelBoard from "./_components/sales-manager-funnel-board";

export const metadata = {
  title: "RS_M1 銷售漏斗看板 | DealerOS",
};

export default async function SalesManagerFunnelPage() {
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
  return <SalesManagerFunnelBoard data={data} />;
}
