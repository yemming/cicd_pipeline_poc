"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { STICKY_COLORS, type StickyColor, normalizePagePath } from "@/lib/sticky-notes";

function isColor(v: unknown): v is StickyColor {
  return typeof v === "string" && (STICKY_COLORS as readonly string[]).includes(v);
}

export async function createStickyNote(input: {
  pagePath: string;
  pageTitle?: string | null;
  xPx: number;
  yPx: number;
  body?: string;
  color?: StickyColor;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const page_path = normalizePagePath(input.pagePath);
  const color: StickyColor = isColor(input.color) ? input.color : "yellow";

  const { data, error } = await supabase
    .from("feedback_sticky_notes")
    .insert({
      page_path,
      page_title: input.pageTitle ?? null,
      x_px: input.xPx,
      y_px: input.yPx,
      body: input.body ?? "",
      color,
      created_by: userId,
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(`新增便利貼失敗：${error?.message ?? "unknown"}`);

  revalidatePath(page_path);
  return data;
}

export async function updateStickyNote(
  id: string,
  patch: { body?: string; color?: StickyColor; xPx?: number; yPx?: number },
) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  const update: Record<string, unknown> = {};
  if (typeof patch.body === "string") update.body = patch.body;
  if (isColor(patch.color)) update.color = patch.color;
  if (typeof patch.xPx === "number") update.x_px = patch.xPx;
  if (typeof patch.yPx === "number") update.y_px = patch.yPx;

  if (Object.keys(update).length === 0) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_sticky_notes")
    .update(update)
    .eq("id", id)
    .select("page_path")
    .single();

  if (error) throw new Error(`更新便利貼失敗：${error.message}`);
  if (data?.page_path) revalidatePath(data.page_path);
}

export async function resolveStickyNote(id: string, resolved: boolean) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_sticky_notes")
    .update({ resolved_at: resolved ? new Date().toISOString() : null })
    .eq("id", id)
    .select("page_path")
    .single();

  if (error) throw new Error(`狀態切換失敗：${error.message}`);
  if (data?.page_path) revalidatePath(data.page_path);
}

export async function deleteStickyNote(id: string) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const filter = supabase.from("feedback_sticky_notes").delete().eq("id", id);
  const query = isAdmin ? filter : filter.eq("created_by", userId);
  const { error } = await query.select("page_path");

  if (error) throw new Error(`刪除失敗：${error.message}`);
}

/**
 * 把便利貼 promote 成正式 feedback_ticket。
 * 不刪原 sticky，保留 ticket_id 連結。
 */
export async function promoteStickyToTicket(id: string): Promise<{ ticketId: string }> {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const { data: note, error: readErr } = await supabase
    .from("feedback_sticky_notes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw new Error(`讀取失敗：${readErr.message}`);
  if (!note) throw new Error("便利貼不存在");

  if (note.ticket_id) {
    return { ticketId: note.ticket_id };
  }

  const body = (note.body as string) ?? "";
  const title = body.split("\n")[0]?.slice(0, 80) || `便利貼 @ ${note.page_path}`;
  const description = `來源便利貼 (${note.page_path})\n\n${body}`;

  const { data: ticket, error: insertErr } = await supabase
    .from("feedback_tickets")
    .insert({
      title,
      url: note.page_path,
      description,
      created_by: userId,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertErr || !ticket) throw new Error(`建立許願單失敗：${insertErr?.message ?? "unknown"}`);

  await supabase
    .from("feedback_sticky_notes")
    .update({ ticket_id: ticket.id })
    .eq("id", id);

  revalidatePath("/feedback/tickets");
  revalidatePath(note.page_path);

  return { ticketId: ticket.id };
}
