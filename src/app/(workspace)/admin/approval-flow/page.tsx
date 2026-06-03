import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="簽核流程設定"
      icon="account_tree"
      description="簽核流程設定規劃中，尚未串接真實資料。完成後可在此設定各類單據的簽核層級與條件門檻。"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "簽核流程設定" }]}
    />
  );
}
