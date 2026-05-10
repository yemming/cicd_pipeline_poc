import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getWarehouseById, listStoreOptions } from "@/domain/org";
import { WarehouseDetailView } from "./_components/warehouse-detail-view";

export const dynamic = "force-dynamic";

export default async function WarehouseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WAREHOUSE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視倉庫的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.WAREHOUSE_EDIT);
  const { id } = await params;
  const [whRes, storesRes] = await Promise.all([getWarehouseById(id), listStoreOptions()]);
  if (whRes.error) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">載入失敗：{whRes.error}</p>
      </main>
    );
  }
  if (!whRes.data) notFound();
  return (
    <WarehouseDetailView
      warehouse={whRes.data}
      stores={storesRes.data}
      canEdit={canEdit}
      initialMode="view"
    />
  );
}
