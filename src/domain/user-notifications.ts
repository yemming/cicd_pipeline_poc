"use server";

/**
 * Domain Helper — RP8 站內通知中心
 *
 * 升級自 notification_deliveries(channel=inapp) → user_notifications 真表。
 *
 * 欄位對映（user_notifications）：
 *   user_id      = 收件人 auth.uid()
 *   brand_id     = 當前品牌
 *   title        = 通知標題
 *   body         = 通知內文
 *   priority     = 'red' | 'orange' | 'grey'（default 'orange'）
 *   event_code   = 業務事件 code
 *   ref          = jsonb { href?, source_ro_id?, source_ro_code?, extra? }
 *   read_at      = null（未讀）| timestamptz（已讀）
 *   created_at   = 建立時間（server default）
 *
 * 寫入政策：系統替任意使用者寫 → 用 createServiceClient（bypass RLS）。
 * 讀取政策：使用者只讀自己 → 用 createClient（RLS: user_id = auth.uid()）。
 */

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  type InappPriority,
  type InappNotification,
  type CreateInappNotificationInput,
} from "./user-notifications.constants";

// ─────────────────────────────────────────────────────────────
// READ（一般 server client — RLS 保護）
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
    .from("user_notifications")
    .select("id, event_code, title, body, priority, ref, read_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[listMyNotifications]", error.message);
    return [];
  }

  return (data ?? []).map(rowToNotification);
}

/** 未讀數 */
export async function countUnreadNotifications(): Promise<number> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) return 0;

  const { count, error } = await supabase
    .from("user_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) return 0;
  return count ?? 0;
}

// ─────────────────────────────────────────────────────────────
// WRITE — 標記已讀（一般 server client — RLS 保護）
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
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", user.id);

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
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("[markAllRead]", error.message);
  }
}

// ─────────────────────────────────────────────────────────────
// WRITE — 建立站內通知（service client — bypass RLS，系統替別人寫）
// ─────────────────────────────────────────────────────────────

/**
 * 建立一筆站內通知並寫入 user_notifications。
 * 失敗靜默 console.error，不阻斷主流程。
 */
export async function createInappNotification(
  input: CreateInappNotificationInput,
): Promise<void> {
  if (!input.recipient_user_id) return;
  try {
    const sb = createServiceClient();

    let brandId = input.brand_id;
    if (!brandId) {
      try {
        brandId = (await getActiveScope()).brand_id;
      } catch {
        brandId = "indian"; // fallback
      }
    }

    // 把舊 payload 的各欄打包成 ref jsonb
    const ref: Record<string, unknown> = {};
    if (input.href) ref.href = input.href;
    if (input.source_ro_id) ref.source_ro_id = input.source_ro_id;
    if (input.source_ro_code) ref.source_ro_code = input.source_ro_code;
    if (input.extra) ref.extra = input.extra;

    const { error } = await sb.from("user_notifications").insert({
      user_id: input.recipient_user_id,
      brand_id: brandId,
      title: input.title,
      body: input.body,
      priority: input.priority,
      event_code: input.event_code,
      ref,
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

// ─────────────────────────────────────────────────────────────
// 私有：DB row → InappNotification
// ─────────────────────────────────────────────────────────────

function rowToNotification(row: {
  id: string;
  event_code: string | null;
  title: string;
  body: string | null;
  priority: string;
  ref: unknown;
  read_at: string | null;
  created_at: string;
}): InappNotification {
  const ref = (typeof row.ref === "object" && row.ref !== null
    ? row.ref
    : {}) as Record<string, unknown>;

  const priority: InappPriority =
    row.priority === "red" || row.priority === "orange" || row.priority === "grey"
      ? (row.priority as InappPriority)
      : "orange";

  return {
    id: row.id,
    event_code: row.event_code,
    title: row.title,
    body: row.body,
    priority,
    href: typeof ref.href === "string" ? ref.href : undefined,
    source_ro_id: typeof ref.source_ro_id === "string" ? ref.source_ro_id : undefined,
    source_ro_code: typeof ref.source_ro_code === "string" ? ref.source_ro_code : undefined,
    extra:
      typeof ref.extra === "object" && ref.extra !== null
        ? (ref.extra as Record<string, unknown>)
        : undefined,
    read_at: row.read_at,
    created_at: row.created_at,
  };
}
