import Link from "next/link";
import { redirect } from "next/navigation";

import { listAccounts } from "@/lib/master-data/queries";
import { createCustomerAction } from "@/lib/master-data/customer-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { CustomerForm } from "../_components/customer-form";

export const dynamic = "force-dynamic";

export default async function NewCustomerPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立客戶的權限</p>
      </main>
    );
  }

  const accounts = await listAccounts({ acctType: "asset" });

  return (
    <main className="px-6 py-6 max-w-[1100px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/customers" className="hover:text-[#172B4D]">
          客戶資料
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">新增客戶</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">新增客戶</h1>
        <p className="text-[13px] text-[#6B778C]">
          客戶名稱與類型必填；其餘欄位非必填，可日後補完
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        <CustomerForm
          mode="create"
          action={createCustomerAction}
          accounts={accounts}
        />
      </section>
    </main>
  );
}
