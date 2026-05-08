import Link from "next/link";
import { redirect } from "next/navigation";

import {
  listCustomers,
  listItems,
  listMotorcycleModels,
  listWorkOrders,
} from "@/lib/master-data/queries";
import { createWarrantyClaimAction } from "@/lib/master-data/warranty-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { WarrantyForm } from "../_components/warranty-form";

export const dynamic = "force-dynamic";

export default async function NewWarrantyClaimPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_SUBMIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立保固索賠的權限</p>
      </main>
    );
  }

  const [customers, models, workOrders, items] = await Promise.all([
    listCustomers({ limit: 500 }),
    listMotorcycleModels(),
    listWorkOrders({ limit: 500 }),
    listItems({ limit: 500 }),
  ]);

  return (
    <main className="px-6 py-6 max-w-[1200px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/warranty-claims" className="hover:text-[#172B4D]">
          保固索賠
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">新增索賠</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">新增保固索賠</h1>
        <p className="text-[13px] text-[#6B778C]">
          類型 / 索賠日期必選；料 / 工成本由 line items 自動加總
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        <WarrantyForm
          mode="create"
          action={createWarrantyClaimAction}
          customers={customers}
          models={models}
          workOrders={workOrders}
          items={items}
        />
      </section>
    </main>
  );
}
