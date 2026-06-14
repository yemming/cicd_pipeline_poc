"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { notifications } from "@/lib/notifications";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  type FeedbackStatus,
  FEEDBACK_STATUS_ORDER,
  isAdminOnlyTransition,
  FEEDBACK_ATTACHMENT_BUCKET,
  FEEDBACK_ATTACHMENT_MAX_SIZE,
  FEEDBACK_ATTACHMENT_MAX_COUNT,
} from "@/lib/feedback";
import type { Json } from "@/lib/database.types";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 建單 — 第二代簽名（ticket #8bc5bad2 / Ming 拍板）：
 *   - 拿掉「發生什麼事？」標題欄，title 由 description 第一行自動 derive（≤ 80 字）
 *   - description 改必填
 *   - 接受 client buffer 的 Excalidraw snapshot（可空），建單成功後同流程 upsert canvas
 *   - 改回 Result type（不 redirect、不 throw），讓 client 自控 banner/navigation
 *
 * Schema 限制（保留）：feedback_tickets.title NOT NULL → derive 必須保證非空字串
 */
export type CreateTicketInput = {
  url: string | null;
  description: string;
  snapshot: unknown | null;      // Excalidraw scene { elements, appState, files }；不傳就不建 canvas row
  files?: File[] | null;          // ticket-level 附件（非畫布內圖）；上傳到 feedback-attachments bucket、metadata.attachments 存清單
};

export type CreateTicketResult =
  | { ok: true; ticketId: string }
  | { ok: false; error: string };

type TicketAttachmentMeta = {
  file_name: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
  uploaded_at: string;
};

export async function createTicket(input: CreateTicketInput): Promise<CreateTicketResult> {
  const description = (input.description ?? "").trim();
  if (!description) return { ok: false, error: "請填寫問題描述（必填）" };

  // 從 description 第一行 derive title（最多 80 字、超出截斷加 …）
  const firstLine = description.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine) return { ok: false, error: "描述開頭不可全部空白" };
  const title = firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
  const url = (input.url ?? "").trim() || null;

  // 附件 client 端校驗（server 雙保）
  const files = (input.files ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > FEEDBACK_ATTACHMENT_MAX_COUNT) {
    return { ok: false, error: `附件最多 ${FEEDBACK_ATTACHMENT_MAX_COUNT} 個` };
  }
  for (const f of files) {
    if (f.size > FEEDBACK_ATTACHMENT_MAX_SIZE) {
      return {
        ok: false,
        error: `「${f.name}」超過單檔上限 ${(FEEDBACK_ATTACHMENT_MAX_SIZE / 1024 / 1024).toFixed(0)} MB`,
      };
    }
  }

  const { userId, email } = await getCurrentUserAndAdmin();
  if (!userId) return { ok: false, error: "請先登入" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("feedback_tickets")
    .insert({ title, url, description, created_by: userId, status: "draft", brand_id: brandId })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: `建立失敗：${error?.message ?? "unknown"}` };
  const ticketId = data.id as string;

  // client 帶 canvas snapshot 就一併 upsert（by ticket_id）。canvas 失敗不影響建單
  if (input.snapshot && typeof input.snapshot === "object") {
    const { error: snapErr } = await supabase
      .from("feedback_canvas_snapshots")
      .upsert({ ticket_id: ticketId, snapshot: input.snapshot as Json, brand_id: brandId });
    if (snapErr) console.error("[feedback] canvas snapshot upsert 失敗（不影響建單）", snapErr);
  }

  // 上傳附件到 storage、metadata.attachments 存清單（path 規則 {ticketId}/_ticket/{token}.{ext} 避開 comment 路徑）
  // 任一檔失敗：清掉本次已上傳的、ticket 保留（user 可進詳情頁重傳）
  if (files.length > 0) {
    const uploaded: TicketAttachmentMeta[] = [];
    for (const f of files) {
      const extMatch = f.name.match(/\.[A-Za-z0-9]{1,10}$/);
      const ext = extMatch ? extMatch[0].toLowerCase() : "";
      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const storagePath = `${ticketId}/_ticket/${token}${ext}`;
      const { error: upErr } = await supabase.storage
        .from(FEEDBACK_ATTACHMENT_BUCKET)
        .upload(storagePath, f, {
          contentType: f.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) {
        console.error("[feedback] 附件上傳失敗（rollback 本批）", upErr);
        if (uploaded.length > 0) {
          await supabase.storage
            .from(FEEDBACK_ATTACHMENT_BUCKET)
            .remove(uploaded.map((u) => u.storage_path));
        }
        break;
      }
      uploaded.push({
        file_name: f.name,
        mime_type: f.type || "application/octet-stream",
        size_bytes: f.size,
        storage_path: storagePath,
        uploaded_at: new Date().toISOString(),
      });
    }
    if (uploaded.length > 0) {
      const { error: metaErr } = await supabase
        .from("feedback_tickets")
        .update({ metadata: { attachments: uploaded } })
        .eq("id", ticketId);
      if (metaErr) {
        console.error("[feedback] metadata.attachments 寫入失敗", metaErr);
        await supabase.storage
          .from(FEEDBACK_ATTACHMENT_BUCKET)
          .remove(uploaded.map((u) => u.storage_path));
      }
    }
  }

  revalidatePath("/feedback/tickets");

  // 取 profile.name 當提出人顯示名稱（fallback: email → userId）
  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", userId)
    .maybeSingle();
  const createdByDisplay = profile?.name?.trim() || email || userId;

  // Notification Hub 埋點：客戶提新許願單時推 IM 通知（非阻塞、不影響 response）
  const appUrl = (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://dealeros.zeabur.app").replace(/\/+$/, "");
  after(async () => {
    try {
      await notifications.dispatch({
        code: "feedback_ticket.created",
        payload: {
          ticketId,
          title,
          url: url ?? "",
          description,
          createdBy: createdByDisplay,
          actionUrl: `${appUrl}/feedback/tickets/${ticketId}`,
        },
      });
    } catch (e) {
      console.error("[feedback] notification dispatch 失敗（不影響本次建單）", e);
    }
  });

  return { ok: true, ticketId };
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

// ── Archive / Unarchive / Delete（皆 admin-only） ──────────────────

export async function archiveTicket(ticketId: string) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) throw new Error("只有管理者可以封存單據");

  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback_tickets")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", ticketId);

  if (error) throw new Error(`封存失敗：${error.message}`);

  revalidatePath("/feedback/tickets");
  revalidatePath(`/feedback/tickets/${ticketId}`);
}

