import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getSerialTrackingPageData } from "@/domain/rules";

import { SerialBoard } from "../serial/_components/serial-board";

export const dynamic = "force-dynamic";

/**
 * Phase 3C D1.16 — /parts/setup/serial-tracking
 *
 * 規格：docs/DUCATI_v2_output/04_庫存管理/01_基礎設定/03_基礎設定_序列號追蹤.html
 *
 * 本路由與 /parts/setup/serial 共用同一份 SerialBoard 元件 + domain helper，
 * 僅以 sprintLabel = "庫存 · 3.5" 對應規格頁標籤；不複製元件 / helper。
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

  const { rules, canEdit } = await getSerialTrackingPageData();
  return (
    <SerialBoard
      rules={rules}
      canEdit={canEdit}
      sprintLabel="庫存 · 3.5"
      caption="設定哪些備件需要序列號追蹤・追蹤規則與查詢"
    />
  );
}
