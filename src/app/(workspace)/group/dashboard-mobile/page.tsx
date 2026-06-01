import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getGroupOverview } from "@/domain/group-analytics";

import { GroupMobileBoard } from "./_components/group-mobile-board";

export const dynamic = "force-dynamic";

/**
 * GRP06 集團儀表板手機版（集團管理 · 集團總覽層）
 *
 * G1（2026-06-01）Stitch→React 升級：集團總經理出差用手機掌握即時數據，
 * 點門店卡片下鑽 GRP09/10。複用 GRP01 getGroupOverview。
 *
 * 權限守門沿用 GRP01 pattern；brand_id 走 getActiveScope()。
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function GroupDashboardMobilePage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-4 py-6">
        <p className="text-[14px] text-[#CC0000]">集團看板僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const data = await getGroupOverview(brand_id);
  return <GroupMobileBoard data={data} />;
}
