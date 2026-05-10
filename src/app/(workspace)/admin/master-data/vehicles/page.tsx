import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import {
  listCustomers,
  listCustomerVehicles,
  listVehicleModels,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

export default async function VehiclesAdminPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.VEHICLE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視車輛的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.VEHICLE_EDIT);
  const [vehicles, customers, models] = await Promise.all([
    listCustomerVehicles({ activeOnly: false, limit: 200 }),
    listCustomers({ limit: 500 }),
    listVehicleModels(),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const modelById = new Map(models.map((m) => [m.id, m]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">客戶車輛</h1>
          <p className="text-[13px] text-[#6B778C]">共 {vehicles.length} 筆</p>
        </div>
        {canEdit && (
          <Link
            href="/admin/master-data/vehicles/new"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[14px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增車輛
          </Link>
        )}
      </header>

      <DataTable
        rows={vehicles}
        getKey={(v) => v.id}
        rowHref={canEdit ? (v) => `/admin/master-data/vehicles/${v.id}` : undefined}
        columns={[
          {
            key: "license_plate",
            header: "車牌",
            cell: (v) =>
              v.license_plate ? (
                <span className="font-mono">{v.license_plate}</span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
            width: "120px",
          },
          {
            key: "customer",
            header: "車主",
            cell: (v) => customerById.get(v.customer_id)?.name ?? "—",
            width: "160px",
          },
          {
            key: "model",
            header: "車型",
            cell: (v) => (v.model_id ? modelById.get(v.model_id)?.display_name ?? "—" : "—"),
          },
          {
            key: "vin",
            header: "VIN",
            cell: (v) =>
              v.vin ? (
                <span className="font-mono text-[12px]">{v.vin}</span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
            width: "180px",
          },
          {
            key: "mileage",
            header: "里程",
            align: "right",
            width: "100px",
            cell: (v) =>
              v.current_mileage != null
                ? `${Number(v.current_mileage).toLocaleString()} km`
                : "—",
          },
          {
            key: "next_service",
            header: "下次保養",
            width: "130px",
            cell: (v) => {
              if (!v.next_service_due_date && !v.next_service_due_mileage) return "—";
              const d = v.next_service_due_date ?? "—";
              const m = v.next_service_due_mileage
                ? `${Number(v.next_service_due_mileage).toLocaleString()} km`
                : "—";
              return (
                <span className="text-[12px] leading-tight">
                  {d}
                  <br />
                  <span className="text-[#6B778C]">{m}</span>
                </span>
              );
            },
          },
          {
            key: "active",
            header: "狀態",
            width: "70px",
            cell: (v) =>
              v.is_active ? (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#E3FCEF] text-[#006644]">
                  持有中
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#DFE1E6] text-[#42526E]">
                  已轉手
                </span>
              ),
          },
        ]}
        empty="尚無車輛資料 — 點右上角「新增車輛」開始建立"
      />
    </main>
  );
}
