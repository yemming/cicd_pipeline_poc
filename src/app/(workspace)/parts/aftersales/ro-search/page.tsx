import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getEmployeeIdByUser,
  getRoSearchPageData,
  type RepairOrderListFilters,
} from "@/domain/repair-orders";

import { RoSearchBoard } from "./_components/ro-search-board";

export const dynamic = "force-dynamic";

export default async function RoSearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視維修工單的權限</p>
      </main>
    );
  }
  const sp = await searchParams;

  const filters: RepairOrderListFilters = {
    status: sp.status || "all",
    prefix_p1: sp.prefix_p1 || "all",
    sa_id: sp.sa_id || "all",
    q: sp.q || "",
    date_from: sp.date_from || undefined,
    date_to: sp.date_to || undefined,
    business_month: sp.business_month || undefined,
  };
  const hasDayRange = Boolean(filters.date_from || filters.date_to);

  const [data, myEmployeeId] = await Promise.all([
    getRoSearchPageData(filters),
    getEmployeeIdByUser(userId),
  ]);

  // effective month（query helper 已套 fallback，這邊取回實際值同步給 client）；
  // 指定日期區間時不回填月份，避免快篩被當月覆蓋。
  const effectiveMonth = hasDayRange
    ? undefined
    : filters.business_month && /^\d{4}-\d{2}$/.test(filters.business_month)
      ? filters.business_month
      : (() => {
          const d = new Date();
          const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
          return `${tz.getFullYear()}-${String(tz.getMonth() + 1).padStart(2, "0")}`;
        })();

  return (
    <RoSearchBoard
      data={data}
      filters={{ ...filters, business_month: effectiveMonth }}
      myEmployeeId={myEmployeeId}
    />
  );
}
