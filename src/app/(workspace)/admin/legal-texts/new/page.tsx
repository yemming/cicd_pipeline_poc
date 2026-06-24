import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { LegalTextDetailView } from "../[id]/_components/legal-text-detail-view";

export const dynamic = "force-dynamic";

export default async function AdminLegalTextNewPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-5">
        <div className="bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] p-4 rounded text-[13px]">
          法律文字管理僅限管理者使用。
        </div>
      </main>
    );
  }

  return (
    <LegalTextDetailView
      row={null}
      history={[]}
      initialMode="create"
    />
  );
}
