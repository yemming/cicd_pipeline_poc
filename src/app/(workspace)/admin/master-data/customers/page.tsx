import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { listCustomers } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

export default async function CustomersAdminPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const customers = await listCustomers({ activeOnly: false, limit: 500 });

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">客戶資料</h1>
          <p className="text-[13px] text-[#6B778C]">
            共 {customers.length} 筆 ・ 預約／工單／報價／訂單都吃此處 customer_id
          </p>
        </div>
        {canEdit && (
          <Link
            href="/admin/master-data/customers/new"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[14px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增客戶
          </Link>
        )}
      </header>

      <DataTable
        rows={customers}
        getKey={(c) => c.id}
        rowHref={canEdit ? (c) => `/admin/master-data/customers/${c.id}` : undefined}
        columns={[
          {
            key: "code",
            header: "代碼",
            cell: (c) => <span className="font-mono">{c.code}</span>,
            width: "100px",
          },
          {
            key: "name",
            header: "客戶名稱",
            cell: (c) => <span className="font-medium">{c.name}</span>,
          },
          {
            key: "type",
            header: "類型",
            width: "90px",
            cell: (c) =>
              c.type === "corporate" ? (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#DEEBFF] text-[#0747A6]">
                  公司
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#EAE6FF] text-[#403294]">
                  個人
                </span>
              ),
          },
          {
            key: "tax_id",
            header: "統編",
            width: "110px",
            cell: (c) =>
              c.tax_id ? (
                <span className="font-mono text-[12px]">{c.tax_id}</span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "phone",
            header: "電話",
            width: "140px",
            cell: (c) =>
              c.phone ? (
                <span className="font-mono text-[12px]">{c.phone}</span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "email",
            header: "Email",
            cell: (c) =>
              c.email ? (
                <span className="text-[12px]">{c.email}</span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "active",
            header: "狀態",
            width: "70px",
            cell: (c) =>
              c.is_active ? (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#E3FCEF] text-[#006644]">
                  往來中
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#DFE1E6] text-[#42526E]">
                  停用
                </span>
              ),
          },
        ]}
        empty="尚無客戶資料 — 點右上角「新增客戶」開始建立"
      />
    </main>
  );
}
