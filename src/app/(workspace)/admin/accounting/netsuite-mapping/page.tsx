import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { listNetsuiteMappings } from "@/domain/accounting";

import { MappingBoard } from "./_components/mapping-board";

export const dynamic = "force-dynamic";

export default async function NetsuiteMappingPage({
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
  const filters = { dim: sp.dim ?? "all" };
  const { rows, totalCount } = await listNetsuiteMappings(filters);

  return <MappingBoard rows={rows} totalCount={totalCount} filters={filters} />;
}
