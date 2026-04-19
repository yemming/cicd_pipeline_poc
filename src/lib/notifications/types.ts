// Notification Hub 對外型別定義
// 所有業務模組 import { ... } from '@/lib/notifications' 時吃到的就是這些型別

export type ChannelCode = "line" | "google-chat";

export type TargetType = "user" | "group" | "webhook";

// MVP 內建事件（§5）— 新增事件時兩地同步：這裡 + templates/registry.ts
export type EventCode =
  | "work_order.created"
  | "work_order.status_changed"
  | "service_request.created"
  | "vehicle.pdi_completed"
  | "customer.handover_scheduled"
  // Phase 6.1：DealerOS 本 repo 首個真實接點
  | "feedback_ticket.created";

export interface NotificationEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  code: EventCode;
  payload: TPayload;
  occurredAt?: Date;
  actorId?: string;
  dealerId?: string;
}

export interface TargetRef {
  /** LINE groupId / userId 或 Google Chat webhook URL */
  ref: string;
  metadata?: Record<string, unknown>;
}

export interface ChannelSendResult {
  ok: boolean;
  providerMessageId?: string;
  error?: {
    code: string;
    message: string;
    /** 是否建議 retry（429 / 5xx true；4xx 非 429 false）*/
    retryable?: boolean;
    raw?: unknown;
  };
}

export type TemplateFormat = "text" | "flex" | "card";

export interface TemplateDefinition<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  code: string;
  eventCode: EventCode;
  channelCode: ChannelCode;
  format: TemplateFormat;
  description?: string;
  render: (payload: TPayload) => unknown;
}

export interface NotificationChannel {
  readonly code: ChannelCode;
  send(target: TargetRef, renderedBody: unknown): Promise<ChannelSendResult>;
  render(template: TemplateDefinition, payload: Record<string, unknown>): unknown;
}

// ────────────────────────────────────────────────────────────
// DB Row 型別（與 Supabase schema 對齊，Phase 1 先手寫；
// Phase 2+ 可用 mcp__supabase__generate_typescript_types 自動產）

export interface NotificationChannelRow {
  id: string;
  code: ChannelCode;
  display_name: string;
  is_active: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NotificationTargetRow {
  id: string;
  channel_id: string;
  target_type: TargetType;
  target_ref: string;
  display_name: string;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationSubscriptionRow {
  id: string;
  event_code: EventCode;
  target_id: string;
  template_code: string | null;
  filter_rules: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotificationTemplateRow {
  id: string;
  code: string;
  event_code: EventCode;
  channel_code: ChannelCode;
  format: TemplateFormat;
  body: Record<string, unknown>;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type DeliveryStatus = "pending" | "sent" | "failed" | "retrying";

export interface NotificationDeliveryRow {
  id: string;
  event_code: EventCode;
  event_payload: Record<string, unknown>;
  subscription_id: string | null;
  channel_code: ChannelCode;
  target_ref: string;
  template_code: string | null;
  status: DeliveryStatus;
  attempts: number;
  last_error: string | null;
  rendered_body: unknown;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}
