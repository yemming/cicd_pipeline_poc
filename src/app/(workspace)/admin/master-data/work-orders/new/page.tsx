import { redirect } from "next/navigation";

import {
  getServiceAppointmentById,
  listCustomers,
  listCustomerVehicles,
  listEmployees,
  listItems,
  listServiceAppointments,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { listActiveWarehouses } from "@/domain/work-orders";
import type { WorkOrder } from "@/lib/parts/types";

import { WorkOrderDetailView } from "../[id]/_components/work-order-detail-view";

export const dynamic = "force-dynamic";

export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; vehicle?: string; appointment?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立工單的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  // 從預約轉過來的預填：customer / vehicle / appointment 三個 query params 由 appointment edit 頁帶過來
  let prefill: Partial<WorkOrder> | null = null;
  if (sp.customer || sp.vehicle || sp.appointment) {
    if (sp.appointment) {
      const appt = await getServiceAppointmentById(sp.appointment);
      if (appt) {
        prefill = {
          customer_id: sp.customer ?? appt.customer_id,
          vehicle_id: sp.vehicle ?? appt.vehicle_id,
          appointment_id: appt.id,
        } as Partial<WorkOrder>;
      }
    }
    if (!prefill) {
      prefill = {
        customer_id: sp.customer ?? "",
        vehicle_id: sp.vehicle ?? "",
        appointment_id: sp.appointment ?? null,
      } as Partial<WorkOrder>;
    }
  }

  const [customers, vehicles, appointments, employees, parts, warehouses] = await Promise.all([
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: true, limit: 500 }),
    listServiceAppointments({ limit: 100 }),
    listEmployees({ status: "active", limit: 200 }),
    listItems({ limit: 200 }),
    listActiveWarehouses(),
  ]);

  return (
    <WorkOrderDetailView
      workOrder={prefill as WorkOrder | null}
      initialItems={[]}
      customers={customers}
      vehicles={vehicles}
      appointments={appointments}
      employees={employees}
      parts={parts}
      warehouses={warehouses}
      issues={[]}
      canEdit
      canIssue={false}
      initialMode="create"
    />
  );
}
