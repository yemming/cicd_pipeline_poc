import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getCrossDeptScatter } from "@/domain/group-analytics";

import { CrossDeptEfficiencyBoard } from "./_components/cross-dept-efficiency-board";

export const dynamic = "force-dynamic";

/**
 * GRP11 跨部門能效（集團管理 · 個人能效）
 *
 * 命題：「客戶流失不是部門問題，是個人問題」。把銷售（GRP07）與售後（GRP08）
 * 兩支個人能效散佈圖跨部門 union 到同一張圖上，用系統 NPS 替代拿不到的原廠
 * CSI，讓「衝量卻流失客戶」的人自己跑到危險象限。
 *
 * 權限守門沿用 GRP07/08 pattern：getCurrentUserAndAdmin() → 未登入導 /login、
 * 非 admin 顯示紅字。集團診斷層屬管理者戰略視角。
 *
 * brand_id 解析走 getActiveScope().brand_id（server 端當前作用 brand 的單一事實來源）。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function CrossDeptEfficiencyPage() {
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
  const staff = await getCrossDeptScatter(brand_id);

  return <CrossDeptEfficiencyBoard staff={staff} />;
}
