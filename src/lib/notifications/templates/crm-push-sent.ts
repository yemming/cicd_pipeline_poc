import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_INFO } from "./kits";

// 事件：CRM06A/06B 推播任務「發送」後，經 Notification Hub 推一張摘要卡到通知群組。
// Phase 1（C-25）：示範鏈路 — 推播摘要送既有 LINE 群組證明「按發送 → Hub → 真 LINE」整條通；
// 真正逐客戶發送需客戶 LINE 綁定 infra（customers 無 LINE userId），屬另案。
// payload：
//   kind          'sales' | 'aftersales'
//   campaignName  任務名稱
//   channel       通道（line / sms / email）
//   audienceCount 受眾人數（字串）
//   targetHabc    HABC 客群（逗號串）
//   messagePreview 推播文案預覽
//   brand         品牌
//   url           推播管理頁連結

const kindLabel = (k: string) => (k === "aftersales" ? "售後 CRM" : "銷售 CRM");

export const crmPushSentLine: TemplateDefinition = {
  code: "crm-push-sent.line.default",
  eventCode: "crm_push.sent",
  channelCode: "line",
  format: "flex",
  description: "CRM 推播任務發送（LINE Flex）— 推播摘要通知",
  render: (p) =>
    buildLineFlex({
      emoji: "📣",
      title: "推播已發送",
      subtitle: `${kindLabel(s(p, "kind"))} · ${s(p, "campaignName")}`,
      headerColor: TONE_INFO,
      fields: [
        { label: "受眾", value: `${s(p, "audienceCount", "—")} 人（${s(p, "targetHabc", "—")}）` },
        { label: "通道", value: s(p, "channel", "line").toUpperCase() },
        { label: "內容", value: s(p, "messagePreview", "（無內容）") },
        { label: "品牌", value: s(p, "brand") },
      ],
      actionLabel: "查看推播",
      actionUrl: s(p, "url"),
    }),
};

export const crmPushSentGoogleChat: TemplateDefinition = {
  code: "crm-push-sent.google-chat.default",
  eventCode: "crm_push.sent",
  channelCode: "google-chat",
  format: "card",
  description: "CRM 推播任務發送（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "📣",
      title: "推播已發送",
      subtitle: `${kindLabel(s(p, "kind"))} · ${s(p, "campaignName")}`,
      fields: [
        { label: "受眾", value: `${s(p, "audienceCount", "—")} 人（${s(p, "targetHabc", "—")}）` },
        { label: "通道", value: s(p, "channel", "line").toUpperCase() },
        { label: "內容", value: s(p, "messagePreview", "（無內容）") },
        { label: "品牌", value: s(p, "brand") },
      ],
      actionLabel: "查看推播",
      actionUrl: s(p, "url"),
    }),
};
