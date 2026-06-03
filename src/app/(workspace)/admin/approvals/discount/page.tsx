import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="折扣簽核"
      icon="percent"
      description="折扣簽核規劃中，尚未串接真實資料。完成後超過閾值的折扣會自動進入此處待主管審核。"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "折扣簽核" }]}
    />
  );
}
