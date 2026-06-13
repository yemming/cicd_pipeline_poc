"use server";

/**
 * Domain Helper — RP8 站內通知中心（async functions only）
 *
 * 策略：借用既有 `notification_deliveries` 表，以 channel_code='inapp' + target_ref=user_id
 * 存放站內通知。無需 DDL，與對外 LINE/GoogleChat 管道共用同一張表的讀寫能力。
 *
 * 欄位對映：
 *   channel_code = 'inapp'
 *   target_ref   = auth.uid()（收件人）
 *   event_code   = 業務事件 code
 *   event_payload = InappPayload（見 user-notifications.constants.ts）
 *   status       = 'sent'（新通知）| 'acknowledged'（已讀）
 *   brand_id     = 當前 brand
 *
 * TODO promote: Phase 2 新增 user_notifications 獨立表（需 DDL），
 *   提供 realtime subscription、7 年保存、跨 brand 彙整。
 *   目前 30s 輪詢足以 demo，Realtime 待補。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  INAPP_CHANNEL,
  type InappPayload,
  type InappNotification,
} from "./user-notifications.constants";

// Note: constants & types are in user-notifications.constants.ts (not re-exported here
// because "use server" files can only export async functions)

// ─────────────────────────────────────────────────────────────
// READ
// ─────────────────────────────────────────────────────────────

/**
 * 取得當前登入使用者的站內通知清單（最新 50 筆）。
 */
export async function listMyNotifications(): Promise<InappNotification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return [];

  const { data, error } = await supabase
    .from("notification_deliveries")
    .select("id, event_code, event_payload, status, created_at")
    .eq("channel_code", INAPP_CHANNEL)
    .eq("target_ref", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[listMyNotifications]", error.message);
    return [];
  }

  return (data ?? []).map((row) => {
    const rawPayload = (row.event_payload ?? {}) as Record<string, unknown>;
    const payload: InappPayload = {
      title: String(rawPayload.title ?? "通知"),
      body: String(rawPayload.body ?? ""),
      href: typeof rawPayload.href === "string" ? rawPayload.href : undefined,
      priority: (rawPayload.priority as "red" | "orange" | "grey" | undefined) ?? "orange",
      source_ro_id:
        typeof rawPayload.source_ro_id === "string"
          ? rawPayload.source_ro_id
          : undefined,
      source_ro_code:
        typeof rawPayload.source_ro_code === "string"
          ? rawPayload.source_ro_code
          : undefined,
      extra:
        typeof rawPayload.extra === "object" && rawPayload.extra !== null
          ? (rawPayload.extra as Record<string, unknown>)
          : undefined,
    };
    return {
      id: row.id as string,
      event_code: row.event_code as string,
      payload,
      status: (row.status === "acknowledged" ? "acknowledged" : "sent") as
        | "sent"
        | "acknowledged",
      created_at: row.created_at as string,
    };
  });
}

/** 未讀數（快取用） */
export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return 0;

  const { count, error } = await supabase
    .from("notification_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("channel_code", INAPP_CHANNEL)
    .eq("target_ref", user.id)
    .eq("status", "sent");

  if (error) return 0;
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────
// WRITE — 標記已讀
// ─────────────────────────────────────────────────────────────

/** 標記一筆通知為已讀 */
export async function markRead(notificationId: string): Promise<void> {
  if (!notificationId) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return;

  const { error } = await supabase
    .from("notification_deliveries")
    .update({
      status: "acknowledged",
      updated_at: new Date().toISOString(),
    })
    .eq("id", notificationId)
    .eq("channel_code", INAPP_CHANNEL)
    .eq("target_ref", user.id);

  if (error) {
    console.error("[markRead]", error.message);
  }
}

/** 標記所有未讀通知為已讀 */
export async function markAllRead(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return;

  const { error } = await supabase
    .from("notification_deliveries")
    .update({
      status: "acknowledged",
      updated_at: new Date().toISOString(),
    })
    .eq("channel_code", INAPP_CHANNEL)
    .eq("target_ref", user.id)
    .eq("status", "sent");

  if (error) {
    console.error("[markAllRead]", error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// WRITE — 建立站內通知（server action 內呼叫）
// ─────────────────────────────────────────────────────────────

export type CreateInappNotificationInput = {
  /** 收件人 user_id（auth.uid）*/
  recipient_user_id: string;
  /** 業務事件 code */
  event_code: string;
  payload: InappPayload;
  brand_id?: string;
};

/**
 * 建立一筆站內通知並寫入 notification_deliveries。
 * 失敗靜默 console.error，不阻斷主流程。
 */
export async function createInappNotification(
  input: CreateInappNotificationInput,
): Promise<void> {
  if (!input.recipient_user_id) return;
  try {
    const supabase = await createClient();
    let brandId = input.brand_id;
    if (!brandId) {
      try {
        brandId = (await getActiveScope()).brand_id;
      } catch {
        brandId = "indian"; // fallback
      }
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("notification_deliveries").insert({
      channel_code: INAPP_CHANNEL,
      target_ref: input.recipient_user_id,
      event_code: input.event_code,
      event_payload: input.payload as unknown as Record<string, unknown>,
      status: "sent",
      attempts: 1,
      sent_at: now,
      rendered_body: null,
      subscription_id: null,
      template_code: null,
      brand_id: brandId,
      last_error: null,
    });

    if (error) {
      console.error("[createInappNotification] 寫入失敗", error.message);
    }
  } catch (e) {
    console.error("[createInappNotification] 例外（不影響主流程）", e);
  }
}

/**
 * 批次建立站內通知（多個收件人相同事件）。
 */
export async function createInappNotifications(
  inputs: CreateInappNotificationInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  await Promise.allSettled(inputs.map((i) => createInappNotification(i)));
}
