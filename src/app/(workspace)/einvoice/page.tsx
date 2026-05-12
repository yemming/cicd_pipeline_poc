import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getEinvoicesListPageData, type EInvoiceFilters } from "@/domain/einvoice";

import { EInvoiceBoard } from "./_components/einvoice-board";

export const dynamic = "force-dynamic";

export type { EInvoiceFilters };

export default async function EInvoiceListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
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
  const canEdit = await hasPermission(PERMISSIONS.EINVOICE_EDIT);

  const sp = await searchParams;
  const filters: EInvoiceFilters = {
    status:   sp.status   ?? "all",
    source:   sp.source   ?? "all",
    type:     sp.type     ?? "all",
    dateFrom: sp.dateFrom ?? "",
    dateTo:   sp.dateTo   ?? "",
    q:        sp.q        ?? "",
  };
  const { rows, totalCount } = await getEinvoicesListPageData(filters);

  return (
    <EInvoiceBoard
      rows={rows}
      totalCount={totalCount}
      canEdit={canEdit}
      filters={filters}
    />
  );
}