export async function unarchiveTicket(ticketId: string) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) throw new Error("只有管理者可以取消封存");

  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback_tickets")
    .update({ archived_at: null })
    .eq("id", ticketId);

  if (error) throw new Error(`取消封存失敗：${error.message}`);

  revalidatePath("/feedback/tickets");
  revalidatePath(`/feedback/tickets/${ticketId}`);
}

export async function deleteTicket(ticketId: string) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) throw new Error("只有管理者可以刪除單據");

  const supabase = await createClient();

  // 必須已封存才可刪除（與 UI 邏輯一致；server 為最終守門）
  const { data: ticket, error: readErr } = await supabase
    .from("feedback_tickets")
    .select("id, archived_at")
    .eq("id", ticketId)
    .maybeSingle();
  if (readErr) throw new Error(`讀取失敗：${readErr.message}`);
  if (!ticket) throw new Error("單據不存在");
  if (!ticket.archived_at) {
    throw new Error("只有已封存的單據才能刪除");
  }

  // 先收集此單所有留言的附件 storage_path，刪 DB 後一起清掉 storage
  const { data: commentRows } = await supabase
    .from("feedback_comments")
    .select("id")
    .eq("ticket_id", ticketId);
  const commentIds = (commentRows ?? []).map((c) => c.id);

  let attachmentPaths: string[] = [];
  if (commentIds.length > 0) {
    const { data: atts } = await supabase
      .from("feedback_comment_attachments")
      .select("storage_path")
      .in("comment_id", commentIds);
    attachmentPaths = (atts ?? []).map((a) => a.storage_path).filter(Boolean);
  }

  // 加收 ticket-level 附件路徑（metadata.attachments[].storage_path，2026-05-25 新增）
  const { data: tk } = await supabase
    .from("feedback_tickets")
    .select("metadata")
    .eq("id", ticketId)
    .maybeSingle();
  const meta = (tk?.metadata ?? {}) as { attachments?: Array<{ storage_path?: string }> };
  for (const a of meta.attachments ?? []) {
    if (a?.storage_path) attachmentPaths.push(a.storage_path);
  }

  // 先刪主檔（comments / canvas / attachments 靠 ON DELETE CASCADE）
  const { error: delErr } = await supabase
    .from("feedback_tickets")
    .delete()
    .eq("id", ticketId);
  if (delErr) throw new Error(`刪除失敗：${delErr.message}`);

  // 清 Storage（失敗不擋主流程，記 warn）
  if (attachmentPaths.length > 0) {
    const { error: storageErr } = await supabase
      .storage
      .from(FEEDBACK_ATTACHMENT_BUCKET)
      .remove(attachmentPaths);
    if (storageErr) {
      console.warn("[feedback] storage cleanup failed:", storageErr.message);
    }
  }

  revalidatePath("/feedback/tickets");
}

