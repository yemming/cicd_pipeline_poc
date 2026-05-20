import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getInternalSaleReceiptsPageData,
  type ListInternalSaleReceiptsFilter,
} from "@/domain/internal-sale-receipts";

import { InternalSaleBoard } from "./_components/internal-sale-board";

export const dynamic = "force-dynamic";

export default async function InternalSaleReceiptPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視內售入庫的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const pick = (k: string): string => {
    const v = sp[k];
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
  };

  const filter: ListInternalSaleReceiptsFilter = {};
  const status = pick("status");
  const warehouse_id = pick("warehouse_id");
  const q = pick("q");
  const date_from = pick("date_from");
  const date_to = pick("date_to");
  if (status) filter.status = status;
  if (warehouse_id) filter.warehouse_id = warehouse_id;
  if (q) filter.q = q;
  if (date_from) filter.date_from = date_from;
  if (date_to) filter.date_to = date_to;

  let pageData;
  let loadError: string | null = null;
  try {
    pageData = await getInternalSaleReceiptsPageData(filter);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    pageData = {
      rows: [],
      totalCount: 0,
      kpis: { totalCount: 0, draftCount: 0, postedCount: 0, totalQty: 0, totalAmount: 0 },
      warehouseOptions: [],
      canEdit: false,
    };
  }

  return (
    <InternalSaleBoard
      rows={pageData.rows}
      total={pageData.totalCount}
      kpis={pageData.kpis}
      warehouses={pageData.warehouseOptions}
      canEdit={pageData.canEdit}
      filter={{
        status: status || "all",
        warehouse_id,
        q,
        date_from,
        date_to,
      }}
      loadError={loadError}
    />
  );
}
