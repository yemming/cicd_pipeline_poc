import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getRoCheckoutById } from "@/domain/ro-checkouts";

import { RoCheckoutWizard } from "../_components/ro-checkout-wizard";

export const dynamic = "force-dynamic";

export default async function RoCheckoutDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視結帳收款的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CLOSE);
  const { id } = await params;
  const data = await getRoCheckoutById(id);
  if (!data) return notFound();
  return <RoCheckoutWizard data={data} canEdit={canEdit} />;
}
