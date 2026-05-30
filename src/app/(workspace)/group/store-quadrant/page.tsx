import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getDealerHealthScores, getStoreScoreHistory } from "@/domain/group-analytics";

import { StoreQuadrantBoard } from "./_components/store-quadrant-board";

export const dynamic = "force-dynamic";

/**
 * GRP17 門店評估四象限（集團管理 · 策略評估層）
 *
 * 集團總部的「戰略定位」視圖：把所有門店擺進「X 軸 × Y 軸」二維平面，依**動態均值十字**
 * 切四象限，一眼分卓越 / 穩健 / 待發展 / 重點輔導（BCG 矩陣式），做資源分配與輔導名單決策。
 * 是 GRP16 健康分數頁（light，逐店體檢）的「同層姊妹」——GRP16 看「每店多深」、GRP17 看
 * 「全集團相對定位」。兩頁共用同一份 StoreHealthScore[] + StoreScoreHistory[]。
 *
 * 「全集團總覽」無門店切換器（不收 ?store=）：一次撈全部門店的 health score + 近 5 季歷史，
 * 全部交給 client board 純前端 redraw（軸切換 / 圓圈大小 / 軌跡 toggle 都不打 server）。
 *
 * 權限守門沿用 GRP16/09/10/11 pattern：getCurrentUserAndAdmin() → 未登入導 /login、
 * 非 admin 顯示紅字。策略評估屬集團決策者戰略視角。
 *
 * brand_id 解析走 getActiveScope().brand_id（server 端當前作用 brand 的單一事實來源）。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function StoreQuadrantPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團策略評估僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();

  const [scores, history] = await Promise.all([
    getDealerHealthScores(brand_id),
    getStoreScoreHistory(brand_id),
  ]);

  return <StoreQuadrantBoard scores={scores} history={history} />;
}
