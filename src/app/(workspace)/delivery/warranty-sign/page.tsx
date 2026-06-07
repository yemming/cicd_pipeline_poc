import { redirect } from "next/navigation";
import { getDeliveryById } from "@/lib/deliveries";
import { getBrandConfig, resolveWarrantyContent } from "@/domain/brand-config";
import { WarrantySignView } from "./_components/warranty-sign-view";

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
  // 品牌中性化（B-13 / C-30）：保固條款 / 不適用情況 / 標題依品牌設定動態取，
  // 不再對所有品牌寫死 DUCATI。
  const brandConfig = await getBrandConfig(delivery.brand_id);
  const warranty = resolveWarrantyContent(brandConfig);
  return (
    <WarrantySignView
      delivery={delivery}
      warranty={warranty}
      warrantyRegDays={brandConfig.warrantyRegDays}
      warrantySystem={brandConfig.warrantySystem}
    />
  );
}
