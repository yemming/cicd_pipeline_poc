import { redirect } from "next/navigation";

import {
  listCustomers,
  listCustomerVehicles,
  listEmployees,
  listWorkOrders,
  WORK_ORDERS_PAGE_SIZE_DEFAULT,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { WorkOrdersBoard } from "./_components/work-orders-board";

export const dynamic = "force-dynamic";

export default async function WorkOrdersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視工單的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = WORK_ORDERS_PAGE_SIZE_DEFAULT;

  const canCreate = await hasPermission(PERMISSIONS.RO_CREATE);
  const [workOrdersResult, customers, vehicles, employees] = await Promise.all([
    listWorkOrders({ page, pageSize }),
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: false, limit: 500 }),
    listEmployees({ limit: 200 }),
  ]);

  return (
    <WorkOrdersBoard
      rows={workOrdersResult.rows}
      totalCount={workOrdersResult.totalCount}
      page={page}
      pageSize={pageSize}
      canCreate={canCreate}
      customers={customers.map((c) => ({ id: c.id, name: c.name }))}
      vehicles={vehicles.map((v) => ({
        id: v.id,
        license_plate: v.license_plate,
        vin: v.vin,
      }))}
      employees={employees.map((e) => ({ id: e.id, name: e.name }))}
    />
  );
}
