import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  getBalanceSheet,
  listReportPeriods,
  listReportSubsidiaries,
  type PeriodOption,
} from "@/domain/financial-reports";

import { BalanceSheetBoard } from "./_components/balance-sheet-board";

export const dynamic = "force-dynamic";

/**
 * 預設截止日（時點）：
 * 台北今日所在 MONTH 期間的期末日（否則最近一個已過期間，再否則最後一期）。
 * BS 是時點存量表，只需要一個截止日（不像 IS 要起訖區間）。
 */
function resolveDefaultRange(periods: PeriodOption[]): {
  from: string;
  to: string;
} {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
  }).format(new Date());

  const covering = periods.find(
    (p) => p.start_date <= today && today <= p.end_date,
  );
  let to: string;
  if (covering) {
    to = covering.end_date;
  } else {
    const past = periods
      .filter((p) => p.end_date <= today)
      .map((p) => p.end_date)
      .sort();
    to = past.length
      ? past[past.length - 1]
      : (periods[periods.length - 1]?.end_date ?? today);
  }

  const toPeriod = periods.find((p) => p.end_date === to);
  const firstOfYear =
    toPeriod != null
      ? periods
          .filter((p) => p.fiscal_year === toPeriod.fiscal_year)
          .sort((a, b) => a.period_number - b.period_number)[0]
      : undefined;
  const from = firstOfYear?.start_date ?? to;

  return { from, to };
}

export default async function BalanceSheetPage({
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
  const def = resolveDefaultRange(periods);
  // BS 是時點表：只取截止日（.to）當 as_of，忽略 .from
  const dateTo = sp.date_to ?? def.to;
  const subsidiaryId = sp.subsidiary ?? "all";

  const [report, subsidiaries] = await Promise.all([
    getBalanceSheet({
      as_of: dateTo,
      subsidiary_id: subsidiaryId,
    }),
    listReportSubsidiaries(),
  ]);

  return (
    <BalanceSheetBoard
      key={`${dateTo}|${subsidiaryId}`}
      report={report}
      periods={periods}
      subsidiaries={subsidiaries}
      dateTo={dateTo}
      subsidiaryId={subsidiaryId}
    />
  );
}
