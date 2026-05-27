/**
 * RS_INV02 到港確認 — 列表
 *
 * 整車供應鏈第 2 棒：新車到港逐台掃 VIN，確認後自動觸發 PDI 工單（PD-IN）。
 */

import {
  listArrivals,
  ARRIVAL_PAGE_SIZE_DEFAULT,
  type ArrivalFilters,
} from "@/domain/vehicle-arrivals";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import ArrivalBoard from "./_components/arrival-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "到港確認 | DealerOS",
};

export default async function ArrivalConfirmationPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限檢視到港確認</main>;
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const pageSize = ARRIVAL_PAGE_SIZE_DEFAULT;
  const filters: ArrivalFilters = {
    status: sp.status ?? "all",
    q: sp.q ?? "",
  };

  const [{ rows, totalCount }, canEdit] = await Promise.all([
    listArrivals(filters, { page, pageSize }),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  return (
    <ArrivalBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      canEdit={canEdit}
      filters={{ status: filters.status ?? "all", q: filters.q ?? "" }}
    />
  );
}
