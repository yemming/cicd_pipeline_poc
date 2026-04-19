import { HTTPFetchError, messagingApi } from "@line/bot-sdk";
import type {
  ChannelCode,
  ChannelSendResult,
  TargetRef,
} from "../types";
import { getNotificationEnv } from "../env";
import { BaseChannel } from "./base.channel";

// LINE Messaging API pushMessage 單次訊息字元上限（Flex altText / text）
const LINE_TEXT_MAX = 5000;

export class LineChannel extends BaseChannel {
  readonly code: ChannelCode = "line";

  private _client: messagingApi.MessagingApiClient | null = null;

  private client(): messagingApi.MessagingApiClient {
    if (this._client) return this._client;
    const env = getNotificationEnv();
    this._client = new messagingApi.MessagingApiClient({
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    });
    return this._client;
  }

  protected async doSend(target: TargetRef, renderedBody: unknown): Promise<ChannelSendResult> {
    const messages = normalizeToMessages(renderedBody);
    if (messages.length === 0) {
      return {
        ok: false,
        error: {
          code: "EMPTY_MESSAGE",
          message: "LINE 訊息內容為空",
          retryable: false,
        },
      };
    }

    try {
      const res = await this.client().pushMessage({
        to: target.ref,
        messages: messages as messagingApi.Message[],
      });
      // SDK v11：pushMessage 回傳 PushMessageResponse，sentMessages[0].id 可作為 providerMessageId
      const firstId = res?.sentMessages?.[0]?.id;
      return { ok: true, providerMessageId: firstId ?? undefined };
    } catch (e) {
      return translateLineError(e);
    }
  }
}

/**
 * 把 render 輸出標準化成 LINE messages 陣列。
 * 支援：
 *  - {type: 'flex', altText, contents}（template 直出）
 *  - {type: 'text', text}
 *  - 已是陣列（多訊息）
 */
function normalizeToMessages(body: unknown): unknown[] {
  if (Array.isArray(body)) return body.map(sanitizeMessage);
  if (body && typeof body === "object") return [sanitizeMessage(body)];
  if (typeof body === "string") {
    return [{ type: "text", text: truncate(body, LINE_TEXT_MAX) }];
  }
  return [];
}

function sanitizeMessage(m: unknown): unknown {
  if (!m || typeof m !== "object") return m;
  const msg = m as { type?: string; text?: string; altText?: string };
  if (msg.type === "text" && typeof msg.text === "string") {
    return { ...msg, text: truncate(msg.text, LINE_TEXT_MAX) };
  }
  if (msg.type === "flex" && typeof msg.altText === "string") {
    return { ...msg, altText: truncate(msg.altText, 400) }; // altText 上限 400
  }
  return msg;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 5) + "…(略)";
}

function translateLineError(e: unknown): ChannelSendResult {
  if (e instanceof HTTPFetchError) {
    const status = e.status;
    const retryable = status === 429 || (status >= 500 && status < 600);
    return {
      ok: false,
      error: {
        code: `LINE_${status}`,
        message: `LINE API ${status} ${e.statusText}: ${e.body?.slice(0, 500) ?? ""}`.trim(),
        retryable,
        raw: { status, statusText: e.statusText, body: e.body },
      },
    };
  }
  if (e instanceof Error) {
    return {
      ok: false,
      error: {
        code: "LINE_UNKNOWN",
        message: e.message,
        retryable: true,
        raw: e,
      },
    };
  }
  return {
    ok: false,
    error: {
      code: "LINE_UNKNOWN",
      message: String(e),
      retryable: true,
    },
  };
}
