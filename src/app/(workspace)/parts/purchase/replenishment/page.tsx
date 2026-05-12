import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getReplenishmentPageData } from "@/domain/replenishment";

import { ReplenishmentBoard } from "./_components/replenishment-board";

export const dynamic = "force-dynamic";

export default async function ReplenishmentPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PR_VIEW))) {
    return (
      <main className="px-6 py-5">
        <p className="text-[13px] text-[#CC0000]">沒有檢視日常補貨計畫的權限</p>
      </main>
    );
  }

  const { run, lines, warehouses, policy } = await getReplenishmentPageData();

  const openLines = lines.filter((l) => l.status === "open");
  const urgentCount = openLines.filter((l) => l.priority === "urgent").length;
  const totalAmt = openLines.reduce((s, l) => s + l.est_amount, 0);

  const canRun = await hasPermission(PERMISSIONS.REPLENISHMENT_RUN);
  const canCreatePR = await hasPermission(PERMISSIONS.PR_CREATE);

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">日常補貨計畫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          4.2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          MRP 計算（WO 需求 + 安全庫存 + ROP）→ 一鍵建立採購申請
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">本批次建議</div>
          <div className="text-[24px] font-semibold text-[#854F0B] mt-1 font-mono">
            {openLines.length}
          </div>
          <div className="text-[11px] text-[#9A9890]">項待補貨</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">緊急項目</div>
          <div className="text-[24px] font-semibold text-[#CC0000] mt-1 font-mono">
            {urgentCount}
          </div>
          <div className="text-[11px] text-[#9A9890]">on_hand ≤ min_stock</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">預估採購金額</div>
          <div className="text-[20px] font-semibold text-[#0F6E56] mt-1 font-mono">
            {`NT$${Number(totalAmt).toLocaleString("en-US")}`}
          </div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">最近一次計算</div>
          <div className="text-[15px] font-semibold text-[#1A3A5C] mt-1">
            {run ? run.created_label : "尚未計算"}
          </div>
          <div className="text-[11px] text-[#9A9890]">
            {run ? `視野 ${run.horizon_days} 天 ・ 狀態 ${run.status}` : "點上方按鈕計算"}
          </div>
        </div>
      </div>

      <ReplenishmentBoard
        run={run}
        lines={lines}
        warehouses={warehouses}
        policy={policy}
        canRun={canRun}
        canCreatePR={canCreatePR}
      />
    </main>
  );
}
