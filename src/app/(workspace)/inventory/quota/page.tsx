import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="配額批售"
      icon="inventory"
      description="配額批售管理規劃中，尚未串接真實資料。完成後可在此管理原廠配額與大宗批售訂單。"
      breadcrumb={[{ label: "整車庫存", href: "/inventory/vehicles" }, { label: "配額批售" }]}
    />
  );
}
