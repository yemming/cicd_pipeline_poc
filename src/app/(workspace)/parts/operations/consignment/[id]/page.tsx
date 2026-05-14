import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getConsignmentById } from "@/domain/consignment";

import { ConsignmentDetailView } from "./_components/consignment-detail-view";

export const dynamic = "force-dynamic";

export default async function ConsignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CONSIGNMENT_OPS))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視寄存管理的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const detail = await getConsignmentById(id);
  if (!detail) notFound();

  const canEdit = await hasPermission(PERMISSIONS.CONSIGNMENT_OPS);
  return <ConsignmentDetailView detail={detail} canEdit={canEdit} />;
}
