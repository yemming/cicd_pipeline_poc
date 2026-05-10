import Link from "next/link";
import { redirect } from "next/navigation";

import { listWarehouses } from "@/lib/master-data/queries";
import { createReplenishmentPolicyAction } from "@/lib/master-data/replenishment-policy-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { ReplenishmentPolicyForm } from "../_components/replenishment-policy-form";

export const dynamic = "force-dynamic";

export default async function NewReplenishmentPolicyPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立補貨計畫的權限</p>
      </main>
    );
  }

  const warehouses = await listWarehouses();

  return (
    <main className="px-6 py-6 max-w-[900px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/replenishment-policies" className="hover:text-[#172B4D]">
          補貨計畫設定
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">新增計畫</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">新增補貨計畫</h1>
        <p className="text-[13px] text-[#6B778C]">
          一個 brand 至少要有一筆「全域預設」（warehouse 留空），各倉可再覆蓋
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        <ReplenishmentPolicyForm
          mode="create"
          action={createReplenishmentPolicyAction}
          warehouses={warehouses}
        />
      </section>
    </main>
  );
}
