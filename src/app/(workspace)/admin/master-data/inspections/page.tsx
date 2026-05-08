import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import {
  listCustomerVehicles,
  listEmployees,
  listInspectionRecords,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

const OVERALL_LABEL: Record<string, string> = {
  pending: "待檢",
  pass: "通過",
  fail: "未通過",
  conditional: "有條件",
};

const OVERALL_COLOR: Record<string, string> = {
  pending: "bg-[#DFE1E6] text-[#42526E]",
  pass: "bg-[#E3FCEF] text-[#006644]",
  fail: "bg-[#FFEBE6] text-[#BF2600]",
  conditional: "bg-[#FFF7E6] text-[#974F00]",
};

export default async function InspectionsAdminPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.INSPECTION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視檢驗紀錄的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.INSPECTION_EDIT);
  const [records, vehicles, employees] = await Promise.all([
    listInspectionRecords({ limit: 200 }),
    listCustomerVehicles({ activeOnly: false, limit: 500 }),
    listEmployees({ status: "active", limit: 200 }),
  ]);
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">PI / PDI 檢驗</h1>
          <p className="text-[13px] text-[#6B778C]">
            共 {records.length} 筆 ・ PI 進廠檢驗 / PDI 交車前檢驗
          </p>
        </div>
        {canEdit && (
          <Link
            href="/admin/master-data/inspections/new"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[14px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增檢驗
          </Link>
        )}
      </header>

      <DataTable
        rows={records}
        getKey={(r) => r.id}
        rowHref={canEdit ? (r) => `/admin/master-data/inspections/${r.id}` : undefined}
        columns={[
          {
            key: "kind",
            header: "類型",
            width: "80px",
            cell: (r) => (
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-medium ${
                  r.kind === "PDI"
                    ? "bg-[#EAE6FF] text-[#403294]"
                    : "bg-[#DEEBFF] text-[#0747A6]"
                }`}
              >
                {r.kind}
              </span>
            ),
          },
          {
            key: "vehicle",
            header: "機車",
            width: "180px",
            cell: (r) => {
              const v = vehicleById.get(r.vehicle_id);
              if (!v) return <span className="text-[#BF2600]">車輛已刪除</span>;
              return (
                <span>
                  <span className="font-mono text-[12px]">
                    {v.license_plate || v.vin?.slice(-8) || "—"}
                  </span>
                </span>
              );
            },
          },
          {
            key: "inspector",
            header: "檢驗員",
            width: "140px",
            cell: (r) =>
              r.inspector_id ? (
                employeeById.get(r.inspector_id)?.name ?? "—"
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "inspected_at",
            header: "檢驗時間",
            width: "160px",
            cell: (r) =>
              new Date(r.inspected_at).toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei",
              }),
          },
          {
            key: "mileage",
            header: "里程",
            width: "100px",
            align: "right",
            cell: (r) =>
              r.mileage_at_inspection != null ? (
                `${Number(r.mileage_at_inspection).toLocaleString()} km`
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "status",
            header: "判定",
            width: "90px",
            cell: (r) => (
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${OVERALL_COLOR[r.overall_status] ?? ""}`}
              >
                {OVERALL_LABEL[r.overall_status] ?? r.overall_status}
              </span>
            ),
          },
        ]}
        empty="尚無檢驗紀錄 — 點右上角「新增檢驗」開始建立"
      />
    </main>
  );
}
