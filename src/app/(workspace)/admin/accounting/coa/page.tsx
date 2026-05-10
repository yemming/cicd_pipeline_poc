import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  COA_PAGE_SIZE_DEFAULT,
  listChartOfAccounts,
  type CoaFilters,
} from "@/lib/accounting/queries";

import { CoaBoard } from "./_components/coa-board";

export const dynamic = "force-dynamic";

export default async function CoaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">會計財務設定僅限管理者使用</p>
      </main>
    );
  }

  const sp = await searchParams;
  const filters: CoaFilters = {
    q: sp.q ?? "",
    l1: sp.l1 ?? "all",
    dealer: sp.dealer ?? "all",
    level: sp.level ?? "all",
    postable: sp.postable ?? "all",
    status: sp.status ?? "all",
  };

  const pageRaw = Number(sp.page);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const pageSize = COA_PAGE_SIZE_DEFAULT;

  const { rows, totalCount } = await listChartOfAccounts(filters, { page, pageSize });

  return (
    <CoaBoard
      rows={rows}
      totalCount={totalCount}
      filters={filters}
      page={page}
      pageSize={pageSize}
    />
  );
}
