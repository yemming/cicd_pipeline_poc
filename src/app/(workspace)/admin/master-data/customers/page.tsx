import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listCustomersForAdmin } from "@/domain/customers";

import { CustomersBoard, type CustomerFilters } from "./_components/customers-board";

export const dynamic = "force-dynamic";

export default async function CustomersAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const sp = await searchParams;
  const filters: CustomerFilters = {
    type: sp.type ?? "all",
    status: sp.status ?? "all",
    q: sp.q ?? "",
  };

  const { rows, totalCount } = await listCustomersForAdmin(filters);

  return (
    <CustomersBoard
      rows={rows}
      totalCount={totalCount}
      canEdit={canEdit}
      filters={filters}
    />
  );
}
