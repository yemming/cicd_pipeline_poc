import { getSalesManagerFunnelData } from "@/domain/sales-manager-funnel";
import SalesManagerFunnelBoard from "./_components/sales-manager-funnel-board";
import { DemoBanner } from "@/components/demo-banner";

export const metadata = {
  title: "RS_M1 銷售漏斗看板 | DealerOS",
};

export default async function SalesManagerFunnelPage() {
  const data = await getSalesManagerFunnelData();
  return (
    <>
      <DemoBanner message="Demo 模擬資料 — 本頁數字皆為示意，未連接真實 DB。" />
      <SalesManagerFunnelBoard data={data} />
    </>
  );
}
