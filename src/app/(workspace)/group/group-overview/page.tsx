import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getGroupOverview } from "@/domain/group-analytics";

import { GroupOverviewBoard } from "./_components/group-overview-board";

export const dynamic = "force-dynamic";

/**
 * GRP01 集團總覽（集團管理 · 集團總覽層）
 *
 * G1（2026-06-01）Stitch→React 升級：集團主管每日首頁，集團層 KPI（門店彙總）
 * + 逐店摘要，每店下鑽至 GRP09 門店銷售 / GRP10 門店售後（設計稿「下鑽真跳轉」）。
 *
 * 權限守門沿用 GRP09/16 pattern；brand_id 走 getActiveScope()。
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function GroupOverviewPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團總覽僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const data = await getGroupOverview(brand_id);
  return <GroupOverviewBoard data={data} />;
}
