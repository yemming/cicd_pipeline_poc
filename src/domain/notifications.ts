/**
 * Notifications admin domain helper — server-only。
 *
 * `/admin/notifications/*` 5 個 page 走這支。helper 內部：
 *   - admin guard（throw "UNAUTHENTICATED" / "FORBIDDEN_NOTIFICATION_ADMIN"）
 *   - 自己呼叫 createServiceClient（bypass RLS、page 看不到 supabase）
 *   - 共用 lib/notifications/repositories/* 的 thin query layer
 *
 * 既有 `requireNotificationAdmin` from @/lib/notifications throw 的是中文 message；
 * 本檔 page-facing API 改 throw sentinel string，方便 page 端 try/catch 判斷。
 */

import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndNotificationAdmin } from "@/lib/notifications";
import { listCodeTemplates } from "@/lib/notifications/templates";
import {
  countDeliveriesByStatus,
  listDeliveries,
  type ListDeliveriesFilter,
} from "@/lib/notifications/repositories/delivery.repo";
import { listAllSubscriptions } from "@/lib/notifications/repositories/subscription.repo";
import { listTargets, listTargetsByIds } from "@/lib/notifications/repositories/target.repo";
import { listActiveChannels } from "@/lib/notifications/repositories/channel.repo";
import {
  listPendingCandidates,
  type CandidateRow,
} from "@/lib/notifications/repositories/candidate.repo";
import { listTemplates } from "@/lib/notifications/repositories/template.repo";
import type {
  ChannelCode,
  DeliveryStatus,
  EventCode,
  NotificationChannelRow,
  NotificationDeliveryRow,
  NotificationSubscriptionRow,
  NotificationTargetRow,
  NotificationTemplateRow,
  TemplateDefinition,
} from "@/lib/notifications";

// ───────────────────────── admin guard ─────────────────────────

async function ensureNotificationAdmin() {
  // getCurrentUserAndNotificationAdmin 自帶 React cache()，同一 request 多次呼叫不會重打 Auth
  const ctx = await getCurrentUserAndNotificationAdmin();
  if (!ctx.userId) throw new Error("UNAUTHENTICATED");
  if (!ctx.isAdmin) throw new Error("FORBIDDEN_NOTIFICATION_ADMIN");
  return ctx;
}

// ───────────────────────── /admin/notifications ─────────────────────────

export interface NotificationDashboardData {
  stats7d: Record<DeliveryStatus, number>;
  stats24h: Record<DeliveryStatus, number>;
  recentFailed: NotificationDeliveryRow[];
  recent: NotificationDeliveryRow[];
}

export async function getNotificationDashboardData(): Promise<NotificationDashboardData> {
  await ensureNotificationAdmin();
  const supabase = createServiceClient();
  const now = Date.now();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const [stats7d, stats24h, recentFailed, recent] = await Promise.all([
    countDeliveriesByStatus(supabase, since7d),
    countDeliveriesByStatus(supabase, since24h),
    listDeliveries(supabase, { status: "failed", limit: 10 }),
    listDeliveries(supabase, { limit: 10 }),
  ]);
  return { stats7d, stats24h, recentFailed, recent };
}

// ───────────────────────── /admin/notifications/deliveries ─────────────────────────

export async function listNotificationDeliveriesForAdmin(
  filter: ListDeliveriesFilter,
): Promise<NotificationDeliveryRow[]> {
  await ensureNotificationAdmin();
  const supabase = createServiceClient();
  return listDeliveries(supabase, filter);
}

// ───────────────────────── /admin/notifications/subscriptions ─────────────────────────

export interface SubscriptionsBoardData {
  subscriptions: NotificationSubscriptionRow[];
  targets: Array<NotificationTargetRow & { channel_code: ChannelCode }>;
  codeTemplates: TemplateDefinition[];
}

export async function getNotificationSubscriptionsBoardData(): Promise<SubscriptionsBoardData> {
  await ensureNotificationAdmin();
  const supabase = createServiceClient();
  const [subscriptions, targets] = await Promise.all([
    listAllSubscriptions(supabase),
    listTargets(supabase, { onlyActive: false }),
  ]);

  // 訂閱的 target_id 有時指向別品牌自己的 target（例如借用另一品牌真的有人在看的
  // 群組當暫代收件人，dispatch 端本來就允許跨品牌引用）。listTargets() 只回目前
  // scope 品牌的 target，這裡把「訂閱有引用、但不在上面清單裡」的 target 額外補回來，
  // 避免 UI 把它誤判成「已刪除」。
  const knownIds = new Set(targets.map((t) => t.id));
  const referencedTargetIds = subscriptions
    .map((s) => s.target_id)
    .filter((id): id is string => id !== null);
  const missingIds = Array.from(new Set(referencedTargetIds)).filter((id) => !knownIds.has(id));
  const crossBrandTargets = await listTargetsByIds(supabase, missingIds);

  return {
    subscriptions,
    targets: [...targets, ...crossBrandTargets],
    codeTemplates: listCodeTemplates(),
  };
}

// ───────────────────────── /admin/notifications/targets ─────────────────────────

export interface TargetsBoardData {
  channels: NotificationChannelRow[];
  targets: Array<NotificationTargetRow & { channel_code: ChannelCode }>;
  candidates: CandidateRow[];
}

export async function getNotificationTargetsBoardData(): Promise<TargetsBoardData> {
  await ensureNotificationAdmin();
  const supabase = createServiceClient();
  const [channels, targets, candidates] = await Promise.all([
    listActiveChannels(supabase),
    listTargets(supabase, { onlyActive: false }),
    listPendingCandidates(supabase),
  ]);
  return { channels, targets, candidates };
}

// ───────────────────────── /admin/notifications/templates ─────────────────────────

export interface TemplatesBoardData {
  codeTemplates: TemplateDefinition[];
  dbTemplates: NotificationTemplateRow[];
}

export async function getNotificationTemplatesBoardData(): Promise<TemplatesBoardData> {
  await ensureNotificationAdmin();
  const supabase = createServiceClient();
  const [codeTemplates, dbTemplates] = await Promise.all([
    Promise.resolve(listCodeTemplates()),
    listTemplates(supabase),
  ]);
  return { codeTemplates, dbTemplates };
}

// re-export filter type for page use
export type { ListDeliveriesFilter };

// re-export EventCode / ChannelCode / DeliveryStatus for page use
export type { EventCode, ChannelCode, DeliveryStatus };
