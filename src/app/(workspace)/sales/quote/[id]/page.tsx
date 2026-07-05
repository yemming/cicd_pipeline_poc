import { notFound } from "next/navigation";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSalesQuoteById } from "@/domain/sales-quote";
import { listVehicleModels } from "@/domain/vehicle-models";

import { QuotationDetailView } from "./_components/quotation-detail-view";

/**
 * 賞車報價單 Detail Page — view / edit mode
 *
 * RS04：報價階段不涉及折扣，本頁不再傳入任何折扣審核狀態。
 * 新增傳入：
 *   vehicleModels — 新車選款下拉清單（輪5-1：帶 msrp）
 */
export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const canView = await hasPermission(PERMISSIONS.SALES_ORDER_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-5">
        <div className="text-[13px] text-[#CC0000]">
          沒有檢視賞車報價單的權限。
        </div>
      </main>
    );
  }

  const [quote, canEdit] = await Promise.all([
    getSalesQuoteById(id),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  if (!quote) notFound();

  const vehicleModelsRes = await listVehicleModels({ status: "active" }, { pageSize: 200 });

  return (
    <QuotationDetailView
      quote={quote}
      initialMode="view"
      canEdit={canEdit}
      vehicleModels={vehicleModelsRes.rows.map((m) => ({
        id: m.id,
        display_name: m.display_name,
        model_name: m.model_name,
        series: m.series,
        msrp: m.msrp,
      }))}
    />
  );
}
