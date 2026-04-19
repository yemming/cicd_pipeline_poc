import type {
  ChannelCode,
  ChannelSendResult,
  TargetRef,
} from "../types";
import { BaseChannel } from "./base.channel";

// Google Chat Incoming Webhook（Phase 2 完整實作 — Phase 0 等使用者提供 webhook URL 驗收）
//
// 格式規範：https://developers.google.com/workspace/chat/format-messages
// card v2：{ cardsV2: [{ cardId: '...', card: { header: {...}, sections: [...] } }] }
// 純文字：{ text: '...' }

const GOOGLE_CHAT_TEXT_MAX = 4096;

export class GoogleChatChannel extends BaseChannel {
  readonly code: ChannelCode = "google-chat";

  protected async doSend(target: TargetRef, renderedBody: unknown): Promise<ChannelSendResult> {
    if (!target.ref || !target.ref.startsWith("https://chat.googleapis.com/")) {
      return {
        ok: false,
        error: {
          code: "INVALID_WEBHOOK_URL",
          message: `Google Chat target.ref 不是合法 webhook URL：${target.ref.slice(0, 60)}...`,
          retryable: false,
        },
      };
    }

    const body = normalizeBody(renderedBody);
    if (!body) {
      return {
        ok: false,
        error: {
          code: "EMPTY_MESSAGE",
          message: "Google Chat 訊息內容為空",
          retryable: false,
        },
      };
    }

    let res: Response;
    try {
      res = await fetch(target.ref, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        body: JSON.stringify(body),
      });
    } catch (e) {
      // 網路層錯誤 → 可 retry
      return {
        ok: false,
        error: {
          code: "GCHAT_NETWORK",
          message: e instanceof Error ? e.message : String(e),
          retryable: true,
          raw: e,
        },
      };
    }

    const responseText = await res.text().catch(() => "");
    if (res.ok) {
      let messageName: string | undefined;
      try {
        messageName = (JSON.parse(responseText) as { name?: string }).name;
      } catch {
        // Google Chat 成功時回完整 message 物件；parse 失敗不影響結果
      }
      return { ok: true, providerMessageId: messageName };
    }

    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    return {
      ok: false,
      error: {
        code: `GCHAT_${res.status}`,
        message: `Google Chat ${res.status} ${res.statusText}: ${responseText.slice(0, 500)}`.trim(),
        retryable,
        raw: { status: res.status, statusText: res.statusText, body: responseText },
      },
    };
  }
}

function normalizeBody(body: unknown): Record<string, unknown> | null {
  if (!body) return null;

  if (typeof body === "string") {
    return { text: truncate(body, GOOGLE_CHAT_TEXT_MAX) };
  }

  if (typeof body === "object") {
    const obj = body as Record<string, unknown>;
    // 合法形狀：{ text } / { cardsV2 } / { cards }（舊版 card v1）
    if (
      "text" in obj ||
      "cardsV2" in obj ||
      "cards" in obj ||
      "thread" in obj
    ) {
      // text 截斷
      if (typeof obj.text === "string") {
        return { ...obj, text: truncate(obj.text, GOOGLE_CHAT_TEXT_MAX) };
      }
      return obj;
    }
    // 給一個逃生艙：把 object 當 card v2 包裝
    return { cardsV2: [{ cardId: "auto", card: obj }] };
  }

  return null;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 5) + "…(略)";
}
