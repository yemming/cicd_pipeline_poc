import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { listL4ParentsAction } from "@/lib/accounting/coa-actions";

import { CoaDetailView } from "../[id]/_components/coa-detail-view";

export const dynamic = "force-dynamic";

export default async function CoaNewPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">會計財務設定僅限管理者使用</p>
      </main>
    );
  }

  const parentsRes = await listL4ParentsAction();
  const parents = parentsRes.ok ? parentsRes.data : [];

  return <CoaDetailView coa={null} parents={parents} initialMode="create" />;
}
