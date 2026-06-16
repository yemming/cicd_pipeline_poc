import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getReturnInPageBundle, type ReturnInFilter } from "@/domain/parts-return-in";
import {
  listReturnRequests,
  getReturnRequestsSummary,
  type ReturnRequestFilter,
} from "@/domain/parts-return-requests";

import { ReturnInTabs } from "./_components/return-in-tabs";

export const dynamic = "force-dynamic";

export default async function ReturnInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視退入單的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const pick = (k: string): string => {
    const v = sp[k];
    if (Array.isArray(v)) return v[0] ?? "";
    return v ?? "";
  };

  // Tab A 篩選參數
  const status = pick("status");
  const warehouse_id = pick("warehouse_id");
  const reason = pick("reason");
  const q = pick("q");
  const date_from = pick("date_from");
  const date_to = pick("date_to");

  const filterA: ReturnInFilter = {};
  if (status) filterA.status = status;
  if (warehouse_id) filterA.warehouse_id = warehouse_id;
  if (reason) filterA.reason = reason;
  if (q) filterA.q = q;
  if (date_from) filterA.date_from = date_from;
  if (date_to) filterA.date_to = date_to;

  // Tab B 篩選參數（source_type / status 獨立於 Tab A，用 rr_ 前綴避免 key 衝突）
  const rr_source_type = pick("rr_source_type");
  const rr_status = pick("rr_status");
  const rr_source_ro_id = pick("rr_source_ro_id");

  const filterB: ReturnRequestFilter = {};
  if (rr_source_type) filterB.source_type = rr_source_type as ReturnRequestFilter["source_type"];
  if (rr_status) filterB.status = rr_status as ReturnRequestFilter["status"];
  if (rr_source_ro_id) filterB.source_ro_id = rr_source_ro_id;

  // 平行撈兩個 Tab 的資料
  let bundle;
  let loadError: string | null = null;
  try {
    bundle = await getReturnInPageBundle(filterA);
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
    bundle = {
      rows: [],
      totalCount: 0,
      kpis: {
        totalCount: 0,
        draftCount: 0,
        postedCount: 0,
        cancelledCount: 0,
        totalQty: 0,
        totalAmount: 0,
        thisMonthCount: 0,
        thisMonthAmount: 0,
      },
      warehouses: [],
      reasonMix: [],
      canEdit: false,
    };
  }

  // Tab B：退料待確認（pending/overdue），不要 confirmed（UI 再過濾，但 server 先全撈讓 KPI 準確）
  const [returnRequests, returnSummary] = await Promise.all([
    listReturnRequests(filterB).catch(() => []),
    getReturnRequestsSummary().catch(() => ({
      pending: 0,
      overdue: 0,
      confirmed_today: 0,
    })),
  ]);

  return (
    <ReturnInTabs
      // Tab A
      rows={bundle.rows}
      total={bundle.totalCount}
      kpis={bundle.kpis}
      warehouses={bundle.warehouses}
      reasonMix={bundle.reasonMix}
      canEdit={bundle.canEdit}
      filter={{
        status: status || "all",
        warehouse_id,
        reason,
        q,
        date_from,
        date_to,
      }}
      loadError={loadError}
      // Tab B
      returnRequests={returnRequests}
      returnSummary={returnSummary}
    />
  );
}
