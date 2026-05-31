import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getUsedCarEfficiency, listUsedCarInventory } from "@/domain/group-analytics";

import { UsedCarEfficiencyBoard } from "./_components/usedcar-efficiency-board";

export const dynamic = "force-dynamic";

/**
 * GRP19 品牌認證中古車能效（集團管理 · 商務管理）
 *
 * 權限守門沿用集團診斷層 pattern。brand_id 走 getActiveScope()。
 * 全真資料驅動（used_car_inventory 聚合）。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function UsedCarEfficiencyPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團能效診斷僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const [stores, inventory] = await Promise.all([
    getUsedCarEfficiency(brand_id),
    listUsedCarInventory(brand_id),
  ]);

  return <UsedCarEfficiencyBoard stores={stores} inventory={inventory} />;
}
