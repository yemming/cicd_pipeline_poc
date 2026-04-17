import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CanvasEditor } from "@/components/feedback/canvas-editor";

export const dynamic = "force-dynamic";

export default async function TicketCanvasPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const [{ data: ticket }, { data: canvas }] = await Promise.all([
    supabase.from("feedback_tickets").select("id").eq("id", id).maybeSingle(),
    supabase.from("feedback_canvas_snapshots").select("snapshot").eq("ticket_id", id).maybeSingle(),
  ]);

  if (!ticket) notFound();

  return <CanvasEditor ticketId={id} initialSnapshot={canvas?.snapshot ?? null} />;
}
