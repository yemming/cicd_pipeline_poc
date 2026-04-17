import { createClient } from "@/lib/supabase/server";
import { type FeedbackTicket } from "@/lib/feedback";
import { TicketsBoard } from "@/components/feedback/tickets-board";

export const dynamic = "force-dynamic";

export default async function TicketListPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_tickets")
    .select("*")
    .order("updated_at", { ascending: false });

  const tickets: FeedbackTicket[] = (data ?? []) as FeedbackTicket[];

  // Resolve author names for kanban card avatars
  const authorIds = [...new Set(tickets.map((t) => t.created_by).filter(Boolean))] as string[];
  let authorMap: Record<string, string> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", authorIds);
    for (const p of profiles ?? []) {
      if (p.id && p.name) authorMap[p.id] = p.name;
    }
  }

  return (
    <>
      {error && (
        <div className="rounded border border-[#FFEBE6] bg-[#FFEBE6] px-4 py-3 text-sm text-[#BF2600] mb-4">
          載入失敗：{error.message}
        </div>
      )}
      <TicketsBoard tickets={tickets} authorMap={authorMap} />
    </>
  );
}
