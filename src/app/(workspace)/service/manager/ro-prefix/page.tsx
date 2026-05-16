import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { listP1Prefixes, listP2Prefixes } from "@/domain/ro-numbering";

import { RoNumberingBoard } from "../../../parts/aftersales/management/ro-numbering/_components/ro-numbering-board";

export const dynamic = "force-dynamic";

/**
 * 售後主管模組 — 工單前綴碼設定（C13d）
 *
 * 規格：docs/DUCATI_v2_output/03_售後修護/02_售後主管設定/07_售後管理模組_v2.html
 *       § Tab B — 工單編號設定
 *
 * 設計：reuse 既有 /parts/aftersales/management/ro-numbering 的 RoNumberingBoard
 *       （同一份 DataGrid + Modal + P1/P2 即時預覽），藉 pageHeader prop 切換
 *       入口語境（H1 標題 / sprint chip / caption），避免雙路由維護成本。
 *
 *       底層 domain helper（src/domain/ro-numbering）+ server actions
 *       （src/lib/aftersales/ro-numbering-actions）共用同一套，
 *       brand_id scope by current active scope（Indian = Indian、Ducati = Ducati）。
 */

export default async function ServiceManagerRoPrefixPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視工單前綴碼設定的權限</p>
      </main>
    );
  }

  const [p1Rows, p2Rows, canEdit] = await Promise.all([
    listP1Prefixes(),
    listP2Prefixes(),
    hasPermission(PERMISSIONS.RO_DISPATCH),
  ]);

  return (
    <RoNumberingBoard
      p1Rows={p1Rows}
      p2Rows={p2Rows}
      canEdit={canEdit}
      pageHeader={{
        title: "工單前綴碼設定",
        caption:
          "P1 業務類型（MN / RP / WC / AC / PD / OT…）+ P2 付款性質（CP / WR / IN / FR…）組合產生 RO 編號。前綴碼上線後不建議改動，僅新增。",
        sprintChip: "售後主管 · 13.4",
      }}
    />
  );
}
