import { getCustomerServiceOverview } from "@/domain/customer-service-overview";
import CsOverviewBoard from "./_components/cs-overview-board";

export const metadata = {
  title: "客服功能導覽 | DealerOS",
};

export default async function CustomerServiceOverviewPage() {
  const data = await getCustomerServiceOverview();
  return <CsOverviewBoard data={data} />;
}
