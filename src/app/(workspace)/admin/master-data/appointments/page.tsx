import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import {
  listCustomers,
  listCustomerVehicles,
  listEmployees,
  listServiceAppointments,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  booked: { text: "已預約", color: "bg-[#DEEBFF] text-[#0747A6]" },
  checked_in: { text: "已報到", color: "bg-[#FFF7D6] text-[#7F5F01]" },
  in_progress: { text: "施工中", color: "bg-[#FFEEDB] text-[#974F0C]" },
  done: { text: "已完成", color: "bg-[#E3FCEF] text-[#006644]" },
  cancelled: { text: "已取消", color: "bg-[#DFE1E6] text-[#42526E]" },
  no_show: { text: "未到場", color: "bg-[#FFEBE6] text-[#BF2600]" },
};

const SERVICE_TYPE_LABEL: Record<string, string> = {
  general: "一般保養",
  scheduled_maintenance: "定期保養",
  repair: "維修",
  pdi: "PDI",
  other: "其他",
};

export default async function AppointmentsAdminPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.APPOINTMENT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視預約的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.APPOINTMENT_EDIT);
  const [appointments, customers, vehicles, advisors] = await Promise.all([
    listServiceAppointments({ limit: 200 }),
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: false, limit: 500 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const advisorById = new Map(advisors.map((a) => [a.id, a]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">維修預約</h1>
          <p className="text-[13px] text-[#6B778C]">共 {appointments.length} 筆</p>
        </div>
        {canEdit && (
          <Link
            href="/admin/master-data/appointments/new"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[14px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增預約
          </Link>
        )}
      </header>

      <DataTable
        rows={appointments}
        getKey={(a) => a.id}
        rowHref={canEdit ? (a) => `/admin/master-data/appointments/${a.id}` : undefined}
        columns={[
          {
            key: "appt_no",
            header: "單號",
            cell: (a) => <span className="font-mono">{a.appt_no}</span>,
            width: "180px",
          },
          {
            key: "scheduled_at",
            header: "預約時間",
            width: "140px",
            cell: (a) => {
              const d = new Date(a.scheduled_at);
              const date = d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
              const time = d.toLocaleTimeString("zh-TW", {
                timeZone: "Asia/Taipei",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              });
              return (
                <span className="text-[12px]">
                  {date}
                  <br />
                  <span className="text-[#6B778C]">{time}</span>
                </span>
              );
            },
          },
          {
            key: "customer",
            header: "客戶",
            width: "120px",
            cell: (a) => customerById.get(a.customer_id)?.name ?? "—",
          },
          {
            key: "vehicle",
            header: "車輛",
            cell: (a) => {
              if (!a.vehicle_id) return "—";
              const v = vehicleById.get(a.vehicle_id);
              return v?.license_plate ?? v?.vin ?? "—";
            },
          },
          {
            key: "service_type",
            header: "類型",
            width: "100px",
            cell: (a) => SERVICE_TYPE_LABEL[a.service_type] ?? a.service_type,
          },
          {
            key: "advisor",
            header: "顧問",
            width: "100px",
            cell: (a) => (a.advisor_id ? advisorById.get(a.advisor_id)?.name ?? "—" : "—"),
          },
          {
            key: "status",
            header: "狀態",
            width: "80px",
            cell: (a) => {
              const s = STATUS_LABEL[a.status] ?? { text: a.status, color: "bg-[#DFE1E6]" };
              return (
                <span
                  className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${s.color}`}
                >
                  {s.text}
                </span>
              );
            },
          },
        ]}
        empty="尚無預約 — 點右上角「新增預約」開始建立"
      />
    </main>
  );
}
