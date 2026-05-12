import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getItemsListPageData, type ItemFilters } from "@/domain/items";

import { ItemsBoard } from "./_components/items-board";

export const dynamic = "force-dynamic";

export type { ItemFilters };

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
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
  const canEdit = await hasPermission(PERMISSIONS.ITEM_EDIT);
  const sp = await searchParams;
  const filters: ItemFilters = {
    category: sp.category ?? "all",
    control: sp.control ?? "all",
    status: sp.status ?? "all",
    q: sp.q ?? "",
  };
  const autoOpenCreate = sp.new === "1";
  const { rows, suppliers, totalCount, categories, uoms, controlLevels } =
    await getItemsListPageData(filters);
  return (
    <ItemsBoard
      rows={rows}
      suppliers={suppliers}
      canEdit={canEdit}
      totalCount={totalCount}
      categories={categories}
      uoms={uoms}
      controlLevels={controlLevels}
      filters={filters}
      autoOpenCreate={autoOpenCreate}
    />
  );
}
