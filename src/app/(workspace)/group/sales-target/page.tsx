import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getSalesTargetOverview } from "@/domain/group-analytics";

import { SalesTargetBoard } from "./_components/sales-target-board";

export const dynamic = "force-dynamic";

/**
 * GRP03 銷售目標監看（集團管理 · 集團總覽層）
 *
 * G1（2026-06-01）Stitch→React 升級：逐店目標達成（讀 kpi_snapshots 真資料）
 * + Pace 配速預測計算器（設計稿旗艦新功能）。
 *
 * 權限守門沿用 GRP09/16 pattern；brand_id 走 getActiveScope()。
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function SalesTargetPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團銷售目標監看僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const rows = await getSalesTargetOverview(brand_id);
  return <SalesTargetBoard rows={rows} />;
}
