import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getEinvoiceDetailPageData } from "@/domain/einvoice";

import { EInvoiceDetailView } from "./_components/einvoice-detail-view";

export const dynamic = "force-dynamic";

export default async function EInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EINVOICE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視電子發票的權限</p>
      </main>
    );
  }

  const canVoid = await hasPermission(PERMISSIONS.EINVOICE_VOID);
  const canAllowance = await hasPermission(PERMISSIONS.EINVOICE_ALLOWANCE);

  const { id } = await params;
  const data = await getEinvoiceDetailPageData(id);
  if (!data) notFound();

  return (
    <EInvoiceDetailView
      einvoice={data.einvoice}
      allowances={data.allowances}
      voids={data.voids}
      canVoid={canVoid}
      canAllowance={canAllowance}
    />
  );
}
