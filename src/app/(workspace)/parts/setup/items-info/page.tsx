import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getItemsInfoPageData } from "@/domain/items";

import { ItemsInfoBoard } from "./_components/items-info-board";

export const dynamic = "force-dynamic";

export default async function ItemsInfoPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sku_type?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視商品資訊的權限</p>
      </main>
    );
  }

  const sp = await searchParams;
  const { result, searched, canEdit } = await getItemsInfoPageData({
    q: sp.q || undefined,
    sku_type: sp.sku_type || undefined,
  });

  return (
    <ItemsInfoBoard
      initialQ={sp.q ?? ""}
      initialSkuType={sp.sku_type ?? ""}
      result={result}
      searched={searched}
      canEdit={canEdit}
    />
  );
}
