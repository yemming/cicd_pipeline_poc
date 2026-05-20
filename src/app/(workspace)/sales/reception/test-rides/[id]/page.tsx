/**
 * 試駕記錄 detail（/sales/reception/test-rides/[id]）— RS02
 *
 * server component：撈該筆 row + lookups → 傳給 TestRideDetailView。
 */
import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getTestDriveById, getTestDriveLookups } from "@/domain/sales-test-drives";
import { TestRideDetailView } from "../_components/test-ride-detail-view";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "試駕記錄詳情 | DealerOS",
};

export default async function TestRideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const { id } = await params;

  const [row, lookups] = await Promise.all([
    getTestDriveById(id),
    getTestDriveLookups(),
  ]);
  if (!row) notFound();

  return <TestRideDetailView row={row} lookups={lookups} canEdit={canEdit} />;
}
