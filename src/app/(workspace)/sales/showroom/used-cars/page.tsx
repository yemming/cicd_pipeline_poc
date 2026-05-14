import { getUsedCarInventory } from "@/domain/sales-usedcar-inventory";
import UsedCarInventoryBoard from "./_components/usedcar-inventory-board";

export const metadata = {
  title: "中古車庫存看板 | DealerOS",
};

export default async function UsedCarInventoryPage() {
  const data = await getUsedCarInventory();
  return <UsedCarInventoryBoard data={data} />;
}
