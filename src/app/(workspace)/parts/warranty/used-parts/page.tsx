import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getOldPartsPageData,
  listItemsForOldParts,
  listWarrantyWarehouses,
} from "@/domain/warranty";

import { UsedPartsBoard } from "./_components/used-parts-board";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  status?: string;
  wc_no?: string;
  ro_no?: string;
  keyword?: string;
  expiry_from?: string;
  page?: string;
}>;

export default async function UsedPartsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.USEDPART_OPS))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有舊件管理權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);

  const [{ rows, totalCount, stats, canEdit }, items, warehouses] =
    await Promise.all([
      getOldPartsPageData({
        status: sp.status,
        wc_no: sp.wc_no,
        ro_no: sp.ro_no,
        keyword: sp.keyword,
        expiry_from: sp.expiry_from,
        page: pageNum,
        pageSize: 50,
      }),
      listItemsForOldParts(),
      listWarrantyWarehouses(),
    ]);

  return (
    <UsedPartsBoard
      rows={rows}
      totalCount={totalCount}
      stats={stats}
      canEdit={canEdit}
      items={items}
      warehouses={warehouses}
      initialFilter={{
        status: sp.status ?? "all",
        wc_no: sp.wc_no ?? "",
        ro_no: sp.ro_no ?? "",
        keyword: sp.keyword ?? "",
        expiry_from: sp.expiry_from ?? "",
      }}
      currentPage={pageNum}
      pageSize={50}
    />
  );
}
