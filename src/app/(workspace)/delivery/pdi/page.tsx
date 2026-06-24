import { redirect } from "next/navigation";
import { getDeliveryById } from "@/lib/deliveries";
import { resolvePdiItems } from "@/components/delivery/delivery-constants";
import { resolveDeliveryVehicleKind } from "@/domain/deliveries";
import { PdiView } from "./_components/pdi-view";
import { UsedCarPrereqView } from "./_components/used-car-prereq-view";

export const dynamic = "force-dynamic";

/**
 * RS05 STEP 2 — PDI 完成確認（新車） / 車況報告確認（中古車）
 *
 * [輪6-2] 依 sales_orders.contract_type 分流：
 *   - 新車（new）：原 PDI 工單確認流程（PdiView）
 *   - 中古車（used）：車況報告確認流程（UsedCarPrereqView）
 *   - unknown：保守地走新車 PDI 流程
 */
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

  const vehicleKind = await resolveDeliveryVehicleKind(delivery);

  if (vehicleKind === "used") {
    return <UsedCarPrereqView delivery={delivery} />;
  }

  // 新車或 unknown → 走原有 PDI 工單確認
  return <PdiView delivery={delivery} pdiItems={resolvePdiItems(delivery.brand_id)} />;
}
