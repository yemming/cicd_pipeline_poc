import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getPoGrnPageBundle } from "@/domain/receipts";
import { RECEIPTS_PAGE_SIZE_DEFAULT } from "@/domain/receipts.constants";
import {
  getDiscrepancyEntryData,
  listRecentDiscrepancies,
  type DiscrepancyEntryData,
  type ReceivingDiscrepancyRow,
} from "@/domain/receiving-discrepancies";

import { ReceiptsBoard } from "./_components/receipts-board";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視入庫單的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const pick = (k: string): string => {
    const v = sp[k];
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
  };

  const status = pick("status");
  const warehouseId = pick("warehouse_id");
  const q = pick("q");
  const dateFrom = pick("date_from");
  const dateTo = pick("date_to");
  const pageNum = Math.max(1, Number(pick("page")) || 1);
  const pageSize = RECEIPTS_PAGE_SIZE_DEFAULT;

  let bundle;
  let loadError: string | null = null;
  try {
    bundle = await getPoGrnPageBundle(
      {
        status: status || undefined,
        q: q || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        // warehouse_id 不在 ListReceiptsFilter 既有欄位裡，後面靠 client 端 KPI 範圍 filter 統一（或將來再擴）
      },
      { page: pageNum, pageSize },
    );
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    bundle = {
      rows: [],
      totalCount: 0,
      kpis: {
        totalCount: 0,
        draftCount: 0,
        completedCount: 0,
        cancelledCount: 0,
        paidCount: 0,
        returnedCount: 0,
        totalAmount: 0,
        totalQty: 0,
      },
      warehouses: [],
      canEdit: false,
    };
  }

  // warehouse_id 走 client side filter，因為 listReceipts 目前沒此參數；
  // bundle.rows 已是 server-paged，這裡再 in-page filter（POC 階段先這樣，rows 上限 50 不會問題）
  const filteredRows = warehouseId
    ? bundle.rows.filter((r) => r.warehouse_id === warehouseId)
    : bundle.rows;

  // 驗收差異三入口：候選料號/供應商 + 最近差異記錄（失敗不擋整頁，給空殼）
  let discrepancyEntry: DiscrepancyEntryData = { items: [], suppliers: [] };
  let recentDiscrepancies: ReceivingDiscrepancyRow[] = [];
  try {
    [discrepancyEntry, recentDiscrepancies] = await Promise.all([
      getDiscrepancyEntryData(),
      listRecentDiscrepancies({ limit: 20 }),
    ]);
  } catch {
    // 候選/列表撈不到不影響入庫主畫面
  }

  return (
    <ReceiptsBoard
      rows={filteredRows}
      total={bundle.totalCount}
      kpis={bundle.kpis}
      warehouses={bundle.warehouses}
      canEdit={bundle.canEdit}
      loadError={loadError}
      discrepancyItems={discrepancyEntry.items}
      discrepancySuppliers={discrepancyEntry.suppliers}
      recentDiscrepancies={recentDiscrepancies}
      filter={{
        status,
        warehouse_id: warehouseId,
        q,
        date_from: dateFrom,
        date_to: dateTo,
      }}
      pagination={{ page: pageNum, pageSize, totalCount: bundle.totalCount }}
    />
  );
}
