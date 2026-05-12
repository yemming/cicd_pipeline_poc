import { notFound, redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getItemDetailPageData } from "@/domain/items";

import { ItemDetailView } from "./_components/item-detail-view";

export const dynamic = "force-dynamic";

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視商品基礎資料的權限</p>
      </main>
    );
  }

  const { id } = await params;
  const data = await getItemDetailPageData(id);
  if (!data) notFound();
  const canEdit = await hasPermission(PERMISSIONS.ITEM_EDIT);

  return <ItemDetailView {...data} canEdit={canEdit} />;
}