// ── Comments + Attachments ────────────────────────────────────────

/**
 * 新增留言；可帶附件（FormData 內的 "files" 多檔）。
 * body 可空白若有附件（純貼檔案也能留）；都空則擋。
 */
export async function addComment(ticketId: string, fd: FormData): Promise<void> {
  const body = s(fd, "body");
  const rawFiles = fd.getAll("files");
  const files = rawFiles.filter((f): f is File => f instanceof File && f.size > 0);

  if (!body && files.length === 0) {
    throw new Error("留言或附件至少需要一項");
  }
  if (files.length > FEEDBACK_ATTACHMENT_MAX_COUNT) {
    throw new Error(`附件最多 ${FEEDBACK_ATTACHMENT_MAX_COUNT} 個`);
  }
  for (const f of files) {
    if (f.size > FEEDBACK_ATTACHMENT_MAX_SIZE) {
      throw new Error(`「${f.name}」超過 ${FEEDBACK_ATTACHMENT_MAX_SIZE / 1024 / 1024}MB 上限`);
    }
  }

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;

  // 1. 建 comment（body 可空時寫 "(附件)" 當 placeholder 以滿足 DB check）
  const parentId = s(fd, "parent_id") || null;
  const bodyToSave = body || "(附件)";
  const { data: comment, error: insertErr } = await supabase
    .from("feedback_comments")
    .insert({ ticket_id: ticketId, author_id: userId, body: bodyToSave, parent_id: parentId, brand_id: brandId })
    .select("id")
    .single();
  if (insertErr || !comment) {
    throw new Error(`留言失敗：${insertErr?.message ?? "unknown"}`);
  }

  // 2. 上傳附件 + 寫入附件表
  if (files.length > 0) {
    const uploaded: { file_name: string; mime_type: string; size_bytes: number; storage_path: string }[] = [];

    for (const f of files) {
      // Supabase Storage 的 key 驗證不認 CJK / 全形符號，
      // 所以 storage_path 只用 ASCII token（原檔名另存在 file_name 欄位）
      const extMatch = f.name.match(/\.[A-Za-z0-9]{1,10}$/);
      const ext = extMatch ? extMatch[0].toLowerCase() : "";
      const token = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const storagePath = `${ticketId}/${comment.id}/${token}${ext}`;
      const { error: upErr } = await supabase
        .storage
        .from(FEEDBACK_ATTACHMENT_BUCKET)
        .upload(storagePath, f, {
          contentType: f.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) {
        // rollback：刪除這則 comment，整個留言當失敗
        await supabase.from("feedback_comments").delete().eq("id", comment.id);
        throw new Error(`附件上傳失敗：${upErr.message}`);
      }
      uploaded.push({
        file_name: f.name,
        mime_type: f.type || "application/octet-stream",
        size_bytes: f.size,
        storage_path: storagePath,
      });
    }

    const { error: attErr } = await supabase
      .from("feedback_comment_attachments")
      .insert(uploaded.map((u) => ({ ...u, comment_id: comment.id, uploader_id: userId, brand_id: brandId })));

    if (attErr) {
      // rollback：把剛上傳的檔案從 storage 清掉 + 刪 comment
      await supabase.storage.from(FEEDBACK_ATTACHMENT_BUCKET).remove(uploaded.map((u) => u.storage_path));
      await supabase.from("feedback_comments").delete().eq("id", comment.id);
      throw new Error(`附件儲存失敗：${attErr.message}`);
    }
  }

  revalidatePath(`/feedback/tickets/${ticketId}`);
}

export async function saveCanvasSnapshot(ticketId: string, snapshot: unknown) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) throw new Error("未登入");

  const supabase = await createClient();
  const { error } = await supabase
    .from("feedback_canvas_snapshots")
    .upsert({ ticket_id: ticketId, snapshot, brand_id: (await getActiveScope()).brand_id });

  if (error) throw new Error(`存檔失敗：${error.message}`);
}
