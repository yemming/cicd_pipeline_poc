import { getSalesManagerReportData } from "@/domain/sales-manager-report";
import SalesManagerReportBoard from "./_components/sales-manager-report-board";

export const metadata = {
  title: "RS_M2 業績報表 | DealerOS",
};

export default async function SalesManagerReportPage() {
  const data = await getSalesManagerReportData();
  return <SalesManagerReportBoard data={data} />;
}
