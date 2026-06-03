import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="調車簽核"
      icon="swap_horiz"
      description="調車簽核規劃中，尚未串接真實資料。完成後此處會列出待審核的門店間調車申請。"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "調車簽核" }]}
    />
  );
}
