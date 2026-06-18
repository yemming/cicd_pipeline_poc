import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getInternalSaleIssuesPageData } from "@/domain/internal-sale-issues";

import { InternalSaleBoard } from "./_components/internal-sale-board";

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  delivery_status?: string;
  payment_status?: string;
  warehouse_id?: string;
  destination_store_id?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
};

export default async function InternalSaleIssuePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ISSUE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視內售出貨的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const filter = {
    status: sp.status ?? "all",
    delivery_status: sp.delivery_status ?? "all",
    payment_status: sp.payment_status ?? "all",
    warehouse_id: sp.warehouse_id ?? "",
    destination_store_id: sp.destination_store_id ?? "",
    q: sp.q ?? "",
    date_from: sp.date_from ?? "",
    date_to: sp.date_to ?? "",
  };

  const page = await getInternalSaleIssuesPageData({
    status: filter.status,
    delivery_status: filter.delivery_status,
    payment_status: filter.payment_status,
    warehouse_id: filter.warehouse_id || undefined,
    destination_store_id: filter.destination_store_id || undefined,
    q: filter.q || undefined,
    date_from: filter.date_from || undefined,
    date_to: filter.date_to || undefined,
  });

  return (
    <InternalSaleBoard
      rows={page.rows}
      total={page.total}
      kpis={page.kpis}
      warehouses={page.warehouses}
      destinationStores={page.destinationStores}
      filter={filter}
      canEdit={page.canEdit}
      loadError={page.loadError}
    />
  );
}
