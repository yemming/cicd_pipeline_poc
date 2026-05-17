import { notFound, redirect } from "next/navigation";

import {
  getWorkOrderById,
  listCustomers,
  listCustomerVehicles,
  listEmployees,
  listItems,
  listServiceAppointments,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  listActiveWarehouses,
  listIssuesForWorkOrder,
  listWorkOrderItems,
} from "@/domain/work-orders";

import { WorkOrderDetailView } from "./_components/work-order-detail-view";

export const dynamic = "force-dynamic";

export default async function EditWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視工單的權限</p>
      </main>
    );
  }

  const [workOrder, customers, vehicles, appointments, employees, parts] = await Promise.all([
    getWorkOrderById(id),
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: false, limit: 500 }),
    listServiceAppointments({ limit: 100 }),
    listEmployees({ status: "active", limit: 200 }),
    listItems({ limit: 200 }),
  ]);
  if (!workOrder) notFound();

  const [initialItems, warehouses, issues] = await Promise.all([
    listWorkOrderItems(id),
    listActiveWarehouses(),
    listIssuesForWorkOrder(id),
  ]);
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const canIssue = await hasPermission(PERMISSIONS.ISSUE_CREATE);

  return (
    <WorkOrderDetailView
      workOrder={workOrder}
      initialItems={initialItems}
      customers={customers}
      vehicles={vehicles}
      appointments={appointments}
      employees={employees}
      parts={parts}
      warehouses={warehouses}
      issues={issues}
      canEdit={canEdit}
      canIssue={canIssue}
    />
  );
}
