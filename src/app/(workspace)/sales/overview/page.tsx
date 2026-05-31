import { getSalesOverview } from "@/domain/sales-overview";
import SalesOverviewBoard from "./_components/sales-overview-board";

export const metadata = {
  title: "銷售模組導覽 | DealerOS",
};

export default async function SalesOverviewPage() {
  const data = await getSalesOverview();
  return (
    <>
      <SalesOverviewBoard data={data} />
    </>
  );
}
