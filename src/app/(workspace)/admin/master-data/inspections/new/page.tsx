import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listCustomerVehicles,
  listEmployees,
  listServiceAppointments,
  listWorkOrders,
} from "@/lib/master-data/queries";
import { createInspectionAction } from "@/lib/master-data/inspection-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { InspectionForm } from "../_components/inspection-form";

export const dynamic = "force-dynamic";

export default async function NewInspectionPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.INSPECTION_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立檢驗紀錄的權限</p>
      </main>
    );
  }

  const [vehicles, workOrders, appointments, employees] = await Promise.all([
    listCustomerVehicles({ activeOnly: true, limit: 500 }),
    listWorkOrders({ limit: 200 }),
    listServiceAppointments({ limit: 200 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);

  return (
    <main className="px-6 py-6 max-w-[1200px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/inspections" className="hover:text-[#172B4D]">
          PI / PDI 檢驗
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">新增檢驗</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">新增檢驗紀錄</h1>
        <p className="text-[13px] text-[#6B778C]">
          選擇機車、填基本資料、加檢驗項目；可日後再追加細節
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        <InspectionForm
          mode="create"
          action={createInspectionAction}
          vehicles={vehicles}
          workOrders={workOrders}
          appointments={appointments}
          employees={employees}
        />
      </section>
    </main>
  );
}
