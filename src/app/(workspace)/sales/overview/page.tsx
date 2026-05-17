import { getSalesOverview } from "@/domain/sales-overview";
import SalesOverviewBoard from "./_components/sales-overview-board";
import { DemoBanner } from "@/components/demo-banner";

export const metadata = {
  title: "銷售模組導覽 | DealerOS",
};

export default async function SalesOverviewPage() {
  const data = await getSalesOverview();
  return (
    <>
      <DemoBanner message="Demo 模擬資料 — 本頁數字皆為示意，未連接真實 DB。" />
      <SalesOverviewBoard data={data} />
    </>
  );
}
