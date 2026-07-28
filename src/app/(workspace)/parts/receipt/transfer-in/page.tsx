import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getTransferInPageBundle } from "@/domain/transfers";
import { TRANSFERS_PAGE_SIZE_DEFAULT } from "@/domain/transfers.constants";

import { TransferInBoard } from "./_components/transfer-in-board";

export const dynamic = "force-dynamic";

export default async function TransferInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視調撥入庫的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const pick = (k: string): string => {
    const v = sp[k];
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
  };

  const q = pick("q");
  const status = pick("status");
  const sourceWh = pick("source_warehouse_id");
  const targetWh = pick("target_warehouse_id");
  const dateFrom = pick("date_from");
  const dateTo = pick("date_to");
  const pageNum = Math.max(1, Number(pick("page")) || 1);
  const pageSize = TRANSFERS_PAGE_SIZE_DEFAULT;

  let bundle;
  let loadError: string | null = null;
  try {
    bundle = await getTransferInPageBundle(
      {
        q: q || undefined,
        status: status || undefined,
        source_warehouse_id: sourceWh || undefined,
        target_warehouse_id: targetWh || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      },
      { page: pageNum, pageSize },
    );
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    bundle = {
      rows: [],
      totalCount: 0,
      kpis: {
        inTransitCount: 0,
        partialCount: 0,
        receivedRecentCount: 0,
        todayEtaCount: 0,
        delayedCount: 0,
        avgTransitDays: null,
        totalAmountReceivedRecent: 0,
      },
      warehouses: [],
      canEdit: false,
      canApprove: false,
    };
  }

  return (
    <TransferInBoard
      rows={bundle.rows}
      total={bundle.totalCount}
      kpis={bundle.kpis}
      warehouses={bundle.warehouses}
      canEdit={bundle.canEdit}
      canApprove={bundle.canApprove}
      loadError={loadError}
      filter={{
        q,
        status,
        source_warehouse_id: sourceWh,
        target_warehouse_id: targetWh,
        date_from: dateFrom,
        date_to: dateTo,
      }}
      pagination={{ page: pageNum, pageSize, totalCount: bundle.totalCount }}
    />
  );
}
