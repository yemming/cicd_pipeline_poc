import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getFeedbackTicketsListPageData } from "@/domain/feedback-tickets";
import { TicketsBoard } from "@/components/feedback/tickets-board";

export const dynamic = "force-dynamic";

export default async function TicketListPage() {
  const [{ tickets, authorMap, error }, { isAdmin }] = await Promise.all([
    getFeedbackTicketsListPageData(),
    getCurrentUserAndAdmin(),
  ]);

  return (
    <>
      {error && (
        <div className="rounded border border-[#FFEBE6] bg-[#FFEBE6] px-4 py-3 text-sm text-[#BF2600] mb-4">
          載入失敗：{error}
        </div>
      )}
      <TicketsBoard tickets={tickets} authorMap={authorMap} isAdmin={isAdmin} />
    </>
  );
}
