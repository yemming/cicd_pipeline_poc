import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getHandoffById } from "@/domain/ro-handoffs";

import { HandoffDetailView } from "./_components/handoff-detail-view";

export const dynamic = "force-dynamic";

export default async function ROHandoffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  const canView = await hasPermission(PERMISSIONS.RO_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-8 text-[13px] text-[#CC0000]">
        無權限檢視此頁面（service.ro.view）
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);

  const { id } = await params;
  const detail = await getHandoffById(id);
  if (!detail) notFound();

  return <HandoffDetailView detail={detail} canEdit={canEdit} />;
}
