import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listStaffWithGridPositions } from "@/domain/sales-staff-grid";

import { StaffGridBoard } from "./_components/staff-grid-board";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "員工評估九宮格 | DealerOS",
};

/**
 * RS_M3 主管設定 — 員工評估九宮格（dashboard）
 *
 * spec：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html § 員工評估九宮格
 * proposal：docs/proposals/feature-rs-m3-staff-grid-phase1.md
 *
 * - 3×3 grid（態度 × 技能）
 * - 系統自動依本月接觸 / 成交數定位；主管可拖曳覆蓋
 * - manual_override 後永遠用主管位置直到「重置全部為自動」
 */
export default async function SalesManagerStaffGridPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.EMPLOYEE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視員工名冊的權限</p>
      </main>
    );
  }

  const [rows, canEdit] = await Promise.all([
    listStaffWithGridPositions(),
    hasPermission(PERMISSIONS.EMPLOYEE_EDIT),
  ]);

  return <StaffGridBoard rows={rows} canEdit={canEdit} />;
}
