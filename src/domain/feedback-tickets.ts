"use server";

/**
 * Domain Helper — Feedback Tickets（許願單）
 *
 * 對應頁面：
 *   - /feedback/tickets       list
 *   - /feedback/tickets/[id]  detail（含 canvas snapshot / comments / attachments + signed URLs）
 *
 * 跟 `feedback-canvas.ts` 並列（兩個分別管 canvas snapshot / ticket 主檔）— 保持單一職責。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  FEEDBACK_ATTACHMENT_BUCKET,
  type FeedbackTicket,
  type FeedbackAttachment,
  type TicketAttachment,
} from "@/lib/feedback";
import type { CommentItem } from "@/components/feedback/comment-thread";

// ─────────────────────────── /feedback/tickets ───────────────────────────

export interface FeedbackTicketsListPageData {
  tickets: FeedbackTicket[];
  authorMap: Record<string, string>;
  error: string | null;
}

export async function getFeedbackTicketsListPageData(): Promise<FeedbackTicketsListPageData> {
  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("feedback_tickets")
    .select("*")
    .eq("brand_id", brandId)
    .order("updated_at", { ascending: false });

  const tickets = (data ?? []) as FeedbackTicket[];

  const authorIds = [
    ...new Set(tickets.map((t) => t.created_by).filter(Boolean)),
  ] as string[];
  const authorMap: Record<string, string> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", authorIds);
    for (const p of profiles ?? []) {
      if (p.id && p.name) authorMap[p.id] = p.name;
    }
  }
  return {
    tickets,
    authorMap,
    error: error?.message ?? null,
  };
}

// ─────────────────────────── /feedback/tickets/[id] ───────────────────────────

export interface FeedbackTicketDetailPageData {
  ticket: FeedbackTicket;
  snapshot: unknown | null;
  comments: CommentItem[];
  ticketAttachments: TicketAttachment[];
}

export async function getFeedbackTicketDetailPageData(
  id: string,
): Promise<FeedbackTicketDetailPageData | null> {
  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

  const [{ data: ticketData }, { data: canvasData }, { data: commentsRaw }] =
    await Promise.all([
      supabase
        .from("feedback_tickets")
        .select("*")
        .eq("id", id)
        .eq("brand_id", brandId)
        .maybeSingle(),
      supabase
        .from("feedback_canvas_snapshots")
        .select("snapshot")
        .eq("ticket_id", id)
        .maybeSingle(),
      supabase
        .from("feedback_comments")
        .select("id, body, created_at, author_id, parent_id")
        .eq("ticket_id", id)
        .order("created_at", { ascending: true }),
    ]);

  if (!ticketData) return null;
  const ticket = ticketData as FeedbackTicket;

  const authorIds = [
    ...new Set((commentsRaw ?? []).map((c) => c.author_id).filter(Boolean)),
  ] as string[];
  const profileMap: Record<string, string> = {};
  if (authorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", authorIds);
    for (const p of profiles ?? []) {
      if (p.id && p.name) profileMap[p.id] = p.name;
    }
  }

  const commentIds = (commentsRaw ?? []).map((c) => c.id);
  const attachmentsByComment: Record<string, FeedbackAttachment[]> = {};
  if (commentIds.length > 0) {
    const { data: atts } = await supabase
      .from("feedback_comment_attachments")
      .select(
        "id, comment_id, file_name, mime_type, size_bytes, storage_path, created_at",
      )
      .in("comment_id", commentIds)
      .order("created_at", { ascending: true });

    const rows = (atts ?? []) as FeedbackAttachment[];
    if (rows.length > 0) {
      const paths = rows.map((r) => r.storage_path);
      const { data: signed } = await supabase.storage
        .from(FEEDBACK_ATTACHMENT_BUCKET)
        .createSignedUrls(paths, 60 * 60);
      const urlMap: Record<string, string> = {};
      for (const s of signed ?? []) {
        if (s.path && s.signedUrl) urlMap[s.path] = s.signedUrl;
      }
      for (const r of rows) {
        r.signed_url = urlMap[r.storage_path] ?? null;
        (attachmentsByComment[r.comment_id] ??= []).push(r);
      }
    }
  }

  const comments: CommentItem[] = (commentsRaw ?? []).map((c) => ({
    id: c.id,
    body: c.body,
    created_at: c.created_at,
    author_id: c.author_id,
    author_name: c.author_id ? profileMap[c.author_id] ?? null : null,
    attachments: attachmentsByComment[c.id] ?? [],
    parent_id: c.parent_id ?? null,
  }));

  // Ticket-level 附件（metadata.attachments[]，2026-05-25 新增）— 簽 1 小時 signed URL 給 client 下載
  const meta = (ticket.metadata ?? {}) as {
    attachments?: Array<{
      file_name: string;
      mime_type: string;
      size_bytes: number;
      storage_path: string;
      uploaded_at?: string;
    }>;
  };
  const ticketAttachments: Array<{
    file_name: string;
    mime_type: string;
    size_bytes: number;
    storage_path: string;
    uploaded_at: string | null;
    signed_url: string | null;
  }> = [];
  const rawAtts = meta.attachments ?? [];
  if (rawAtts.length > 0) {
    const paths = rawAtts.map((a) => a.storage_path).filter(Boolean);
    const { data: signed } = await supabase.storage
      .from(FEEDBACK_ATTACHMENT_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    const urlMap: Record<string, string> = {};
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlMap[s.path] = s.signedUrl;
    }
    for (const a of rawAtts) {
      ticketAttachments.push({
        file_name: a.file_name,
        mime_type: a.mime_type ?? "application/octet-stream",
        size_bytes: a.size_bytes ?? 0,
        storage_path: a.storage_path,
        uploaded_at: a.uploaded_at ?? null,
        signed_url: urlMap[a.storage_path] ?? null,
      });
    }
  }

  return {
    ticket,
    snapshot: canvasData?.snapshot ?? null,
    comments,
    ticketAttachments,
  };
}
