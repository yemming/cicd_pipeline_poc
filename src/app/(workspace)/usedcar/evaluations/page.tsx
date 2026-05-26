import Link from "next/link";
import { listEvaluations, STATUS_LABELS, type EvaluationStatus } from "@/domain/used-car-evaluations";
import { getActiveScope } from "@/lib/scope/active-scope";
import { EvaluationsBoard } from "./_components/evaluations-board";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ status?: string; grade?: string; q?: string }>;
};

export default async function EvaluationsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const scope = await getActiveScope();

  const { rows, totalCount } = await listEvaluations({
    brandId: scope.brand_id,
    status: (sp.status as EvaluationStatus | undefined) || undefined,
    grade: (sp.grade as "S" | "A" | "B" | "C" | "D" | undefined) || undefined,
    search: sp.q,
  });

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">中古車評估歷史</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          P1-#7
        </span>
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆評估
        </span>
        <Link
          href="/usedcar/evaluations/wizard"
          className="ml-auto h-[30px] inline-flex items-center px-4 rounded-full text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
        >
          ＋ 新增評估
        </Link>
      </header>

      <EvaluationsBoard rows={rows} statusLabels={STATUS_LABELS} />
    </main>
  );
}
