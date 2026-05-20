/**
 * /parts/aftersales — 售後修護模組導覽
 *
 * M03-1 升 A 級（第十輪 BDN）：重設為 ModuleHomeGallery 圖卡導覽 + 動態 KPI +「今日焦點」。
 *
 * 舊版的 <AftersalesFlowDiagram>（pipeline 視覺化）保留並掛在 `/service` route
 * （src/app/(workspace)/service/aftersales/page.tsx 之類），不在這支 page 沿用。
 *
 * 資料：透過 @/domain/aftersales-overview 取 4 KPI + 4 focus items；
 * helper 內部走 supabase server client（brand-scoped via active scope cookie）。
 *
 * 錯誤 fallback：KPI 撈失敗時不阻塞 render，client 顯示 "—" + 紅 banner 提示。
 */

import {
  getAftersalesOverviewStats,
  getAftersalesFocusItems,
} from "@/domain/aftersales-overview";

import AftersalesHomeView from "./_components/aftersales-home-view";

export const dynamic = "force-dynamic";

export default async function PartsAftersalesPage() {
  // 並行撈 KPI + focus；任一爆掉就整批走 errored fallback（仍能渲染分區入口）
  const [kpis, focusItems, errored] = await Promise.all([
    getAftersalesOverviewStats().catch((err) => {
      console.warn("[/parts/aftersales] getAftersalesOverviewStats failed", err);
      return null;
    }),
    getAftersalesFocusItems().catch((err) => {
      console.warn("[/parts/aftersales] getAftersalesFocusItems failed", err);
      return null;
    }),
    Promise.resolve(false),
  ]);

  const isErrored = kpis === null || focusItems === null;

  return (
    <AftersalesHomeView
      kpis={kpis}
      focusItems={focusItems}
      errored={isErrored || errored}
    />
  );
}
