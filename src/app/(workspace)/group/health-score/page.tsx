import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getDealerHealthScores, getStoreScoreHistory } from "@/domain/group-analytics";

import { HealthScoreBoard } from "./_components/health-score-board";

export const dynamic = "force-dynamic";

/**
 * GRP16 Dealer Health Score（集團管理 · 策略評估層）
 *
 * 集團總部一眼看遍所有門店健康度：把每間店壓成 0-100 綜合健康分 + 六維雷達，揪出標竿
 * 與墊底店。是個人能效（GRP07/08）→ 門店診斷（GRP09/10/11）金字塔的**最頂層收斂**。
 *
 * 「全集團總覽」無門店切換器（不收 ?store=）：一次撈全部門店的 health score + 近 5 季歷史，
 * 全部交給 client board 組裝（gauge / KPI 卡 / 評分卡 grid / 雷達 / 走勢 / 改善建議 / 排行）。
 *
 * 權限守門沿用 GRP09/10/11 pattern：getCurrentUserAndAdmin() → 未登入導 /login、
 * 非 admin 顯示紅字。策略評估屬集團決策者戰略視角。
 *
 * brand_id 解析走 getActiveScope().brand_id（server 端當前作用 brand 的單一事實來源）。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function HealthScorePage() {
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

  return <HealthScoreBoard scores={scores} history={history} />;
}
