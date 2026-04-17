import { Cashier } from "@/components/pos/cashier";
import { MOCK_PRODUCTS } from "@/lib/pos/mock-products";

export default function PosHomePage() {
  return <Cashier products={MOCK_PRODUCTS} />;
}
