import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  getTrialBalance,
  listReportPeriods,
  listReportSubsidiaries,
  type PeriodOption,
} from "@/domain/financial-reports";

import { TrialBalanceBoard } from "./_components/trial-balance-board";

export const dynamic = "force-dynamic";

/** 預設截止日：台北今日所屬 MONTH 期間的期末日；否則最近一個已過期間；再否則最後一個 */
function resolveDefaultAsOf(periods: PeriodOption[]): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
  }).format(new Date());
  const covering = periods.find(
    (p) => p.start_date <= today && today <= p.end_date,
  );
  if (covering) return covering.end_date;
  const past = periods
    .filter((p) => p.end_date <= today)
    .map((p) => p.end_date)
    .sort();
  if (past.length) return past[past.length - 1];
  return periods[periods.length - 1]?.end_date ?? today;
}

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">財務報表僅限管理者使用</p>
      </main>
    );
  }

  const sp = await searchParams;
  const periods = await listReportPeriods();
  const asOf = sp.as_of ?? resolveDefaultAsOf(periods);
  const subsidiaryId = sp.subsidiary ?? "all";

  const [report, subsidiaries] = await Promise.all([
    getTrialBalance({ as_of: asOf, subsidiary_id: subsidiaryId }),
    listReportSubsidiaries(),
  ]);

  return (
    <TrialBalanceBoard
      key={`${asOf}|${subsidiaryId}`}
      report={report}
      periods={periods}
      subsidiaries={subsidiaries}
      asOf={asOf}
      subsidiaryId={subsidiaryId}
    />
  );
}
