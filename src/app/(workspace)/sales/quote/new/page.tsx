import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listVehicleModels } from "@/domain/vehicle-models";

import { QuotationDetailView } from "../[id]/_components/quotation-detail-view";

/**
 * 賞車報價單 — 新增頁（create mode）
 *
 * Reuse 同一個 QuotationDetailView，傳 quote={null} + initialMode="create"。
 * 建立成功後 client 端 router.push 到 /sales/quote/{newId} 切回 view mode。
 * 輪5-1：傳入 vehicleModels 讓車款 select 能帶 msrp → vehicle_amount。
 */
export default async function NewQuotationPage() {
  const canEdit = await hasPermission(PERMISSIONS.SALES_ORDER_EDIT);
  if (!canEdit) {
    return (
      <main className="px-6 py-5">
        <div className="text-[13px] text-[#CC0000]">
          沒有建立賞車報價單的權限。
        </div>
      </main>
    );
  }

  const vehicleModelsRes = await listVehicleModels({ status: "active" }, { pageSize: 200 });

  return (
    <QuotationDetailView
      quote={null}
      initialMode="create"
      canEdit
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
