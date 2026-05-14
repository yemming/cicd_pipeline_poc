import { getCustomerTagsPageData } from "@/domain/customer-tags";
import CustomerTagsView from "./_components/customer-tags-view";

export const metadata = {
  title: "客群標籤設定 | DealerOS",
};

export default async function CustomerTagsPage() {
  const data = await getCustomerTagsPageData();
  return <CustomerTagsView data={data} />;
}
