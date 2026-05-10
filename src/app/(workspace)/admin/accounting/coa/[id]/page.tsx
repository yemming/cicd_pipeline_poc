import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { listL4ParentsAction } from "@/lib/accounting/coa-actions";
import { getChartOfAccountById } from "@/lib/accounting/queries";

import { CoaDetailView } from "./_components/coa-detail-view";

export const dynamic = "force-dynamic";

export default async function CoaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const [coa, parentsRes] = await Promise.all([
    getChartOfAccountById(id),
    listL4ParentsAction(),
  ]);
  const parents = parentsRes.ok ? parentsRes.data : [];

  return <CoaDetailView coa={coa} parents={parents} initialMode="view" />;
}
