import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getHsCodeTariffById } from "@/domain/hs-code-tariffs";

import { TariffDetailView } from "./_components/tariff-detail-view";

export const dynamic = "force-dynamic";

export default async function TariffDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const { id } = await params;
  const tariff = await getHsCodeTariffById(id);
  if (!tariff) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">找不到稅則 {id}</p>
      </main>
    );
  }

  return <TariffDetailView tariff={tariff} initialMode="view" />;
}
