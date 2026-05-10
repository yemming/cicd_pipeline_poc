import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { DimensionDetailView } from "../[id]/_components/dimension-detail-view";

export const dynamic = "force-dynamic";

export default async function DimensionNewPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">會計財務設定僅限管理者使用</p>
      </main>
    );
  }

  return <DimensionDetailView dim={null} initialMode="create" />;
}
