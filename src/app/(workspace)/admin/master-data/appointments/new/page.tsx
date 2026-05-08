import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listCustomers,
  listCustomerVehicles,
  listEmployees,
} from "@/lib/master-data/queries";
import { createAppointmentAction } from "@/lib/master-data/appointment-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { AppointmentForm } from "../_components/appointment-form";

export const dynamic = "force-dynamic";

export default async function NewAppointmentPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.APPOINTMENT_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立預約的權限</p>
      </main>
    );
  }

  const [customers, vehicles, advisors] = await Promise.all([
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: true, limit: 500 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);

  return (
    <main className="px-6 py-6 max-w-[1100px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/appointments" className="hover:text-[#172B4D]">
          維修預約
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">新增預約</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">新增預約</h1>
        <p className="text-[13px] text-[#6B778C]">
          車主與時間必填；單號留空會自動產生
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        <AppointmentForm
          mode="create"
          action={createAppointmentAction}
          customers={customers}
          vehicles={vehicles}
          advisors={advisors}
        />
      </section>
    </main>
  );
}
