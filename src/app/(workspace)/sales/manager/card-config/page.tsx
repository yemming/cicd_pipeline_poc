import { getHandcardParamsData } from "@/domain/sales-settings";
import HandcardParamsView from "../../settings/handcard-params/_components/handcard-params-view";

export const metadata = {
  title: "手卡參數設定 | DealerOS",
};

/**
 * RS_M3 主管設定 — 手卡參數
 *
 * 落地策略：reuse 既有 `/sales/settings/handcard-params` 的 view component
 * （`getHandcardParamsData()` aggregate loader + `HandcardParamsView`）。
 * 兩條入口（manager workbench / settings）共用同一份畫面與 helper，
 * 避免 SoT 分裂；nav_nodes 用 manager 路徑為唯一入口（settings 入口停用）。
 *
 * 設計稿來源：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html
 */
export default async function SalesManagerCardConfigPage() {
  const data = await getHandcardParamsData();
  return <HandcardParamsView data={data} />;
}
