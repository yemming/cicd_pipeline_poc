import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="拍賣管理"
      icon="gavel"
      description="中古車拍賣管理規劃中，尚未串接真實資料。完成後可在此將收購車輛上架拍賣並追蹤競標結果。"
      breadcrumb={[{ label: "中古車輛", href: "/usedcar/evaluations" }, { label: "拍賣管理" }]}
    />
  );
}
