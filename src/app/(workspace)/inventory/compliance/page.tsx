import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="合規稽核"
      icon="verified_user"
      description="經銷商合規稽核規劃中，尚未串接真實資料。完成後可在此追蹤原廠合規要求與稽核結果。"
      breadcrumb={[{ label: "經銷商管理", href: "/inventory/vehicles" }, { label: "合規稽核" }]}
    />
  );
}
