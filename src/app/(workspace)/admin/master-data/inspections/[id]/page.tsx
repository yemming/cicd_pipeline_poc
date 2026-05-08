import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCustomerVehicleById,
  getInspectionRecordById,
  listCustomerVehicles,
  listEmployees,
  listInspectionFindings,
  listServiceAppointments,
  listWorkOrders,
} from "@/lib/master-data/queries";
import { updateInspectionAction } from "@/lib/master-data/inspection-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { InspectionForm } from "../_components/inspection-form";

export const dynamic = "force-dynamic";

export default async function EditInspectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.INSPECTION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視檢驗紀錄的權限</p>
      </main>
    );
  }

  const [
    inspection,
    vehicles,
    workOrders,
    appointments,
    employees,
  ] = await Promise.all([
    getInspectionRecordById(id),
    listCustomerVehicles({ activeOnly: true, limit: 500 }),
    listWorkOrders({ limit: 200 }),
    listServiceAppointments({ limit: 200 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);
  if (!inspection) notFound();

  const findings = await listInspectionFindings(inspection.id);

  // 確保現任機車在 dropdown
  const vehicle = await getCustomerVehicleById(inspection.vehicle_id);
  if (vehicle && !vehicles.find((v) => v.id === vehicle.id)) {
    vehicles.unshift(vehicle);
  }

  const canEdit = await hasPermission(PERMISSIONS.INSPECTION_EDIT);
  const plate = vehicle?.license_plate || vehicle?.vin || inspection.vehicle_id.slice(0, 8);

  return (
    <main className="px-6 py-6 max-w-[1200px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/inspections" className="hover:text-[#172B4D]">
          PI / PDI 檢驗
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">
          {inspection.kind} ・ {plate}
        </span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          編輯檢驗紀錄 ・ {inspection.kind} {plate}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          建立於{" "}
          {new Date(inspection.created_at).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
          })}{" "}
          ・ {findings.length} 項檢驗
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <InspectionForm
            mode="edit"
            action={updateInspectionAction}
            inspection={inspection}
            initialFindings={findings}
            vehicles={vehicles}
            workOrders={workOrders}
            appointments={appointments}
            employees={employees}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">僅可檢視；沒有編輯權限</p>
        )}
      </section>
    </main>
  );
}
