import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAddonById, listLinesFromAddon } from "@/domain/repair-order-addons";

import { AddonDetailView } from "./_components/addon-detail-view";

export const dynamic = "force-dynamic";

export default async function AddonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視追加項目的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const { id } = await params;

  const [addon, lines] = await Promise.all([
    getAddonById(id),
    listLinesFromAddon(id),
  ]);
  if (!addon) notFound();

  return <AddonDetailView addon={addon} lines={lines} canEdit={canEdit} />;
}
