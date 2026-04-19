import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  ChannelCode,
  ChannelSendResult,
  NotificationEvent,
} from "./types";
import { getChannel } from "./channels";
import { getTemplate } from "./templates/registry";
import {
  createPendingDelivery,
  getDeliveryById,
  markDeliveryFailed,
  markDeliverySent,
} from "./repositories/delivery.repo";
import { resolveRecipients } from "./dispatch/resolver";
import { sendToRecipient } from "./dispatch/sender";
import { NotificationError, TemplateNotFoundError } from "./errors";

export interface DispatchResult {
  eventCode: string;
  attempted: number;
  sent: number;
  failed: number;
  deliveries: Array<{
    deliveryId: string;
    channelCode: ChannelCode;
    targetRef: string;
    ok: boolean;
    error?: string;
  }>;
}

/**
 * Notification Hub 主服務。
 * 使用：import { notifications } from '@/lib/notifications';
 */
export class NotificationService {
  /**
   * 主入口：事件 → 所有訂閱者並行送出。
   * 任何單一 recipient 失敗都不影響其他；所有結果寫入 notification_deliveries。
   */
  async dispatch(event: NotificationEvent): Promise<DispatchResult> {
    const supabase = createServiceClient();
    const recipients = await resolveRecipients(supabase, event);

    if (recipients.length === 0) {
      if (process.env.NOTIFICATION_DEBUG === "true") {
        console.log("[notifications] dispatch: 事件 %s 無訂閱者", event.code);
      }
      return {
        eventCode: event.code,
        attempted: 0,
        sent: 0,
        failed: 0,
        deliveries: [],
      };
    }

    const results = await Promise.allSettled(
      recipients.map((r) => sendToRecipient(supabase, event, r)),
    );

    let sent = 0;
    let failed = 0;
    const deliveries: DispatchResult["deliveries"] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const rcpt = recipients[i];
      if (r.status === "fulfilled") {
        if (r.value.result.ok) sent++;
        else failed++;
        deliveries.push({
          deliveryId: r.value.deliveryId,
          channelCode: rcpt.channelCode,
          targetRef: rcpt.target.target_ref,
          ok: r.value.result.ok,
          error: r.value.result.error?.message,
        });
      } else {
        // sendToRecipient 設計上不 throw；真走到這裡代表 repo insert 階段就爆
        failed++;
        deliveries.push({
          deliveryId: "",
          channelCode: rcpt.channelCode,
          targetRef: rcpt.target.target_ref,
          ok: false,
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    }

    return { eventCode: event.code, attempted: recipients.length, sent, failed, deliveries };
  }

  /**
   * 繞過訂閱，直接送一則（後台 test-send / debug 用）。
   * 會寫 delivery 記錄（subscription_id = null）。
   */
  async sendDirect(opts: {
    channelCode: ChannelCode;
    targetRef: string;
    templateCode?: string;
    eventCode: NotificationEvent["code"];
    payload: Record<string, unknown>;
  }): Promise<{ deliveryId: string; result: ChannelSendResult }> {
    const supabase = createServiceClient();

    const tpl = await getTemplate(supabase, {
      eventCode: opts.eventCode,
      channelCode: opts.channelCode,
      code: opts.templateCode,
    });
    if (!tpl) throw new TemplateNotFoundError(opts.eventCode, opts.channelCode);

    const delivery = await createPendingDelivery(supabase, {
      event_code: opts.eventCode,
      event_payload: opts.payload,
      subscription_id: null,
      channel_code: opts.channelCode,
      target_ref: opts.targetRef,
      template_code: tpl.code,
    });

    let rendered: unknown;
    try {
      rendered = tpl.render(opts.payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markDeliveryFailed(supabase, delivery.id, {
        error: `template render 失敗：${msg}`,
        renderedBody: null,
        attempts: 0,
      });
      return {
        deliveryId: delivery.id,
        result: {
          ok: false,
          error: { code: "TEMPLATE_RENDER_ERROR", message: msg, retryable: false },
        },
      };
    }

    const channel = getChannel(opts.channelCode);
    const result = await channel.send({ ref: opts.targetRef }, rendered);

    if (result.ok) {
      await markDeliverySent(supabase, delivery.id, {
        providerMessageId: result.providerMessageId,
        renderedBody: rendered,
        attempts: 1,
      });
    } else {
      await markDeliveryFailed(supabase, delivery.id, {
        error: `[${result.error?.code ?? "UNKNOWN"}] ${result.error?.message ?? "unknown"}`,
        renderedBody: rendered,
        attempts: 3,
      });
    }

    return { deliveryId: delivery.id, result };
  }

  /**
   * 重送一筆失敗的 delivery。會重新 render（用當下的模板）— 可用於改過模板後想重發。
   */
  async retryDelivery(deliveryId: string): Promise<ChannelSendResult> {
    const supabase: SupabaseClient = createServiceClient();
    const delivery = await getDeliveryById(supabase, deliveryId);
    if (!delivery) throw new NotificationError(`找不到 delivery ${deliveryId}`);
    if (delivery.status === "sent") {
      return {
        ok: false,
        error: { code: "ALREADY_SENT", message: "此筆已成功送達，無需重送", retryable: false },
      };
    }

    // 重解模板（可能 DB 模板已被更新）
    const tpl = await getTemplate(supabase, {
      eventCode: delivery.event_code,
      channelCode: delivery.channel_code,
      code: delivery.template_code,
    });
    if (!tpl) throw new TemplateNotFoundError(delivery.event_code, delivery.channel_code);

    let rendered: unknown;
    try {
      rendered = tpl.render(delivery.event_payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await markDeliveryFailed(supabase, delivery.id, {
        error: `template render 失敗：${msg}`,
        renderedBody: null,
        attempts: delivery.attempts + 1,
      });
      return {
        ok: false,
        error: { code: "TEMPLATE_RENDER_ERROR", message: msg, retryable: false },
      };
    }

    const channel = getChannel(delivery.channel_code);
    const result = await channel.send({ ref: delivery.target_ref }, rendered);

    if (result.ok) {
      await markDeliverySent(supabase, delivery.id, {
        providerMessageId: result.providerMessageId,
        renderedBody: rendered,
        attempts: delivery.attempts + 1,
      });
    } else {
      await markDeliveryFailed(supabase, delivery.id, {
        error: `[${result.error?.code ?? "UNKNOWN"}] ${result.error?.message ?? "unknown"}`,
        renderedBody: rendered,
        attempts: delivery.attempts + 1,
      });
    }
    return result;
  }
}

export const notifications = new NotificationService();
