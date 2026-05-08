import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import {
  listCustomers,
  listWarrantyClaims,
  listWorkOrders,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  oem_warranty: "OEM",
  extended_warranty: "延保",
  tsb: "TSB",
  pdi: "PDI",
  goodwill: "Goodwill",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "已送件",
  under_review: "審查中",
  approved: "已核准",
  partial_approved: "部分核准",
  rejected: "拒絕",
  received: "已收款",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-[#DFE1E6] text-[#42526E]",
  submitted: "bg-[#DEEBFF] text-[#0747A6]",
  under_review: "bg-[#FFF7E6] text-[#974F00]",
  approved: "bg-[#E3FCEF] text-[#006644]",
  partial_approved: "bg-[#FFF7E6] text-[#974F00]",
  rejected: "bg-[#FFEBE6] text-[#BF2600]",
  received: "bg-[#E3FCEF] text-[#006644]",
  cancelled: "bg-[#DFE1E6] text-[#42526E]",
};

const NT = (n: number | null | undefined) =>
  n != null ? `NT$ ${Math.round(Number(n)).toLocaleString()}` : "—";

export default async function WarrantyClaimsAdminPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視保固索賠的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);
  const [claims, customers, workOrders] = await Promise.all([
    listWarrantyClaims({ limit: 200 }),
    listCustomers({ activeOnly: false, limit: 1000 }),
    listWorkOrders({ limit: 500 }),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const woById = new Map(workOrders.map((w) => [w.id, w]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">保固索賠</h1>
          <p className="text-[13px] text-[#6B778C]">
            共 {claims.length} 筆 ・ 連工單 RO 跟原廠保固通報
          </p>
        </div>
        {canEdit && (
          <Link
            href="/admin/master-data/warranty-claims/new"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[14px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增索賠
          </Link>
        )}
      </header>

      <DataTable
        rows={claims}
        getKey={(c) => c.id}
        rowHref={canEdit ? (c) => `/admin/master-data/warranty-claims/${c.id}` : undefined}
        columns={[
          {
            key: "cl_no",
            header: "索賠單號",
            width: "180px",
            cell: (c) => <span className="font-mono text-[12px]">{c.cl_no}</span>,
          },
          {
            key: "type",
            header: "類型",
            width: "90px",
            cell: (c) => (
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#EAE6FF] text-[#403294]">
                {TYPE_LABEL[c.claim_type] ?? c.claim_type}
              </span>
            ),
          },
          {
            key: "ro",
            header: "工單",
            width: "150px",
            cell: (c) =>
              c.ro_id ? (
                <span className="font-mono text-[12px]">
                  {woById.get(c.ro_id)?.ro_no ?? "(已刪除)"}
                </span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "customer",
            header: "客戶",
            cell: (c) =>
              c.customer_id
                ? customerById.get(c.customer_id)?.name ?? "—"
                : <span className="text-[#6B778C]">—</span>,
          },
          {
            key: "claim_date",
            header: "索賠日",
            width: "100px",
            cell: (c) => c.claim_date ?? "—",
          },
          {
            key: "applied",
            header: "申請金額",
            align: "right",
            width: "110px",
            cell: (c) => NT(c.applied_amount),
          },
          {
            key: "approved",
            header: "核准金額",
            align: "right",
            width: "110px",
            cell: (c) =>
              c.approved_amount != null ? (
                <span className="font-mono">{NT(c.approved_amount)}</span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "status",
            header: "狀態",
            width: "90px",
            cell: (c) => (
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLOR[c.status] ?? ""}`}
              >
                {STATUS_LABEL[c.status] ?? c.status}
              </span>
            ),
          },
        ]}
        empty="尚無保固索賠 — 點右上角「新增索賠」開始建立"
      />
    </main>
  );
}
