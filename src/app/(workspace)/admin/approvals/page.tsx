import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="我的簽核"
      icon="approval"
      description="簽核中心規劃中。待簽核工作流（折扣 / 退款 / 調車 / 退貨閾值審核）尚未串接真實資料，完成後此處會列出待你處理的簽核事項。"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "我的簽核" }]}
    />
  );
}
