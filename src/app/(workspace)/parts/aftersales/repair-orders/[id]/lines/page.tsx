import { notFound } from "next/navigation";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getRepairOrderLinesPageData } from "@/domain/repair-order-lines";

import { RepairOrderLinesView } from "./_components/repair-order-lines-view";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canView = await hasPermission(PERMISSIONS.RO_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-5">
        <div className="text-[#CC0000]">無權檢視此頁。</div>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);

  const data = await getRepairOrderLinesPageData(id);
  if (!data) notFound();

  return <RepairOrderLinesView data={data} canEdit={canEdit} />;
}
