import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  getDealerComparisonReport,
  type DealerComparisonMetric,
} from "@/domain/group-analytics";

import { DealerComparisonBoard } from "./_components/dealer-comparison-board";

export const dynamic = "force-dynamic";

function defaultFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}
function defaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GRP：經銷商分組比較（Russell《DealerOS 經銷商層級隔離規則》2026-08-09 §5.1）
 *
 * 代理商視角的經銷商排行榜（工單量 / 營收），彙總範圍 = 經銷商底下所有門店加總。
 * 權限守門沿用其他 GRP 頁 pattern：admin-only。
 */
export default async function DealerComparisonPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">僅代理商/集團層級可存取經銷商分組比較報表</p>
      </main>
    );
  }

  const sp = await searchParams;
  const metric: DealerComparisonMetric = sp.metric === "revenue" ? "revenue" : "ro_count";
  const from = sp.from || defaultFrom();
  const to = sp.to || defaultTo();

  const { brand_id } = await getActiveScope();

  let rows: Awaited<ReturnType<typeof getDealerComparisonReport>> = [];
  let error: string | null = null;
  try {
    rows = await getDealerComparisonReport(brand_id, metric, { from, to });
  } catch (e) {
    error = (e as Error).message;
  }

  return (
    <DealerComparisonBoard rows={rows} metric={metric} from={from} to={to} error={error} />
  );
}
