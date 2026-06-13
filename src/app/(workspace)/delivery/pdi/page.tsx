import { redirect } from "next/navigation";
import { getDeliveryById } from "@/lib/deliveries";
import { resolvePdiItems } from "@/components/delivery/delivery-constants";
import { PdiView } from "./_components/pdi-view";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ deliveryId?: string }>;
}) {
  const { deliveryId } = await searchParams;
  if (!deliveryId) redirect("/sales/delivery");
  const delivery = await getDeliveryById(deliveryId);
  if (!delivery) {
    return (
      <main className="px-6 py-5 text-[14px] text-[#CC0000]">
        找不到交車單 {deliveryId}
      </main>
    );
  }
  return <PdiView delivery={delivery} pdiItems={resolvePdiItems(delivery.brand_id)} />;
}
