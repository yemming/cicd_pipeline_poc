/**
 * 試乘試駕 List View（/sales/reception/test-rides）— RS02
 *
 * server component：撈 rows + stats + lookups → 傳給 DB-backed TestRidesBoard。
 * 權限對齊 [id]/page.tsx（CUSTOMER_VIEW / CUSTOMER_EDIT），actions 也 gate 在 CUSTOMER_EDIT。
 * 一次性 wizard（不寫 DB）改掛在 /sales/reception/test-rides/wizard。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listTestDrives,
  getTestDriveStats,
  getTestDriveLookups,
  TEST_DRIVES_PAGE_SIZE_DEFAULT,
} from "@/domain/sales-test-drives";
import type { ListTestDrivesFilter } from "@/domain/sales-test-drives.constants";

import { TestRidesBoard } from "./_components/test-rides-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "試乘試駕 | DealerOS",
};

type SearchParams = {
  status?: string;
  sa?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: string;
};

export default async function TestRidesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視試駕記錄的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const pageSize = TEST_DRIVES_PAGE_SIZE_DEFAULT;

  const filters: ListTestDrivesFilter = {
    status: sp.status || undefined,
    sales_consultant_id: sp.sa || undefined,
    date_from: sp.from || undefined,
    date_to: sp.to || undefined,
    q: sp.q || undefined,
    page,
    pageSize,
  };

  const [{ rows, totalCount }, stats, lookups, canEdit] = await Promise.all([
    listTestDrives(filters),
    getTestDriveStats(),
    getTestDriveLookups(),
    hasPermission(PERMISSIONS.CUSTOMER_EDIT),
  ]);

  return (
    <TestRidesBoard
      rows={rows}
      totalCount={totalCount}
      stats={stats}
      filters={filters}
      lookups={lookups}
      canEdit={canEdit}
      page={page}
      pageSize={pageSize}
    />
  );
}
