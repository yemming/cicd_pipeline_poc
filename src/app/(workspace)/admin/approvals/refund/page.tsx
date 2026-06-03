import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="退款簽核"
      icon="currency_exchange"
      description="退款簽核規劃中，尚未串接真實資料。完成後退款申請會自動進入此處待審核。"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "退款簽核" }]}
    />
  );
}
