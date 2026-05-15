"use server";

/**
 * Server actions — 取車通知（Pickup Notification）
 *
 * Spec：bb3b7121-ebc9-4fef-9843-aec5b01c8b77
 *
 * - sendPickupNotificationAction：append 一筆紀錄進 final_inspections.notifications jsonb
 *
 * POC 階段不真的接 Line API / 簡訊 gateway，只在 DB 留紀錄；
 * 等正式接時再在這支裡 fan-out 到 notification hub 或外部 provider。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import {
  PICKUP_CHANNELS,
  type PickupChannel,
  type PickupNotificationRecord,
} from "@/domain/pickup-notifications.constants";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const PAGE = "/parts/aftersales/pickup-notifications";

export type SendPickupInput = {
  finalInspectionId: string;
  channel: PickupChannel;
  body?: string;
};

export async function sendPickupNotificationAction(
  input: SendPickupInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const { userId } = await getCurrentUserAndAdmin();

  if (!input.finalInspectionId) return { ok: false, error: "缺少竣工複檢 ID" };
  if (!(PICKUP_CHANNELS as readonly string[]).includes(input.channel)) {
    return { ok: false, error: "通道不合法" };
  }

  const supabase = await createClient();
  const { data: existing, error: e1 } = await supabase
    .from("final_inspections")
    .select("id, notifications")
    .eq("id", input.finalInspectionId)
    .maybeSingle();
  if (e1) return { ok: false, error: e1.message };
  if (!existing) return { ok: false, error: "查無竣工複檢" };

  const prev = Array.isArray(existing.notifications) ? existing.notifications : [];
  const record: PickupNotificationRecord = {
    kind: "pickup",
    channel: input.channel,
    sent_at: new Date().toISOString(),
    sent_by: userId ?? null,
    body: input.body?.trim() || undefined,
  };
  const next = [...prev, record];

  const { error: e2 } = await supabase
    .from("final_inspections")
    .update({ notifications: next, updated_at: new Date().toISOString() })
    .eq("id", input.finalInspectionId);
  if (e2) return { ok: false, error: e2.message };

  revalidatePath(PAGE);
  return { ok: true, data: { id: input.finalInspectionId } };
}
