import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, DUCATI_RED, s } from "./kits";

// 事件：服務需求（預約）建立
// payload：requestNo / customer / vehicle / scheduledAt / note / actionUrl

export const serviceRequestCreatedLine: TemplateDefinition = {
  code: "service-request-created.line.default",
  eventCode: "service_request.created",
  channelCode: "line",
  format: "flex",
  description: "服務預約建立（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "📅",
      title: `新服務預約 ${s(p, "requestNo")}`,
      headerColor: DUCATI_RED,
      fields: [
        { label: "客戶", value: s(p, "customer") },
        { label: "機車", value: s(p, "vehicle") },
        { label: "預約時間", value: s(p, "scheduledAt") },
        { label: "備註", value: s(p, "note") },
      ],
      actionLabel: "查看預約",
      actionUrl: s(p, "actionUrl"),
    }),
};

export const serviceRequestCreatedGoogleChat: TemplateDefinition = {
  code: "service-request-created.google-chat.default",
  eventCode: "service_request.created",
  channelCode: "google-chat",
  format: "card",
  description: "服務預約建立（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "📅",
      title: `新服務預約 ${s(p, "requestNo")}`,
      fields: [
        { label: "客戶", value: s(p, "customer") },
        { label: "機車", value: s(p, "vehicle") },
        { label: "預約時間", value: s(p, "scheduledAt") },
        { label: "備註", value: s(p, "note") },
      ],
      actionLabel: "查看預約",
      actionUrl: s(p, "actionUrl"),
    }),
};
