import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { TariffDetailView } from "../[id]/_components/tariff-detail-view";

export const dynamic = "force-dynamic";

export default async function TariffNewPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">稅則設定僅限管理者使用</p>
      </main>
    );
  }

  return <TariffDetailView tariff={null} initialMode="create" />;
}
