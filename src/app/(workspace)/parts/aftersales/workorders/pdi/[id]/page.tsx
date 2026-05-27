import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getPdiWorkorderData } from "@/domain/pdi-workorder";

import { PdiWorkorderView } from "./_components/pdi-workorder-view";

export const dynamic = "force-dynamic";

export default async function PdiWorkorderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視工單的權限</p>
        <Link
          href="/parts/aftersales/repair-orders"
          className="text-[#185FA5] underline text-[12px]"
        >
          ← 回工單列表
        </Link>
      </main>
    );
  }

  const { id } = await params;
  const data = await getPdiWorkorderData(id);
  if (!data) notFound();

  // 執行 / 存（技師）= PDI_EXECUTE；完成核准（寫回成本 + 車變可售）= RO_APPROVE
  const [canExecute, canApprove] = await Promise.all([
    hasPermission(PERMISSIONS.PDI_EXECUTE),
    hasPermission(PERMISSIONS.RO_APPROVE),
  ]);

  return <PdiWorkorderView data={data} canExecute={canExecute} canApprove={canApprove} />;
}
