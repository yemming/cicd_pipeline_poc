import { getNewCarInventory } from "@/domain/sales-newcar-inventory";
import NewCarInventoryBoard from "./_components/newcar-inventory-board";

export const metadata = {
  title: "新車庫存看板 | DealerOS",
};

export default async function NewCarInventoryPage() {
  const data = await getNewCarInventory();
  return <NewCarInventoryBoard data={data} />;
}
