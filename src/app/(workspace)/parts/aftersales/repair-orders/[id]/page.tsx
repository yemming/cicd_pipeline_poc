import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getRepairOrderById, listRepairOrderEvents } from "@/domain/repair-orders";

import { RepairOrderDetailView } from "./_components/repair-order-detail-view";

export const dynamic = "force-dynamic";

export default async function RepairOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視維修工單的權限</p>
        <Link href="/parts/aftersales/repair-orders" className="text-[#185FA5] underline text-[12px]">
          ← 回工單列表
        </Link>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const { id } = await params;
  const [ro, roEvents] = await Promise.all([
    getRepairOrderById(id),
    listRepairOrderEvents(id),
  ]);
  if (!ro) notFound();
  return <RepairOrderDetailView ro={ro} canEdit={canEdit} roEvents={roEvents} />;
}
