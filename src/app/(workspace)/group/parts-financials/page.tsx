import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  getGroupPartsFinancials,
  getStorePartsDrilldown,
  listDiagnosticStores,
  type StorePartsDrilldown,
} from "@/domain/group-analytics";

import { PartsFinancialsBoard } from "./_components/parts-financials-board";

export const dynamic = "force-dynamic";

/**
 * GRP12 集團零件財務總覽（集團管理 · 商務管理層）
 *
 * 零件這條 P&L 線的集團健康度：營收/毛利率/周轉/呆滯/供應商集中度/精品加裝。
 * 單頁雙視圖（集團總覽 + 單店深鑽），switchStore 為純前端切視圖（無 server 重撈）→
 * 一次撈集團 financials + 全部 5 店 drilldown 注入 client board。
 *
 * 權限守門沿用 GRP16/17/18 pattern：getCurrentUserAndAdmin() → 未登入導 /login、
 * 非 admin 顯示紅字。brand_id 走 getActiveScope().brand_id。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function PartsFinancialsPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團零件財務總覽僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const stores = await listDiagnosticStores(brand_id);

  const [group, drillsRaw] = await Promise.all([
    getGroupPartsFinancials(brand_id),
    Promise.all(stores.map((s) => getStorePartsDrilldown(brand_id, s.id))),
  ]);

  const drills = drillsRaw.filter((d): d is StorePartsDrilldown => d != null);

  return <PartsFinancialsBoard group={group} drills={drills} />;
}
