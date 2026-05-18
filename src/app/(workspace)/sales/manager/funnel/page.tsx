import { getSalesManagerFunnelData } from "@/domain/sales-manager-funnel";
import SalesManagerFunnelBoard from "./_components/sales-manager-funnel-board";

export const metadata = {
  title: "RS_M1 銷售漏斗看板 | DealerOS",
};

export default async function SalesManagerFunnelPage() {
  const data = await getSalesManagerFunnelData();
  return <SalesManagerFunnelBoard data={data} />;
}
