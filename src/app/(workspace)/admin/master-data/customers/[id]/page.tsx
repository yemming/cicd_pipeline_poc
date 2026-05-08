import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getCustomerById,
  listAccounts,
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
  const vehicles = await listCustomerVehicles({
    customerId: customer.id,
    activeOnly: false,
    limit: 50,
  });

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
    </main>
  );
}
