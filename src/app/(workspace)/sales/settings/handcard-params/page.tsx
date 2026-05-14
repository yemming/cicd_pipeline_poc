import { getHandcardParamsData } from "@/domain/sales-settings";
import HandcardParamsView from "./_components/handcard-params-view";

export const metadata = {
  title: "手卡參數設定 | DealerOS",
};

export default async function HandcardParamsPage() {
  const data = await getHandcardParamsData();
  return <HandcardParamsView data={data} />;
}
