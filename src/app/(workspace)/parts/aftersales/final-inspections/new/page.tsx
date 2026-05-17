/**
 * 竣工複檢 新增入口
 * FinalInspectionWizard 需要已存在的 DB 記錄才能渲染，
 * 新增流程（createFromRoAction）由 list board 的 modal 負責，
 * 建立成功後會 router.push 到 /final-inspections/[id]。
 * 直接進入 /new 一律 redirect 回 list，由 list board 開啟新增 modal（?new=1）。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

export default async function FinalInspectionNewPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_CREATE))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有建立竣工複檢的權限</p>
      </main>
    );
  }
  redirect("/parts/aftersales/final-inspections?new=1");
}
