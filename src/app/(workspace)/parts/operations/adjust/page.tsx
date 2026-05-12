import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getExceptionsPageData } from "@/domain/adjustments";
import { EXCEPTIONS_PAGE_SIZE_DEFAULT } from "@/domain/adjustments.constants";

import { ExceptionsBoard } from "../exceptions/_components/exceptions-board";

export const dynamic = "force-dynamic";

export default async function AdjustPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    status?: string;
    warehouse?: string;
    q?: string;
    page?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.EXCEPTION_OPS))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視庫存調整的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const pageSize = EXCEPTIONS_PAGE_SIZE_DEFAULT;
  const { rows, totalCount, canEdit, warehouses } = await getExceptionsPageData(
    {
      type: sp.type || undefined,
      status: sp.status || undefined,
      warehouse_id: sp.warehouse || undefined,
      q: sp.q || undefined,
    },
    { page, pageSize },
  );

  return (
    <ExceptionsBoard
      rows={rows}
      totalCount={totalCount}
      canEdit={canEdit}
      warehouses={warehouses}
      page={page}
      pageSize={pageSize}
      initialType={sp.type ?? ""}
      initialStatus={sp.status ?? ""}
      initialWarehouse={sp.warehouse ?? ""}
      initialQ={sp.q ?? ""}
    />
  );
}
