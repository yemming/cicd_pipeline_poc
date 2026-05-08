import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import {
  listCustomers,
  listCustomerVehicles,
  listEmployees,
  listWorkOrders,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  draft: { text: "草稿", color: "bg-[#DFE1E6] text-[#42526E]" },
  dispatched: { text: "已派工", color: "bg-[#DEEBFF] text-[#0747A6]" },
  in_progress: { text: "施工中", color: "bg-[#FFEEDB] text-[#974F0C]" },
  qc: { text: "品檢", color: "bg-[#FFF7D6] text-[#7F5F01]" },
  done: { text: "已完成", color: "bg-[#E3FCEF] text-[#006644]" },
  closed: { text: "已結案", color: "bg-[#DFE1E6] text-[#172B4D]" },
  cancelled: { text: "已取消", color: "bg-[#FFEBE6] text-[#BF2600]" },
};

const NT = (n: number) => `NT$ ${Math.round(n).toLocaleString()}`;

export default async function WorkOrdersAdminPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視工單的權限</p>
      </main>
    );
  }

  const canCreate = await hasPermission(PERMISSIONS.RO_CREATE);
  const [workOrders, customers, vehicles, employees] = await Promise.all([
    listWorkOrders({ limit: 200 }),
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: false, limit: 500 }),
    listEmployees({ limit: 200 }),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const empById = new Map(employees.map((e) => [e.id, e]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">維修工單</h1>
          <p className="text-[13px] text-[#6B778C]">共 {workOrders.length} 筆</p>
        </div>
        {canCreate && (
          <Link
            href="/admin/master-data/work-orders/new"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[14px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增工單
          </Link>
        )}
      </header>

      <DataTable
        rows={workOrders}
        getKey={(w) => w.id}
        rowHref={canCreate ? (w) => `/admin/master-data/work-orders/${w.id}` : undefined}
        columns={[
          {
            key: "ro_no",
            header: "單號",
            cell: (w) => <span className="font-mono">{w.ro_no}</span>,
            width: "180px",
          },
          {
            key: "opened_at",
            header: "開單時間",
            width: "120px",
            cell: (w) => {
              const d = new Date(w.opened_at);
              return (
                <span className="text-[12px]">
                  {d.toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
                </span>
              );
            },
          },
          {
            key: "customer",
            header: "車主",
            width: "120px",
            cell: (w) => customerById.get(w.customer_id)?.name ?? "—",
          },
          {
            key: "vehicle",
            header: "車輛",
            cell: (w) => {
              const v = vehicleById.get(w.vehicle_id);
              return v?.license_plate ?? v?.vin ?? "—";
            },
          },
          {
            key: "advisor",
            header: "顧問",
            width: "100px",
            cell: (w) => (w.advisor_id ? empById.get(w.advisor_id)?.name ?? "—" : "—"),
          },
          {
            key: "tech",
            header: "主責技師",
            width: "100px",
            cell: (w) =>
              w.lead_technician_id ? empById.get(w.lead_technician_id)?.name ?? "—" : "—",
          },
          {
            key: "total",
            header: "金額",
            align: "right",
            width: "120px",
            cell: (w) => (
              <span className="font-mono">{NT(Number(w.total_amount ?? 0))}</span>
            ),
          },
          {
            key: "status",
            header: "狀態",
            width: "80px",
            cell: (w) => {
              const s = STATUS_LABEL[w.status] ?? { text: w.status, color: "bg-[#DFE1E6]" };
              return (
                <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${s.color}`}>
                  {s.text}
                </span>
              );
            },
          },
        ]}
        empty="尚無工單 — 點右上角「新增工單」開始建立"
      />
    </main>
  );
}
