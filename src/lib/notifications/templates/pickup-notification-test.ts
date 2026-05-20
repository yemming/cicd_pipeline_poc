import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_INFO } from "./kits";

/**
 * 事件：pickup_notification.test
 * 來源：/parts/aftersales/settings/pickup-notify 範本管理 → 「📤 測試」按鈕
 *
 * payload:
 *   templateId / templateName / channel ('line' | 'sms' | 'email')
 *   subject  (Email 才有；其餘空字串)
 *   body     (套用示範變數後的最終訊息字串)
 *   triggeredBy (使用者 email or uid)
 */

export const pickupNotificationTestLine: TemplateDefinition = {
  code: "pickup-notification-test.line.default",
  eventCode: "pickup_notification.test",
  channelCode: "line",
  format: "flex",
  description: "取車通知範本測試（LINE Flex）— 派送來自設定後台",
  render: (p) =>
    buildLineFlex({
      emoji: "🧪",
      title: "取車通知範本測試",
      subtitle: s(p, "templateName"),
      headerColor: TONE_INFO,
      fields: [
        { label: "通道", value: channelLabel(s(p, "channel")) },
        { label: "觸發人", value: s(p, "triggeredBy") },
        { label: "訊息", value: truncate(s(p, "body"), 180) },
      ],
    }),
};

export const pickupNotificationTestGoogleChat: TemplateDefinition = {
  code: "pickup-notification-test.google-chat.default",
  eventCode: "pickup_notification.test",
  channelCode: "google-chat",
  format: "card",
  description: "取車通知範本測試（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "🧪",
      title: "取車通知範本測試",
      subtitle: s(p, "templateName"),
      fields: [
        { label: "通道", value: channelLabel(s(p, "channel")) },
        { label: "觸發人", value: s(p, "triggeredBy") },
        { label: "訊息", value: truncate(s(p, "body"), 240) },
      ],
    }),
};

function channelLabel(ch: string): string {
  if (ch === "line") return "LINE";
  if (ch === "sms") return "簡訊";
  if (ch === "email") return "Email";
  return ch || "—";
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}⋯` : s;
}
