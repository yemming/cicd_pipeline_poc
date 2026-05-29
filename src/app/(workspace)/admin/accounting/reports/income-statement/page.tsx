import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  getIncomeStatement,
  listReportPeriods,
  listReportSubsidiaries,
  type PeriodOption,
} from "@/domain/financial-reports";

import { IncomeStatementBoard } from "./_components/income-statement-board";

export const dynamic = "force-dynamic";

/**
 * 預設期間＝YTD（年初至今）：
 * 截止＝台北今日所在 MONTH 期間的期末日（否則最近一個已過期間，再否則最後一期）；
 * 起始＝截止日所在會計年度的「首期」起日。
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

export default async function IncomeStatementPage({
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
  const dateFrom = sp.date_from ?? def.from;
  const dateTo = sp.date_to ?? def.to;
  const subsidiaryId = sp.subsidiary ?? "all";

  const [report, subsidiaries] = await Promise.all([
    getIncomeStatement({
      date_from: dateFrom,
      date_to: dateTo,
      subsidiary_id: subsidiaryId,
    }),
    listReportSubsidiaries(),
  ]);

  return (
    <IncomeStatementBoard
      key={`${dateFrom}|${dateTo}|${subsidiaryId}`}
      report={report}
      periods={periods}
      subsidiaries={subsidiaries}
      dateFrom={dateFrom}
      dateTo={dateTo}
      subsidiaryId={subsidiaryId}
    />
  );
}
