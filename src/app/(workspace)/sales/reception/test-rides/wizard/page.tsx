/**
 * 試乘試駕 wizard 子頁（/sales/reception/test-rides/wizard）
 *
 * 4-step 試駕現場流程（基本登記 → 安全清單 → 計時 → 結束評估＋黃金時刻）。
 * 從列表頁「進入 wizard」入口跳轉過來。
 *
 * B-05 品牌中性化：試駕車款不再寫死 Ducati 車型，改由本 server component 依 active brand
 * 撈 vehicle_models（getTestDriveLookups 已 brand-scope），把 models 傳給 client form。
 */
import TestRidesForm from "../_components/test-rides-form";
import { getTestDriveLookups } from "@/domain/sales-test-drives";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "試駕 Wizard | DealerOS",
};

export default async function TestRidesWizardPage() {
  const { models } = await getTestDriveLookups();
  return <TestRidesForm models={models} />;
}
