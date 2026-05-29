import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getSalesEfficiencyScatter } from "@/domain/group-analytics";

import { SalesEfficiencyBoard } from "./_components/sales-efficiency-board";

export const dynamic = "force-dynamic";

/**
 * GRP07 銷售顧問能效散佈圖（集團管理 · 個人能效）
 *
 * 權限守門沿用財務報表頁 pattern（trial-balance/page.tsx）：getCurrentUserAndAdmin()
 * → 未登入導 /login、非 admin 顯示紅字。集團診斷層屬管理者戰略視角，與既有 /group
 * 模組一致先以 admin gate（目前 rbac 尚無 group-scoped permission code）。
 *
 * brand_id 解析走 getActiveScope().brand_id（@/lib/scope/active-scope 是 server 端
 * 當前作用 brand 的單一事實來源；env 只當沒登入 fallback）。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function SalesEfficiencyPage() {
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
  const staff = await getSalesEfficiencyScatter(brand_id);

  return <SalesEfficiencyBoard staff={staff} />;
}
