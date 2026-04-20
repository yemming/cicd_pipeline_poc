"use server";

// Server actions 給 admin UI 用（取代 fetch API 的呼叫方式，與 feedback 模組一致）
// 每個 action：
//   1. 以 requireNotificationAdmin() 守門（沒通過 throw）
//   2. 使用 service role client 直接操作
//   3. 成功後 revalidatePath 讓 UI 立即更新

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { requireNotificationAdmin } from "./admin";
import { notifications } from "./service";
import type { ChannelCode, EventCode } from "./types";
import {
  createSubscription as repoCreateSub,
  deleteSubscription as repoDeleteSub,
  updateSubscription as repoUpdateSub,
} from "./repositories/subscription.repo";
import {
  createTarget as repoCreateTarget,
  deleteTarget as repoDeleteTarget,
  updateTarget as repoUpdateTarget,
} from "./repositories/target.repo";
import {
  dismissCandidate as repoDismissCandidate,
  getCandidateById as repoGetCandidate,
  markCandidatePromoted as repoMarkPromoted,
  reviveCandidate as repoReviveCandidate,
} from "./repositories/candidate.repo";

function s(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function b(fd: FormData, key: string): boolean {
  return s(fd, key) === "true" || s(fd, key) === "on";
}

function j<T>(fd: FormData, key: string, fallback: T): T {
  const raw = s(fd, key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${key} 必須是合法 JSON`);
  }
}

// ──────────────────────────────────────────────────────────
// Subscriptions
// ──────────────────────────────────────────────────────────

export async function createSubscriptionAction(fd: FormData): Promise<{ id: string }> {
  await requireNotificationAdmin();
  const event_code = s(fd, "event_code");
  const target_id = s(fd, "target_id");
  if (!event_code) throw new Error("event_code 必填");
  if (!target_id) throw new Error("target_id 必填");

  const supabase = createServiceClient();
  const row = await repoCreateSub(supabase, {
    event_code: event_code as EventCode,
    target_id,
    template_code: s(fd, "template_code") || null,
    filter_rules: j(fd, "filter_rules", {}),
    is_active: b(fd, "is_active") || s(fd, "is_active") === "",
  });
  revalidatePath("/admin/notifications");
  revalidatePath("/admin/notifications/subscriptions");
  return { id: row.id };
}

export async function toggleSubscriptionActiveAction(id: string, isActive: boolean): Promise<void> {
  await requireNotificationAdmin();
  const supabase = createServiceClient();
  await repoUpdateSub(supabase, id, { is_active: isActive });
  revalidatePath("/admin/notifications/subscriptions");
}

export async function deleteSubscriptionAction(id: string): Promise<void> {
  await requireNotificationAdmin();
  const supabase = createServiceClient();
  await repoDeleteSub(supabase, id);
  revalidatePath("/admin/notifications/subscriptions");
}

// ──────────────────────────────────────────────────────────
// Targets
// ──────────────────────────────────────────────────────────

export async function createTargetAction(fd: FormData): Promise<{ id: string }> {
  await requireNotificationAdmin();
  const channel_id = s(fd, "channel_id");
  const target_type = s(fd, "target_type");
  const target_ref = s(fd, "target_ref");
  const display_name = s(fd, "display_name");
  if (!channel_id) throw new Error("channel_id 必填");
  if (!["user", "group", "webhook"].includes(target_type)) {
    throw new Error("target_type 必須是 user/group/webhook");
  }
  if (!target_ref) throw new Error("target_ref 必填");
  if (!display_name) throw new Error("display_name 必填");

  const supabase = createServiceClient();
  const row = await repoCreateTarget(supabase, {
    channel_id,
    target_type: target_type as "user" | "group" | "webhook",
    target_ref,
    display_name,
    metadata: j(fd, "metadata", {}),
    is_active: true,
  });
  revalidatePath("/admin/notifications/targets");
  return { id: row.id };
}

export async function toggleTargetActiveAction(id: string, isActive: boolean): Promise<void> {
  await requireNotificationAdmin();
  const supabase = createServiceClient();
  await repoUpdateTarget(supabase, id, { is_active: isActive });
  revalidatePath("/admin/notifications/targets");
}

export async function deleteTargetAction(id: string): Promise<void> {
  await requireNotificationAdmin();
  const supabase = createServiceClient();
  await repoDeleteTarget(supabase, id);
  revalidatePath("/admin/notifications/targets");
}

// ──────────────────────────────────────────────────────────
// Target Candidates（webhook 自動發現的 LINE userId / groupId / roomId）
// ──────────────────────────────────────────────────────────

/**
 * 把候選升級成正式 target：
 *  1. 抓 candidate
 *  2. 找對應 channel_id（一般是 "line"）
 *  3. 在 notification_targets insert（target_type 把 room 視作 group，因 schema 只允許 user/group/webhook）
 *  4. 標 candidate.promoted_target_id
 */
export async function promoteCandidateAction(fd: FormData): Promise<{ id: string }> {
  await requireNotificationAdmin();
  const candidateId = s(fd, "candidate_id");
  const displayName = s(fd, "display_name");
  if (!candidateId) throw new Error("candidate_id 必填");
  if (!displayName) throw new Error("display_name 必填");

  const supabase = createServiceClient();
  const candidate = await repoGetCandidate(supabase, candidateId);
  if (!candidate) throw new Error("候選不存在");
  if (candidate.promoted_target_id) throw new Error("此候選已升級過");

  // 找 channel
  const { data: channel, error: chErr } = await supabase
    .from("notification_channels")
    .select("id")
    .eq("code", candidate.channel_code)
    .maybeSingle();
  if (chErr) throw new Error(`查詢 channel 失敗：${chErr.message}`);
  if (!channel) throw new Error(`找不到 channel: ${candidate.channel_code}`);

  // notification_targets.target_type 只允許 user/group/webhook
  // room 在 LINE pushMessage 等同 group，所以 fallback 成 group
  const targetType =
    candidate.target_type === "room" ? "group" : (candidate.target_type as "user" | "group");

  const target = await repoCreateTarget(supabase, {
    channel_id: channel.id as string,
    target_type: targetType,
    target_ref: candidate.target_ref,
    display_name: displayName,
    metadata: {
      promoted_from_candidate: candidate.id,
      original_target_type: candidate.target_type,
    },
    is_active: true,
  });

  await repoMarkPromoted(supabase, candidate.id, target.id);
  revalidatePath("/admin/notifications/targets");
  return { id: target.id };
}

export async function dismissCandidateAction(id: string): Promise<void> {
  await requireNotificationAdmin();
  const supabase = createServiceClient();
  await repoDismissCandidate(supabase, id);
  revalidatePath("/admin/notifications/targets");
}

export async function reviveCandidateAction(id: string): Promise<void> {
  await requireNotificationAdmin();
  const supabase = createServiceClient();
  await repoReviveCandidate(supabase, id);
  revalidatePath("/admin/notifications/targets");
}

// ──────────────────────────────────────────────────────────
// Deliveries
// ──────────────────────────────────────────────────────────

export async function retryDeliveryAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireNotificationAdmin();
  const result = await notifications.retryDelivery(id);
  revalidatePath("/admin/notifications/deliveries");
  revalidatePath("/admin/notifications");
  return {
    ok: result.ok,
    error: result.ok ? undefined : result.error?.message,
  };
}

// ──────────────────────────────────────────────────────────
// Test-send（沿用 notifications.sendDirect 但經 server action）
// ──────────────────────────────────────────────────────────

export async function testSendAction(fd: FormData): Promise<{ ok: boolean; deliveryId: string; error?: string }> {
  await requireNotificationAdmin();
  const channelCode = s(fd, "channel_code") as ChannelCode;
  const targetRef = s(fd, "target_ref");
  const eventCode = s(fd, "event_code") as EventCode;
  const templateCode = s(fd, "template_code") || undefined;
  const payload = j<Record<string, unknown>>(fd, "payload", {});

  const { deliveryId, result } = await notifications.sendDirect({
    channelCode,
    targetRef,
    templateCode,
    eventCode,
    payload,
  });
  revalidatePath("/admin/notifications/deliveries");
  return { ok: result.ok, deliveryId, error: result.error?.message };
}
