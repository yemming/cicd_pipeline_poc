import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="簽核歷史"
      icon="history"
      description="簽核歷史規劃中，尚未串接真實資料。完成後此處會保留所有已處理簽核的稽核軌跡。"
      breadcrumb={[{ label: "簽核管理", href: "/admin/approvals" }, { label: "簽核歷史" }]}
    />
  );
}
