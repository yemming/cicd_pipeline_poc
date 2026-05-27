/**
 * RS_INV02 到港確認 — 詳情（view mode）
 *
 * 顯示批次統計 + 本批每台車的最終狀態（pending_pdi / damaged）+ 各車 PDI 工單號。
 */

import { getArrivalById } from "@/domain/vehicle-arrivals";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import ArrivalDetailView from "./_components/arrival-detail-view";

export const dynamic = "force-dynamic";

export default async function ArrivalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">無權限檢視到港確認</main>;
  }

  const arrival = await getArrivalById(id);
  if (!arrival) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">找不到到港批次 {id}</main>;
  }

  return <ArrivalDetailView arrival={arrival} />;
}
