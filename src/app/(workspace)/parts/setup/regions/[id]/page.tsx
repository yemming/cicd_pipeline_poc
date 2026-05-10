import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getRegionById, listStores } from "@/domain/org";
import { RegionDetailView } from "./_components/region-detail-view";

export const dynamic = "force-dynamic";

export default async function RegionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ORG_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視組織的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.ORG_EDIT);
  const { id } = await params;
  const { data: region, error } = await getRegionById(id);
  if (error) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">載入失敗：{error}</p>
      </main>
    );
  }
  if (!region) notFound();
  // 同步撈該區域底下的門店列表（顯示在 tab）
  const { data: stores } = await listStores({ region_id: id });
  return <RegionDetailView region={region} stores={stores} canEdit={canEdit} initialMode="view" />;
}
