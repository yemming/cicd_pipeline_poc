import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getCostRecoveryPageData } from "@/domain/warranty";
import { CostRecoveryBoard } from "./_components/cost-recovery-board";

export const dynamic = "force-dynamic";

type SearchParams = {
  status?: string;
  warranty_type?: string;
  month?: string;
  keyword?: string;
};

export default async function CostRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WARRANTY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視費用回收的權限</p>
      </main>
    );
  }
  const sp = (await searchParams) ?? {};
  const { config, claims, stats, warrantyTypes, canEdit } =
    await getCostRecoveryPageData({
      status: sp.status,
      warranty_type: sp.warranty_type,
      month: sp.month,
      keyword: sp.keyword,
    });

  return (
    <CostRecoveryBoard
      config={config}
      claims={claims}
      stats={stats}
      warrantyTypes={warrantyTypes}
      canEdit={canEdit}
      initialFilter={{
        status: sp.status ?? "all",
        warranty_type: sp.warranty_type ?? "all",
        month: sp.month ?? "",
        keyword: sp.keyword ?? "",
      }}
    />
  );
}
