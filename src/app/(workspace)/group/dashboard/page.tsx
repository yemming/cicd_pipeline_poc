import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getGroupOverview } from "@/domain/group-analytics";
import { getTechnicianEfficiencySummary } from "@/domain/aftersales-technicians";
import { getShopDailyHours } from "@/domain/service-bays";

import { GroupOverviewBoard } from "../group-overview/_components/group-overview-board";
import { TechnicianEfficiencySection } from "./_components/technician-efficiency-section";

export const dynamic = "force-dynamic";

/**
 * GRP04 集團看板（集團管理 · 集團總覽層）
 *
 * G1（2026-06-01）Stitch→React 升級：集團 KPI（門店彙總）+ 逐店摘要下鑽
 * + 售後人效統計（既有 C13b 真區塊）。複用 GRP01 GroupOverviewBoard（DRY）。
 *
 * 權限守門沿用 GRP01/16 pattern；brand_id 走 getActiveScope()。
 * 天條：page 不直連 supabase，資料只透過 @/domain helper。
 */
export default async function GroupDashboardPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團看板僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const [data, summary, dailyHours] = await Promise.all([
    getGroupOverview(brand_id),
    getTechnicianEfficiencySummary().catch(() => null),
    getShopDailyHours().catch(() => 9),
  ]);

  return (
    <GroupOverviewBoard
      data={data}
      title="集團看板"
      sprint="GRP04"
      caption="集團 KPI 彙總 · 逐店下鑽診斷 · 售後人效統計"
    >
      {summary ? (
        <TechnicianEfficiencySection kpis={summary.kpis} ranking={summary.ranking} dailyHours={dailyHours} />
      ) : null}
    </GroupOverviewBoard>
  );
}
