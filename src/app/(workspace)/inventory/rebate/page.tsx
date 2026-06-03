import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="返利結算"
      icon="savings"
      description="原廠返利結算規劃中，尚未串接真實資料。完成後可在此計算與對帳各項銷售返利。"
      breadcrumb={[{ label: "整車庫存", href: "/inventory/vehicles" }, { label: "返利結算" }]}
    />
  );
}
