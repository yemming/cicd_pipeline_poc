/**
 * 試乘試駕 wizard 子頁（/sales/reception/test-rides/wizard）
 *
 * 4-step 試駕現場流程（基本登記 → 安全清單 → 計時 → 結束評估＋黃金時刻）。
 * 從列表頁「進入 wizard」入口跳轉過來。本頁是純 client UX，沒寫 DB。
 */
import TestRidesForm from "../_components/test-rides-form";

export const metadata = {
  title: "試駕 Wizard | DealerOS",
};

export default function TestRidesWizardPage() {
  return <TestRidesForm />;
}
