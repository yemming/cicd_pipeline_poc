import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="商務政策"
      icon="policy"
      description="商務政策管理規劃中，尚未串接真實資料。完成後可在此維護原廠商務政策與門店適用條件。"
      breadcrumb={[{ label: "經銷商管理", href: "/inventory/vehicles" }, { label: "商務政策" }]}
    />
  );
}
