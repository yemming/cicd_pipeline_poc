import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  listHsCodeTariffs,
  listTariffYears,
  type HsCodeTariffFilters,
} from "@/domain/hs-code-tariffs";

import { TariffsBoard } from "./_components/tariffs-board";

export const dynamic = "force-dynamic";

export default async function TariffsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">稅則設定僅限管理者使用</p>
      </main>
    );
  }

  const sp = await searchParams;
  const filters: HsCodeTariffFilters = {
    q: sp.q ?? "",
    year: sp.year ?? "all",
    plate_class: sp.plate_class ?? "all",
    status: sp.status ?? "all",
  };

  const [rows, years] = await Promise.all([listHsCodeTariffs(filters), listTariffYears()]);

  return <TariffsBoard rows={rows} years={years} filters={filters} />;
}
