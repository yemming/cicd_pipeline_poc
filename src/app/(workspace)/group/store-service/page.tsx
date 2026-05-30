import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  listDiagnosticStores,
  getStoreServiceDiagnostics,
  getStoreMonthlyTrend,
} from "@/domain/group-analytics";

import { StoreServiceBoard } from "./_components/store-service-board";

export const dynamic = "force-dynamic";

/**
 * GRP10 門店售後診斷（集團管理 · 門店診斷層）
 *
 * 選一間門店 → 看該店售後（維修/服務）部門單月體檢報告（維修台次達成率 / 單車產值 /
 * 主營毛利率 / 售後吸收率 / 返修率），全部 vs 集團均值對標 + 車間三率 + 台次月趨勢
 * （本年 vs 去年同期）+ 業務結構組成 + 零件庫存健康 + 精品加裝 + 近 5 月客戶流動
 * + 自動診斷文字。是 GRP08 SA 個人能效散佈圖的「上一層」（門店層上捲）。
 *
 * 視覺主角是「返修率告警橫幅」：售後品質指標（呼應建議書某店 45% 返修率案例）。
 *
 * 權限守門 / brand 解析 / 門店切換 全部沿用 GRP09 門店銷售診斷的同款 pattern：
 *   getCurrentUserAndAdmin() → 未登入導 /login、非 admin 紅字；
 *   brand_id 走 getActiveScope().brand_id（server 端當前作用 brand 單一事實來源）；
 *   門店切換走 URL ?store=<orgId>、page 讀 searchParams.store、預設取 stores[0]。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-analytics helper。
 */
export default async function StoreServicePage({
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
        getStoreServiceDiagnostics(brand_id, selectedStore),
        // 售後頁的月趨勢看「維修台次」（service_count），對映 GRP09 的 sales_volume
        getStoreMonthlyTrend(brand_id, selectedStore, "service_count"),
      ])
    : [null, { months: [], current: [], prevYear: [] }];

  return (
    <StoreServiceBoard
      stores={stores}
      selectedStore={selectedStore}
      data={data}
      trend={trend}
    />
  );
}
