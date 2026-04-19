import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEvent, ChannelSendResult } from "../types";
import { getChannel } from "../channels";
import {
  createPendingDelivery,
  markDeliveryFailed,
  markDeliverySent,
} from "../repositories/delivery.repo";
import type { ResolvedRecipient } from "./resolver";

/**
 * 送一個 recipient 並記錄到 notification_deliveries。
 * 不 throw — 任何錯誤都轉成 ChannelSendResult 回傳，呼叫者用 Promise.allSettled 處理。
 */
export async function sendToRecipient(
  supabase: SupabaseClient,
  event: NotificationEvent,
  recipient: ResolvedRecipient,
): Promise<{ deliveryId: string; result: ChannelSendResult }> {
  // 1. 先 insert pending 記錄
  const delivery = await createPendingDelivery(supabase, {
    event_code: event.code,
    event_payload: event.payload,
    subscription_id: recipient.subscription.id,
    channel_code: recipient.channelCode,
    target_ref: recipient.target.target_ref,
    template_code: recipient.template.code,
  });

  // 2. render 模板
  let rendered: unknown;
  try {
    rendered = recipient.template.render(event.payload);
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
        error: { code: "TEMPLATE_RENDER_ERROR", message: msg, retryable: false, raw: e },
      },
    };
  }

  // 3. 發送（channel.send 內部已做 3 次 retry）
  const channel = getChannel(recipient.channelCode);
  const result = await channel.send(
    { ref: recipient.target.target_ref, metadata: recipient.target.metadata },
    rendered,
  );

  // 4. 寫結果
  // BaseChannel.withRetry 最多跑 3 次；實際 attempts 不由 SDK 暴露，這裡以最終結果為準
  // ok=true 時 attempts 至少 1；失敗時保守記為 3（達到 max）
  const attempts = result.ok ? 1 : 3;

  if (result.ok) {
    await markDeliverySent(supabase, delivery.id, {
      providerMessageId: result.providerMessageId,
      renderedBody: rendered,
      attempts,
    });
  } else {
    const errMsg = `[${result.error?.code ?? "UNKNOWN"}] ${result.error?.message ?? "unknown"}`;
    await markDeliveryFailed(supabase, delivery.id, {
      error: errMsg,
      renderedBody: rendered,
      attempts,
    });
  }

  return { deliveryId: delivery.id, result };
}
