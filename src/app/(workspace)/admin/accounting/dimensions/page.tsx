import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { listGlDimensions, type DimensionFilters } from "@/lib/accounting/queries";

import { DimensionsBoard } from "./_components/dimensions-board";

export const dynamic = "force-dynamic";

export default async function DimensionsPage({
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
  const filters: DimensionFilters = {
    q: sp.q ?? "",
    scope: sp.scope ?? "all",
    segment: sp.segment ?? "all",
    status: sp.status ?? "all",
  };

  const { rows, totalCount } = await listGlDimensions(filters);

  return <DimensionsBoard rows={rows} totalCount={totalCount} filters={filters} />;
}
