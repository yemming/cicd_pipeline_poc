import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import {
  listCustomerContacts,
  listCustomers,
} from "@/lib/master-data/queries";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  primary: "主要",
  emergency: "緊急",
  family: "家屬",
  secretary: "秘書",
  other: "其他",
};

const ROLE_COLOR: Record<string, string> = {
  primary: "bg-[#DEEBFF] text-[#0747A6]",
  emergency: "bg-[#FFEBE6] text-[#BF2600]",
  family: "bg-[#E3FCEF] text-[#006644]",
  secretary: "bg-[#EAE6FF] text-[#403294]",
  other: "bg-[#DFE1E6] text-[#42526E]",
};

export default async function CustomerContactsListPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶的權限</p>
      </main>
    );
  }

  const [contacts, customers] = await Promise.all([
    listCustomerContacts({ activeOnly: false }),
    listCustomers({ activeOnly: false, limit: 1000 }),
  ]);
  const customerById = new Map(customers.map((c) => [c.id, c]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">客戶聯絡人</h1>
        <p className="text-[13px] text-[#6B778C]">
          共 {contacts.length} 筆 ・ 跨客戶總覽；新增 / 編輯請至各客戶詳情頁
        </p>
      </header>

      <DataTable
        rows={contacts}
        getKey={(c) => c.id}
        rowHref={(c) => `/admin/master-data/customers/${c.customer_id}/contacts/${c.id}`}
        columns={[
          {
            key: "role",
            header: "角色",
            width: "90px",
            cell: (c) => (
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${ROLE_COLOR[c.role] ?? ROLE_COLOR.other}`}
              >
                {ROLE_LABEL[c.role] ?? c.role}
              </span>
            ),
          },
          {
            key: "name",
            header: "姓名",
            width: "140px",
            cell: (c) => <span className="font-medium">{c.name}</span>,
          },
          {
            key: "customer",
            header: "所屬客戶",
            cell: (c) => {
              const cu = customerById.get(c.customer_id);
              return cu ? (
                <span>
                  <span className="font-mono text-[12px] text-[#6B778C]">{cu.code}</span>
                  <span className="ml-2">{cu.name}</span>
                </span>
              ) : (
                <span className="text-[#BF2600]">客戶不存在</span>
              );
            },
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
            key: "relation",
            header: "關係",
            width: "110px",
            cell: (c) =>
              c.relation ?? <span className="text-[#6B778C]">—</span>,
          },
          {
            key: "active",
            header: "狀態",
            width: "70px",
            cell: (c) =>
              c.is_active ? (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#E3FCEF] text-[#006644]">
                  啟用
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#DFE1E6] text-[#42526E]">
                  停用
                </span>
              ),
          },
        ]}
        empty={
          <span>
            尚無聯絡人 — 至各客戶詳情頁新增（
            <Link
              href="/admin/master-data/customers"
              className="text-[#0052CC] hover:underline"
            >
              客戶列表
            </Link>
            ）
          </span>
        }
      />
    </main>
  );
}
