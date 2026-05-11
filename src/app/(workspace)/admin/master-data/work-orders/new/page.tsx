import Link from "next/link";
import { redirect } from "next/navigation";

import {
  getServiceAppointmentById,
  listCustomers,
  listCustomerVehicles,
  listEmployees,
  listItems,
  listServiceAppointments,
} from "@/lib/master-data/queries";
import { createWorkOrderAction } from "@/lib/master-data/workorder-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { WorkOrder } from "@/lib/parts/types";

import { WorkOrderForm } from "../_components/work-order-form";

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
      // 嘗試讀預約的 customer/vehicle 補完欠缺的欄位
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

  const [customers, vehicles, appointments, employees, parts] = await Promise.all([
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: true, limit: 500 }),
    listServiceAppointments({ limit: 100 }),
    listEmployees({ status: "active", limit: 200 }),
    listItems({ limit: 200 }),
  ]);

  return (
    <main className="px-6 py-6 max-w-[1280px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/work-orders" className="hover:text-[#172B4D]">
          維修工單
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">新增工單</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">新增工單</h1>
        <p className="text-[13px] text-[#6B778C]">
          車主與車輛必選；工單號留空會自動產生 RO-{"{YYYYMMDD}"}-{"{6 碼}"}
          {prefill?.appointment_id && (
            <span className="ml-2 inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#DEEBFF] text-[#0747A6]">
              ← 由預約轉入
            </span>
          )}
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        <WorkOrderForm
          mode="create"
          action={createWorkOrderAction}
          workOrder={prefill as WorkOrder | null | undefined}
          customers={customers}
          vehicles={vehicles}
          appointments={appointments}
          advisors={employees}
          technicians={employees}
          parts={parts}
        />
      </section>
    </main>
  );
}
