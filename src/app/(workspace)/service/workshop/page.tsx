/**
 * /service/workshop — 技師派工真實看板（P1-#11）
 *
 * Server component：撈 brand active RO + 技師清單，傳給 client island。
 * 真寫入：點 RO row 的「指派技師」下拉 → setLeadTechnicianAction
 * 走天條：UI 一律 import @/domain/repair-orders、不直連 supabase。
 */

import { getWorkshopBoardData } from "@/domain/repair-orders";
import { WorkshopBoard } from "./_components/workshop-board";

export const dynamic = "force-dynamic";

export default async function WorkshopPage() {
  const { active_ros, technicians } = await getWorkshopBoardData();
  return (
    <WorkshopBoard activeRos={active_ros} technicians={technicians} />
  );
}
