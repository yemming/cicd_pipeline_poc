"use server";

/**
 * Domain Helper — Feedback Canvas Snapshots
 *
 * Excalidraw canvas 儲存（每張 feedback ticket 一份最新 snapshot、upsert by ticket_id）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import type { Json } from "@/lib/database.types";

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function saveFeedbackCanvasSnapshot(
  ticketId: string,
  snapshot: Json,
): Promise<Result<null>> {
  if (!ticketId) return { ok: false, error: "缺 ticketId" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("feedback_canvas_snapshots")
    .upsert({ ticket_id: ticketId, snapshot, brand_id: brandId });

  if (error) return { ok: false, error: error.message };
  revalidatePath(`/feedback/tickets/${ticketId}`);
  return { ok: true, data: null };
}
