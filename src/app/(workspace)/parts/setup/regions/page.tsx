import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { listRegions } from "@/domain/org";
import { RegionsBoard } from "./_components/regions-board";

export const dynamic = "force-dynamic";

export default async function RegionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
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
  const sp = await searchParams;
  const status = sp.status ?? "all";
  const filter = {
    q: sp.q ?? "",
    is_active: status === "active" ? true : status === "inactive" ? false : null,
  };
  const { data, error } = await listRegions(filter);
  return (
    <RegionsBoard
      rows={data}
      canEdit={canEdit}
      filterQ={filter.q}
      filterStatus={status}
      loadError={error}
      autoOpenCreate={sp.new === "1"}
    />
  );
}
