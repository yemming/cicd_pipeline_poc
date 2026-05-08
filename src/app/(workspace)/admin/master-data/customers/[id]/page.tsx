import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCustomerById,
  listAccounts,
  listCustomerContacts,
  listCustomerVehicles,
} from "@/lib/master-data/queries";
import { updateCustomerAction } from "@/lib/master-data/customer-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { CustomerForm } from "../_components/customer-form";

export const dynamic = "force-dynamic";

export default async function EditCustomerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶的權限</p>
      </main>
    );
  }

  const [customer, accounts] = await Promise.all([
    getCustomerById(id),
    listAccounts({ acctType: "asset" }),
  ]);
  if (!customer) notFound();

  // 編輯頁帶出該客戶名下的機車數量，提示 admin 別亂停用會影響什麼
  const [vehicles, contacts] = await Promise.all([
    listCustomerVehicles({
      customerId: customer.id,
      activeOnly: false,
      limit: 50,
    }),
    listCustomerContacts({
      customerId: customer.id,
      activeOnly: false,
    }),
  ]);

  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);

  return (
    <main className="px-6 py-6 max-w-[1100px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/customers" className="hover:text-[#172B4D]">
          客戶資料
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">
          {customer.code} ・ {customer.name}
        </span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          編輯客戶 ・ {customer.name}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          建立於{" "}
          {new Date(customer.created_at).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
          })}{" "}
          ・ 最近更新{" "}
          {new Date(customer.updated_at).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
          })}
          {vehicles.length > 0 && (
            <span className="ml-2 text-[#0747A6]">
              ・ 名下 {vehicles.length} 輛機車
            </span>
          )}
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <CustomerForm
            mode="edit"
            action={updateCustomerAction}
            customer={customer}
            accounts={accounts}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">僅可檢視；沒有編輯權限</p>
        )}
      </section>

      <section className="bg-white border border-[#DFE1E6] rounded-md">
        <header className="flex items-center justify-between px-5 py-3 border-b border-[#DFE1E6]">
          <div className="space-y-0.5">
            <h2 className="text-[14px] font-bold text-[#172B4D]">客戶聯絡人</h2>
            <p className="text-[12px] text-[#6B778C]">
              共 {contacts.length} 筆 ・ 通常 primary 一筆但不強制
            </p>
          </div>
          {canEdit && (
            <Link
              href={`/admin/master-data/customers/${customer.id}/contacts/new`}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[13px] font-semibold rounded"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              新增聯絡人
            </Link>
          )}
        </header>
        {contacts.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-[#6B778C]">
            尚無聯絡人 — 點右上角「新增聯絡人」開始
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-[#F4F5F7] text-[#42526E]">
              <tr>
                <th className="text-left px-5 py-2 font-semibold w-[120px]">角色</th>
                <th className="text-left px-5 py-2 font-semibold w-[140px]">姓名</th>
                <th className="text-left px-5 py-2 font-semibold w-[140px]">電話</th>
                <th className="text-left px-5 py-2 font-semibold">Email</th>
                <th className="text-left px-5 py-2 font-semibold w-[110px]">關係</th>
                <th className="text-left px-5 py-2 font-semibold w-[80px]">狀態</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const roleLabel: Record<string, string> = {
                  primary: "主要聯絡人",
                  emergency: "緊急聯絡人",
                  family: "家屬",
                  secretary: "秘書 / 助理",
                  other: "其他",
                };
                const roleColor: Record<string, string> = {
                  primary: "bg-[#DEEBFF] text-[#0747A6]",
                  emergency: "bg-[#FFEBE6] text-[#BF2600]",
                  family: "bg-[#E3FCEF] text-[#006644]",
                  secretary: "bg-[#EAE6FF] text-[#403294]",
                  other: "bg-[#DFE1E6] text-[#42526E]",
                };
                return (
                  <tr
                    key={c.id}
                    className="border-t border-[#DFE1E6] hover:bg-[#F4F5F7] cursor-pointer"
                  >
                    <td className="px-5 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${roleColor[c.role] ?? roleColor.other}`}
                      >
                        {roleLabel[c.role] ?? c.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-medium">
                      <Link
                        href={`/admin/master-data/customers/${customer.id}/contacts/${c.id}`}
                        className="hover:text-[#0052CC]"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-mono text-[12px]">
                      {c.phone ?? <span className="text-[#6B778C]">—</span>}
                    </td>
                    <td className="px-5 py-3 text-[12px]">
                      {c.email ?? <span className="text-[#6B778C]">—</span>}
                    </td>
                    <td className="px-5 py-3 text-[12px]">
                      {c.relation ?? <span className="text-[#6B778C]">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {c.is_active ? (
                        <span className="text-[11px] text-[#006644]">●&nbsp;啟用</span>
                      ) : (
                        <span className="text-[11px] text-[#6B778C]">○&nbsp;停用</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
