/**
 * Phase 3B C13a — 車間管理看板（售後主管視角）
 *
 * Spec：docs/DUCATI_v2_output/03_售後修護/02_售後主管設定/07_售後管理模組_v2.html
 *       → 即時看板 → 🔧 工位看板（主管站點：整廠視角）
 *
 * 視角差異：
 *   - /parts/aftersales/management/bays（C7-ish 接待 / 零件主管）→ 同一份 dashboard
 *   - /service/manager/workshop（本頁，C13a 售後主管）→ 工位即時 + 工位效率（同一份 dashboard，
 *     差別只在 sprint chip + 入口位置 + caption）
 *   - 整廠工位與效率資料是「整店視角」，不依使用者部門切資料（spec §215「即時看板：售後主管 ✅ ✅」）
 *
 * 紀律：UI 不直連 supabase；資料全走 src/domain/service-bays helper。
 */

import { redirect } from "next/navigation";

import { BaysDashboard } from "@/app/(workspace)/parts/aftersales/management/bays/_components/bays-dashboard";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listServiceBays,
  computeBayKpis,
  computeBayEfficiency,
  getShopDailyHours,
} from "@/domain/service-bays";

export const dynamic = "force-dynamic";

export default async function ServiceManagerWorkshopPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視車間看板的權限</p>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_DISPATCH);
  const dailyHours = await getShopDailyHours();

  const [bays, kpis, eff] = await Promise.all([
    listServiceBays(),
    computeBayKpis(),
    computeBayEfficiency(dailyHours),
  ]);

  return (
    <BaysDashboard
      bays={bays}
      kpis={kpis}
      efficiency={eff}
      dailyHours={dailyHours}
      canEdit={canEdit}
      sprintLabel="售後主管 · 13.1"
      titleOverride="車間管理看板"
      captionOverride="整廠工位即時狀態、計時、使用率（主管視角）"
    />
  );
}
