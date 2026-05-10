import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  getWarrantyClaimById,
  listCustomers,
  listItems,
  listVehicleModels,
  listWarrantyClaimLines,
  listWorkOrders,
} from "@/lib/master-data/queries";
import { updateWarrantyClaimAction } from "@/lib/master-data/warranty-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { WarrantyForm } from "../_components/warranty-form";

export const dynamic = "force-dynamic";

export default async function EditWarrantyClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視保固索賠的權限</p>
      </main>
    );
  }

  const [claim, customers, models, workOrders, items] = await Promise.all([
    getWarrantyClaimById(id),
    listCustomers({ activeOnly: false, limit: 1000 }),
    listVehicleModels(),
    listWorkOrders({ limit: 500 }),
    listItems({ limit: 500 }),
  ]);
  if (!claim) notFound();

  const lines = await listWarrantyClaimLines(claim.id);

  const canEdit = await hasPermission(PERMISSIONS.WARRANTY_SUBMIT);

  return (
    <main className="px-6 py-6 max-w-[1200px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/warranty-claims" className="hover:text-[#172B4D]">
          保固索賠
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">{claim.cl_no}</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          編輯保固索賠 ・ {claim.cl_no}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          建立於{" "}
          {new Date(claim.created_at).toLocaleString("zh-TW", {
            timeZone: "Asia/Taipei",
          })}{" "}
          ・ {lines.length} 筆料號
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <WarrantyForm
            mode="edit"
            action={updateWarrantyClaimAction}
            claim={claim}
            initialLines={lines}
            customers={customers}
            models={models}
            workOrders={workOrders}
            items={items}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">僅可檢視；沒有編輯權限</p>
        )}
      </section>
    </main>
  );
}
