import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { listSuppliers } from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  oem: "OEM 原廠",
  agent: "代理商",
  consumable: "耗材／工具",
  services: "服務商",
  other: "其他",
};

export default async function SuppliersAdminPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.SUPPLIER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視供應商的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.SUPPLIER_EDIT);
  const suppliers = await listSuppliers({ activeOnly: false });

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">供應商</h1>
          <p className="text-[13px] text-[#6B778C]">
            共 {suppliers.length} 筆 ・ 採購單 / 進貨單吃此處 supplier_id
          </p>
        </div>
        {canEdit && (
          <Link
            href="/admin/master-data/suppliers/new"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[14px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增供應商
          </Link>
        )}
      </header>

      <DataTable
        rows={suppliers}
        getKey={(s) => s.id}
        rowHref={canEdit ? (s) => `/admin/master-data/suppliers/${s.id}` : undefined}
        columns={[
          {
            key: "code",
            header: "代碼",
            cell: (s) => <span className="font-mono">{s.code}</span>,
            width: "100px",
          },
          {
            key: "name",
            header: "供應商名稱",
            cell: (s) => <span className="font-medium">{s.name}</span>,
          },
          {
            key: "type",
            header: "類型",
            width: "100px",
            cell: (s) => (
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#DEEBFF] text-[#0747A6]">
                {TYPE_LABEL[s.type] ?? s.type}
              </span>
            ),
          },
          {
            key: "tax_id",
            header: "統編",
            width: "110px",
            cell: (s) =>
              s.tax_id ? (
                <span className="font-mono text-[12px]">{s.tax_id}</span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "phone",
            header: "電話",
            width: "140px",
            cell: (s) =>
              s.phone ? (
                <span className="font-mono text-[12px]">{s.phone}</span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "currency",
            header: "幣別",
            width: "70px",
            cell: (s) => <span className="font-mono text-[12px]">{s.default_currency}</span>,
          },
          {
            key: "active",
            header: "狀態",
            width: "70px",
            cell: (s) =>
              s.is_active ? (
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
        empty="尚無供應商資料 — 點右上角「新增供應商」開始建立"
      />
    </main>
  );
}
