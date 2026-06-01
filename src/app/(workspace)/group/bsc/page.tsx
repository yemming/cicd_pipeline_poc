import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getBscScorecard } from "@/domain/group-analytics";

import { BscBoard } from "./_components/bsc-board";

export const dynamic = "force-dynamic";

/**
 * GRP02 BSC 計分卡（集團管理 · 集團總覽層）
 *
 * 集團模組原本唯一還缺的頁（/group/bsc 之前是 404）。平衡計分卡：六大面向
 * （銷售 / 售後 / 零件 / 人才 / 客戶滿意 / 財務）集團均值 + 逐店體質。
 *
 * 權限守門沿用 GRP01 集團總覽 pattern；brand_id 走 getActiveScope()。
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function BscPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">BSC 計分卡僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const data = await getBscScorecard(brand_id);
  return <BscBoard data={data} />;
}
