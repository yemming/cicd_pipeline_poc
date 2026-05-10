import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import {
  getStoreById,
  listWarehouses,
  listRegionOptions,
  listSubsidiaryOptions,
} from "@/domain/org";
import { StoreDetailView } from "./_components/store-detail-view";

export const dynamic = "force-dynamic";

export default async function StoreDetailPage({
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
  const [storeRes, regionsRes, subsRes] = await Promise.all([
    getStoreById(id),
    listRegionOptions(),
    listSubsidiaryOptions(),
  ]);
  if (storeRes.error) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">載入失敗：{storeRes.error}</p>
      </main>
    );
  }
  if (!storeRes.data) notFound();
  const { data: warehouses } = await listWarehouses({ org_id: id });
  return (
    <StoreDetailView
      store={storeRes.data}
      warehouses={warehouses}
      regions={regionsRes.data}
      subsidiaries={subsRes.data}
      canEdit={canEdit}
      initialMode="view"
    />
  );
}
