import { UsedCarSale } from "@/components/pos/usedcar-sale";
import { MOCK_USED_VEHICLES } from "@/lib/pos/mock-vehicles";
import { MOCK_SALE_ORDERS } from "@/lib/pos/mock-sale-orders";

export default function UsedCarSalePage() {
  return (
    <UsedCarSale
      initialVehicles={MOCK_USED_VEHICLES}
      initialOrders={MOCK_SALE_ORDERS}
    />
  );
}
