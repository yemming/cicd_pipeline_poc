import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listTransfersPaged } from "@/domain/transfers";
import { TRANSFERS_PAGE_SIZE_DEFAULT } from "@/domain/transfers.constants";

import { TransfersInTransitBoard } from "./_components/transfers-in-transit-board";

export const dynamic = "force-dynamic";

const DEFAULT_STATUS_IN = ["in_transit", "partial"];

export default async function TransfersInTransitPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    date_from?: string;
    date_to?: string;
    page?: string;
  }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.TRANSFER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視調撥在途的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const pageSize = TRANSFERS_PAGE_SIZE_DEFAULT;

  // status select 解譯：空字串 = 預設只看在途/部分到貨；"__all__" = 全部不過濾 status；
  // 其他值（in_transit / partial / received / closed / cancelled）= 單一 status
  const rawStatus = sp.status ?? "";
  const filter: Parameters<typeof listTransfersPaged>[0] = {
    q: sp.q || undefined,
    date_from: sp.date_from || undefined,
    date_to: sp.date_to || undefined,
  };
  if (rawStatus === "" ) {
    filter.status_in = DEFAULT_STATUS_IN;
  } else if (rawStatus !== "__all__") {
    filter.status = rawStatus;
  }

  const { rows, totalCount } = await listTransfersPaged(filter, {
    page,
    pageSize,
  });

  return (
    <TransfersInTransitBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={pageSize}
      initialStatus={rawStatus}
      initialQ={sp.q ?? ""}
      initialDateFrom={sp.date_from ?? ""}
      initialDateTo={sp.date_to ?? ""}
    />
  );
}
