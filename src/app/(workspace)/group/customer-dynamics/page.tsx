import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  getGroupCustomerDynamics,
  getStoreCustomerJourney,
  listDiagnosticStores,
  type StoreCustomerJourney,
} from "@/domain/group-analytics";

import { CustomerDynamicsBoard } from "./_components/customer-dynamics-board";

export const dynamic = "force-dynamic";

/**
 * GRP18 集團客戶動態（集團管理 · 策略評估層）
 *
 * 客戶經營面向：客戶旅程漏斗 × 來源分析 × 流入流失 × 高風險流失預警。是集團金字塔
 * 「人(GRP07/08)→ 店(GRP09/10/11)→ 戰略(GRP16/17)」之後的**第四面向：客戶**。
 *
 * 單頁雙視圖：集團總覽 + 單店深鑽。switchStore 為**純前端切視圖**（無 ?store= server 重撈）→
 * 一次撈集團 dynamics + 全部 5 店 journey 注入 client board，前端 toggle 即可。
 *
 * 權限守門沿用 GRP16/17 pattern：getCurrentUserAndAdmin() → 未登入導 /login、非 admin 顯示紅字。
 * brand_id 走 getActiveScope().brand_id。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function CustomerDynamicsPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團客戶動態僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const stores = await listDiagnosticStores(brand_id);

  const [group, journeysRaw] = await Promise.all([
    getGroupCustomerDynamics(brand_id),
    Promise.all(stores.map((s) => getStoreCustomerJourney(brand_id, s.id))),
  ]);

  const journeys = journeysRaw.filter((j): j is StoreCustomerJourney => j != null);

  return <CustomerDynamicsBoard group={group} journeys={journeys} />;
}
