import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { listWarehouses, listStoreOptions } from "@/domain/org";
import { WarehousesBoard } from "./_components/warehouses-board";

export const dynamic = "force-dynamic";

export default async function WarehousesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
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
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const filter = {
    q: sp.q ?? "",
    org_id: sp.org_id || undefined,
    is_active: status === "active" ? true : status === "inactive" ? false : null,
  };
  const [whRes, storesRes] = await Promise.all([listWarehouses(filter), listStoreOptions()]);
  return (
    <WarehousesBoard
      rows={whRes.data}
      stores={storesRes.data}
      canEdit={canEdit}
      filterQ={filter.q}
      filterStatus={status}
      filterOrg={sp.org_id ?? "all"}
      loadError={whRes.error}
      autoOpenCreate={sp.new === "1"}
    />
  );
}
