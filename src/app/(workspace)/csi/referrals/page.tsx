import { PlaceholderPage } from "@/components/placeholder-page";

export default function Page() {
  return (
    <PlaceholderPage
      title="再購/轉介紹"
      icon="group_add"
      description="再購／轉介紹追蹤規劃中，客戶名單與意願追蹤尚未串接真實資料。完成後可在此經營既有客戶的再購與推薦。"
      breadcrumb={[{ label: "客戶關懷", href: "/csi/surveys" }, { label: "再購/轉介紹" }]}
    />
  );
}
