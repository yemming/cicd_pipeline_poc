import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="行銷活動"
      icon="campaign"
      description="行銷活動管理規劃中，尚未串接真實資料。完成後可在此規劃與追蹤檔期活動成效。"
      breadcrumb={[{ label: "經銷商管理", href: "/inventory/vehicles" }, { label: "行銷活動" }]}
    />
  );
}
