import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getTransferOutPageData } from "@/domain/transfers";

import { TransferOutBoard } from "./_components/transfer-out-board";

export const dynamic = "force-dynamic";

export default async function TransferOutPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; source_warehouse_id?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.TRANSFER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視調撥出庫的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const { rows, canEdit, warehouses } = await getTransferOutPageData({
    status: sp.status || undefined,
    q: sp.q || undefined,
    source_warehouse_id: sp.source_warehouse_id || undefined,
  });

  return (
    <TransferOutBoard
      rows={rows}
      canEdit={canEdit}
      warehouses={warehouses}
      initialStatus={sp.status ?? ""}
      initialQ={sp.q ?? ""}
      initialSourceWarehouse={sp.source_warehouse_id ?? ""}
    />
  );
}
