import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getSAEfficiencyScatter } from "@/domain/group-analytics";

import { SaEfficiencyBoard } from "./_components/sa-efficiency-board";

export const dynamic = "force-dynamic";

/**
 * GRP08 SA（服務顧問）能效診斷散佈圖（集團管理 · 個人能效）
 *
 * 權限守門沿用 GRP07（sales-efficiency/page.tsx）pattern：getCurrentUserAndAdmin()
 * → 未登入導 /login、非 admin 顯示紅字。集團診斷層屬管理者戰略視角。
 *
 * brand_id 解析走 getActiveScope().brand_id（server 端當前作用 brand 的單一事實來源）。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function SaEfficiencyPage() {
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
  const staff = await getSAEfficiencyScatter(brand_id);

  return <SaEfficiencyBoard staff={staff} />;
}
