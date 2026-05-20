import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getReturnInPageBundle, type ReturnInFilter } from "@/domain/parts-return-in";

import { ReturnInBoard } from "./_components/return-in-board";

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

  const status = pick("status");
  const warehouse_id = pick("warehouse_id");
  const reason = pick("reason");
  const q = pick("q");
  const date_from = pick("date_from");
  const date_to = pick("date_to");

  const filter: ReturnInFilter = {};
  if (status) filter.status = status;
  if (warehouse_id) filter.warehouse_id = warehouse_id;
  if (reason) filter.reason = reason;
  if (q) filter.q = q;
  if (date_from) filter.date_from = date_from;
  if (date_to) filter.date_to = date_to;

  let bundle;
  let loadError: string | null = null;
  try {
    bundle = await getReturnInPageBundle(filter);
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

  return (
    <ReturnInBoard
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
    />
  );
}
