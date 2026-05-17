import { getSalesManagerReportData } from "@/domain/sales-manager-report";
import SalesManagerReportBoard from "./_components/sales-manager-report-board";
import { DemoBanner } from "@/components/demo-banner";

export const metadata = {
  title: "RS_M2 業績報表 | DealerOS",
};

export default async function SalesManagerReportPage() {
  const data = await getSalesManagerReportData();
  return (
    <>
      <DemoBanner message="Demo 模擬資料 — 本頁數字皆為示意，未連接真實 DB。" />
      <SalesManagerReportBoard data={data} />
    </>
  );
}
