import { listSalesDictionary } from "@/domain/sales-settings";
import InsuranceBoard from "./_components/insurance-board";

export const metadata = {
  title: "保險業務 | DealerOS",
};

export default async function Page() {
  // BDN #14：流失原因（ROOT CAUSE）字典——從 sales_dictionary kind='insurance_lost_reason' 撈
  // 字典撈失敗時 fallback 空陣列，board 端會用既有 hardcoded PerfBox 數字頂著
  let lostReasons: { code: string; label: string }[] = [];
  try {
    const rows = await listSalesDictionary({ kind: "insurance_lost_reason" });
    lostReasons = rows
      .filter((r) => r.is_active)
      .map((r) => ({ code: r.code, label: r.label }));
  } catch (err) {
    console.error("[/sales/insurance] listSalesDictionary insurance_lost_reason failed:", err);
  }
  return <InsuranceBoard lostReasons={lostReasons} />;
}
