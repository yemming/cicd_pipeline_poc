import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSerialTrackingPageData } from "@/domain/rules";
import { getSerialTrackingKpis, listRecentSerialActivities } from "@/domain/stock";

import { SerialTrackingBoard } from "./_components/serial-tracking-board";

export const dynamic = "force-dynamic";

/**
 * Phase 2 · M04U-10 — /parts/setup/serial-tracking
 *
 * 規格：docs/DUCATI_v2_output/04_庫存管理/01_基礎設定/03_基礎設定_序列號追蹤.html
 * 目標：C/B 級 → A 級
 *   - 頂部 KpiCard 列（追蹤中 SKU / 庫存中 / 已出庫 / 保固快到期）
 *   - 序號查詢列 + 5 段生命週期 Timeline（入庫 → 庫存 → 預留 → 出庫 → 保固）
 *   - 最近追蹤紀錄（chip 標 warranty/status）
 *   - 規則設定（A/B/C 三類）保留、收進右側 panel
 */
export default async function SerialTrackingPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_SERIAL_RULE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視序列號設定的權限</p>
      </main>
    );
  }

  const [{ rules, canEdit }, kpis, recent] = await Promise.all([
    getSerialTrackingPageData(),
    getSerialTrackingKpis(),
    listRecentSerialActivities(8),
  ]);

  return (
    <SerialTrackingBoard
      rules={rules}
      canEdit={canEdit}
      kpis={kpis}
      recent={recent}
    />
  );
}
