import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { SEARCH_REGISTRY } from "@/lib/search/global-search-registry";

import { SearchRegistryBoard } from "./_components/search-registry-board";

export const dynamic = "force-dynamic";

export default async function GlobalSearchRegistryPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">
          需要管理員權限才能檢視 Global Search 設定
        </p>
      </main>
    );
  }

  // 把 SearchTableSpec 拆掉 toHit() function(serialize 過不去),只 pass 純資料給 client
  const rows = SEARCH_REGISTRY.map((s) => ({
    entityType: s.entityType,
    label: s.label,
    icon: s.icon,
    color: s.color,
    description: s.description,
    table: s.table,
    searchFields: s.searchFields,
    sortColumn: s.sortColumn ?? "updated_at",
    entryHref: s.entryHref,
  }));

  return <SearchRegistryBoard rows={rows} />;
}
