import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  listDiagnosticStores,
  getStoreSalesDiagnostics,
  getStoreMonthlyTrend,
} from "@/domain/group-analytics";

import { StoreSalesBoard } from "./_components/store-sales-board";

export const dynamic = "force-dynamic";

/**
 * GRP09 門店銷售診斷（集團管理 · 門店診斷層）
 *
 * 選一間門店 → 看該店新車銷售部門單月體檢報告（達成率 / 成交率 / GP3 / 衍生毛利），
 * 全部 vs 集團均值對標 + 銷售漏斗 + 月度銷量趨勢（本年 vs 去年同期）+ 衍生滲透率對比
 * + 自動診斷文字。是 GRP07 個人能效散佈圖的「上一層」（門店層上捲）。
 *
 * 權限守門沿用 GRP07/08/11 pattern：getCurrentUserAndAdmin() → 未登入導 /login、
 * 非 admin 顯示紅字。集團診斷層屬管理者戰略視角。
 *
 * brand_id 解析走 getActiveScope().brand_id（server 端當前作用 brand 的單一事實來源）。
 *
 * 門店切換走 URL ?store=<orgId>：page 讀 searchParams.store、預設取 stores[0]；board
 * 用 router.push 推 ?store= + useTransition pending 視覺（會打 server 重撈，照 UX 規範鎖 UI）。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function StoreSalesPage({
  searchParams,
}: {
  searchParams: Promise<{ store?: string }>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團門店診斷僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();
  const { store: storeParam } = await searchParams;

  const stores = await listDiagnosticStores(brand_id);
  const selectedStore = storeParam ?? stores[0]?.id ?? null;

  // 沒有任何門店 → board 自會顯示空狀態（data/trend 皆 null/空）
  const [data, trend] = selectedStore
    ? await Promise.all([
        getStoreSalesDiagnostics(brand_id, selectedStore),
        getStoreMonthlyTrend(brand_id, selectedStore, "sales_volume"),
      ])
    : [null, { months: [], current: [], prevYear: [] }];

  return (
    <StoreSalesBoard
      stores={stores}
      selectedStore={selectedStore}
      data={data}
      trend={trend}
    />
  );
}
