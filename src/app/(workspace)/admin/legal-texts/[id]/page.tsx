import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  getLegalTextById,
  listLegalTextHistory,
} from "@/domain/legal-texts";
import { LegalTextDetailView } from "./_components/legal-text-detail-view";

export const dynamic = "force-dynamic";

export default async function AdminLegalTextDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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

  const row = await getLegalTextById(id);

  if (!row) {
    return (
      <main className="px-6 py-5">
        <div className="bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] p-4 rounded text-[13px]">
          找不到該法律文字範本（id: {id}）
        </div>
      </main>
    );
  }

  const history = await listLegalTextHistory(row.doc_key);

  return (
    <LegalTextDetailView
      row={row}
      history={history}
      initialMode="view"
    />
  );
}
