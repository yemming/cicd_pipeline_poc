import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getTechEfficiencyScatter } from "@/domain/group-analytics";

import { TechEfficiencyBoard } from "./_components/tech-efficiency-board";

export const dynamic = "force-dynamic";

/**
 * GRP15 技師效率診斷散佈圖（集團管理 · 個人能效）
 *
 * 權限守門沿用 GRP08（sa-efficiency/page.tsx）pattern：getCurrentUserAndAdmin()
 * → 未登入導 /login、非 admin 顯示紅字。brand_id 走 getActiveScope()。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function TechEfficiencyPage() {
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
  const staff = await getTechEfficiencyScatter(brand_id);

  return <TechEfficiencyBoard staff={staff} />;
}
