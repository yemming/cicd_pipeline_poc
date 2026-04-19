import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_INFO } from "./kits";

// 事件：DealerOS 意見回饋單建立（CI/CD pipeline 的入口訊號）
// payload：ticketId / title / url / createdBy / actionUrl

export const feedbackTicketCreatedLine: TemplateDefinition = {
  code: "feedback-ticket-created.line.default",
  eventCode: "feedback_ticket.created",
  channelCode: "line",
  format: "flex",
  description: "客戶提需求（LINE Flex）— CI/CD pipeline 觸發訊號",
  render: (p) =>
    buildLineFlex({
      emoji: "💡",
      title: "新許願單",
      subtitle: s(p, "title"),
      headerColor: TONE_INFO,
      fields: [
        { label: "提出人", value: s(p, "createdBy") },
        { label: "相關連結", value: s(p, "url") },
        { label: "Ticket ID", value: s(p, "ticketId").slice(0, 8) },
      ],
      actionLabel: "前往審閱",
      actionUrl: s(p, "actionUrl"),
    }),
};

export const feedbackTicketCreatedGoogleChat: TemplateDefinition = {
  code: "feedback-ticket-created.google-chat.default",
  eventCode: "feedback_ticket.created",
  channelCode: "google-chat",
  format: "card",
  description: "客戶提需求（Google Chat Card v2）— CI/CD pipeline 觸發訊號",
  render: (p) =>
    buildGoogleCard({
      emoji: "💡",
      title: "新許願單",
      subtitle: s(p, "title"),
      fields: [
        { label: "提出人", value: s(p, "createdBy") },
        { label: "相關連結", value: s(p, "url") },
        { label: "Ticket ID", value: s(p, "ticketId").slice(0, 8) },
      ],
      actionLabel: "前往審閱",
      actionUrl: s(p, "actionUrl"),
    }),
};
