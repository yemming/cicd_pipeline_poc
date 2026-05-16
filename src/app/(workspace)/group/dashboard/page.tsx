import { StitchInline } from "@/components/stitch-inline";
import { loadStitchBody } from "@/lib/load-stitch-body";
import { getTechnicianEfficiencySummary } from "@/domain/aftersales-technicians";
import { getShopDailyHours } from "@/domain/service-bays";
import { TechnicianEfficiencySection } from "./_components/technician-efficiency-section";

export default async function Page() {
  // 集團看板 - C13b 售後人效統計（read-only KPI + 排行）
  // helper 失敗時降級成只渲染 Stitch，不阻斷既有看板
  const [html, summary, dailyHours] = await Promise.all([
    loadStitchBody("0f7df3e575254e96b24b084be30179c1"),
    getTechnicianEfficiencySummary().catch(() => null),
    getShopDailyHours().catch(() => 9),
  ]);

  return (
    <>
      {summary ? (
        <TechnicianEfficiencySection
          kpis={summary.kpis}
          ranking={summary.ranking}
          dailyHours={dailyHours}
        />
      ) : null}
      <StitchInline
        html={html}
        title="集團看板"
        sprint="S6-2"
        screenId="0f7df3e575254e96b24b084be30179c1"
        breadcrumb={[{ label: "集團管理", href: "/group/dashboard" }, { label: "集團看板" }]}
      />
    </>
  );
}
