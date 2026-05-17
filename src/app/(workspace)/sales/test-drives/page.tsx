/**
 * 試駕記錄 List View（GAP-03、P1-#12）
 *
 * 跟 /sales/testdrive（A11-v1 wizard）並存：
 *   - /sales/testdrive：一次性試駕流程 wizard（4-step）
 *   - /sales/test-drives：試駕記錄查詢與管理（本表）
 */

import { Suspense } from "react";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listTestDrives,
  getTestDriveLookups,
  TEST_DRIVES_PAGE_SIZE_DEFAULT,
} from "@/domain/sales-test-drives";

import TestDrivesBoard from "./_components/test-drives-board";

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  q?: string;
  page?: string;
};

export default async function TestDrivesListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = TEST_DRIVES_PAGE_SIZE_DEFAULT;
  const filterStatus = sp.status ?? "";
  const filterQ = sp.q ?? "";

  const [{ rows, totalCount }, lookups, canView, canEdit] = await Promise.all([
    listTestDrives({
      status: filterStatus || undefined,
      q: filterQ || undefined,
      page,
      pageSize,
    }),
    getTestDriveLookups(),
    hasPermission(PERMISSIONS.SALES_ORDER_VIEW),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  if (!canView) {
    return (
      <main className="px-6 py-5">
        <p className="text-[13px] text-[#CC0000]">沒有檢視試駕記錄的權限。</p>
      </main>
    );
  }

  return (
    <Suspense fallback={null}>
      <TestDrivesBoard
        rows={rows}
        totalCount={totalCount}
        page={page}
        pageSize={pageSize}
        filterStatus={filterStatus}
        filterQ={filterQ}
        canEdit={canEdit}
        lookups={lookups}
      />
    </Suspense>
  );
}
