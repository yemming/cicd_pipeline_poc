import { redirect } from "next/navigation";

import {
  listCustomerVehicles,
  listEmployees,
  listInspectionRecords,
  INSPECTIONS_PAGE_SIZE_DEFAULT,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { InspectionsBoard } from "./_components/inspections-board";

export const dynamic = "force-dynamic";

export default async function InspectionsAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.INSPECTION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視檢驗紀錄的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = INSPECTIONS_PAGE_SIZE_DEFAULT;

  const canEdit = await hasPermission(PERMISSIONS.INSPECTION_EDIT);
  const [recordsResult, vehicles, employees] = await Promise.all([
    listInspectionRecords({ page, pageSize }),
    listCustomerVehicles({ activeOnly: false, limit: 500 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);

  return (
    <InspectionsBoard
      rows={recordsResult.rows}
      totalCount={recordsResult.totalCount}
      page={page}
      pageSize={pageSize}
      canEdit={canEdit}
      vehicles={vehicles.map((v) => ({
        id: v.id,
        license_plate: v.license_plate,
        vin: v.vin,
      }))}
      employees={employees.map((e) => ({ id: e.id, name: e.name }))}
    />
  );
}
