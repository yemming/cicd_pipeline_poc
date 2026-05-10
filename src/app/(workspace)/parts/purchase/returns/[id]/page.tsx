import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getPurchaseReturnById } from "@/domain/procurement";
import { ReturnDetailView } from "./_components/return-detail-view";

export const dynamic = "force-dynamic";

export default async function ReturnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視採購退貨的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.PO_RETURN);
  const canApprove = await hasPermission(PERMISSIONS.PO_APPROVE);
  const { id } = await params;

  let detail: Awaited<ReturnType<typeof getPurchaseReturnById>> = null;
  let loadError: string | null = null;
  try {
    detail = await getPurchaseReturnById(id);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  if (loadError) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">載入失敗：{loadError}</p>
      </main>
    );
  }
  if (!detail) notFound();

  return <ReturnDetailView detail={detail} canEdit={canEdit} canApprove={canApprove} />;
}
