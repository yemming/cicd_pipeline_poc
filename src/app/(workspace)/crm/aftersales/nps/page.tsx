/**
 * /crm/aftersales/nps（M02-7 — A 級看板）
 *
 * Server component：吃 searchParams (range / sa / service_type) → 走 domain helper
 * 撈 dashboard → 傳給 client board。
 *
 * 權限：CUSTOMER_VIEW 才看得到看板；CUSTOMER_EDIT 才能 escalate detractor。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAftersalesNpsDashboard } from "@/domain/crm-aftersales-nps";
import type { AftersalesNpsRangeKey } from "@/domain/crm-aftersales-nps.constants";

import { AftersalesNpsBoard } from "./_components/aftersales-nps-board";

export const dynamic = "force-dynamic";

const VALID_RANGES: AftersalesNpsRangeKey[] = ["3m", "6m", "12m"];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視售後 NPS 看板的權限</p>
      </main>
    );
  }
  const canEscalate = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);

  const sp = await searchParams;
  const rawRange = sp.range as AftersalesNpsRangeKey | undefined;
  const range: AftersalesNpsRangeKey =
    rawRange && VALID_RANGES.includes(rawRange) ? rawRange : "6m";
  const sa = sp.sa && sp.sa.length > 0 ? sp.sa : null;
  const serviceType =
    sp.service_type && sp.service_type.length > 0 ? sp.service_type : null;

  let dashboard;
  try {
    dashboard = await getAftersalesNpsDashboard({ range, sa, service_type: serviceType });
  } catch (e) {
    console.error("[aftersales-nps] dashboard fetch error", e);
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">
          載入 NPS 資料失敗。請重新整理頁面，或聯絡管理員。
        </p>
      </main>
    );
  }

  return (
    <AftersalesNpsBoard
      data={dashboard}
      range={range}
      sa={sa}
      serviceType={serviceType}
      canEscalate={canEscalate}
    />
  );
}
