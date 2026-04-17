import { ProductsTable } from "@/components/pos/products-table";
import { MOCK_PRODUCTS } from "@/lib/pos/mock-products";

export default function ProductsPage() {
  return <ProductsTable products={MOCK_PRODUCTS} />;
}
