import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCustomerById,
  getServiceAppointmentById,
  listCustomers,
  listCustomerVehicles,
  listEmployees,
} from "@/lib/master-data/queries";
import { updateAppointmentAction } from "@/lib/master-data/appointment-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { AppointmentForm } from "../_components/appointment-form";

export const dynamic = "force-dynamic";

export default async function EditAppointmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.APPOINTMENT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視預約的權限</p>
      </main>
    );
  }

  const [appointment, customers, vehicles, advisors] = await Promise.all([
    getServiceAppointmentById(id),
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: false, limit: 500 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);
  if (!appointment) notFound();

  // 確保現任客戶 / 車輛在 dropdown 內（若被停用了還是要顯示）
  const owner = await getCustomerById(appointment.customer_id);
  if (owner && !customers.find((c) => c.id === owner.id)) {
    customers.unshift(owner);
  }

  const canEdit = await hasPermission(PERMISSIONS.APPOINTMENT_EDIT);

  return (
    <main className="px-6 py-6 max-w-[1100px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/appointments" className="hover:text-[#172B4D]">
          維修預約
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">{appointment.appt_no}</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          編輯預約 ・ {appointment.appt_no}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          建立於 {new Date(appointment.created_at).toLocaleString("zh-TW")} ・
          最近更新 {new Date(appointment.updated_at).toLocaleString("zh-TW")}
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <AppointmentForm
            mode="edit"
            action={updateAppointmentAction}
            appointment={appointment}
            customers={customers}
            vehicles={vehicles}
            advisors={advisors}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">僅可檢視；沒有編輯權限</p>
        )}
      </section>
    </main>
  );
}
