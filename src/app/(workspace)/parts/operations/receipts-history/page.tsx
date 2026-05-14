import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listReceipts } from "@/domain/receipts";
import { RECEIPTS_PAGE_SIZE_DEFAULT } from "@/domain/receipts.constants";

import { ReceiptsHistoryBoard } from "./_components/receipts-history-board";

export const dynamic = "force-dynamic";

export default async function ReceiptsHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{
    type?: string;
    status?: string;
    q?: string;
    date_from?: string;
    date_to?: string;
    page?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視入庫紀錄的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = RECEIPTS_PAGE_SIZE_DEFAULT;

  const { rows, totalCount } = await listReceipts(
    {
      type: sp.type || undefined,
      status: sp.status || undefined,
      q: sp.q || undefined,
      date_from: sp.date_from || undefined,
      date_to: sp.date_to || undefined,
    },
    { page, pageSize },
  );

  return (
    <ReceiptsHistoryBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      initialType={sp.type ?? ""}
      initialStatus={sp.status ?? ""}
      initialQ={sp.q ?? ""}
      initialDateFrom={sp.date_from ?? ""}
      initialDateTo={sp.date_to ?? ""}
    />
  );
}
