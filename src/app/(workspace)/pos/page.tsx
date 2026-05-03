import { Cashier } from "@/components/pos/cashier";
import { getProducts } from "@/lib/pos/actions";
import { MOCK_PRODUCTS } from "@/lib/pos/mock-products";

export default async function PosHomePage() {
  let products = MOCK_PRODUCTS; // fallback 確保 DB 還沒 ready 時不白畫面
  try {
    const fromDb = await getProducts();
    if (fromDb.length > 0) products = fromDb;
  } catch { /* 靜默降級到 mock */ }

  return <Cashier products={products} />;
}
