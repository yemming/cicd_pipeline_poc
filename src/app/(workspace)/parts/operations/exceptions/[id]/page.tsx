import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAdjustmentById } from "@/domain/adjustments";

import { ExceptionDetailView } from "./_components/exception-detail-view";

export const dynamic = "force-dynamic";

export default async function ExceptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EXCEPTION_OPS))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視例外調整單的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const detail = await getAdjustmentById(id);
  if (!detail) notFound();

  const canEdit = await hasPermission(PERMISSIONS.EXCEPTION_OPS);
  return <ExceptionDetailView detail={detail} canEdit={canEdit} />;
}
