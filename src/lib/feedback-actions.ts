"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  type FeedbackStatus,
  FEEDBACK_STATUS_ORDER,
  isAdminOnlyTransition,
} from "@/lib/feedback";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function createTicket(fd: FormData) {
  const title = s(fd, "title");
  const url = s(fd, "url") || null;
  const description = s(fd, "description") || null;

  if (!title) {
    throw new Error("標題為必填");
  }

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback_tickets")
    .insert({ title, url, description, created_by: userId, status: "draft" })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`建立失敗：${error?.message ?? "unknown"}`);
  }

  revalidatePath("/feedback/tickets");
  redirect(`/feedback/tickets/${data.id}`);
}

export async function updateTicketStatus(ticketId: string, next: FeedbackStatus) {
  if (!FEEDBACK_STATUS_ORDER.includes(next)) {
    throw new Error("未知狀態");
  }

  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (isAdminOnlyTransition(next) && !isAdmin) {
    throw new Error("只有管理者可以轉為此狀態");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback_tickets")
    .update({ status: next })
    .eq("id", ticketId);

  if (error) throw new Error(`更新失敗：${error.message}`);

  revalidatePath("/feedback/tickets");
  revalidatePath(`/feedback/tickets/${ticketId}`);
}

export async function saveCanvasSnapshot(ticketId: string, snapshot: unknown) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) throw new Error("未登入");

  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback_canvas_snapshots")
    .upsert({ ticket_id: ticketId, snapshot });

  if (error) throw new Error(`存檔失敗：${error.message}`);
}
