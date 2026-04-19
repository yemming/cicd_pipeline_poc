import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, DUCATI_RED, s } from "./kits";

// 事件：客戶交車時段已排定
// payload：customer / model / scheduledAt / staff / actionUrl

export const customerHandoverScheduledLine: TemplateDefinition = {
  code: "customer-handover-scheduled.line.default",
  eventCode: "customer.handover_scheduled",
  channelCode: "line",
  format: "flex",
  description: "交車排程（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "🏁",
      title: `交車已排定 · ${s(p, "customer")}`,
      subtitle: s(p, "scheduledAt"),
      headerColor: DUCATI_RED,
      fields: [
        { label: "機車", value: s(p, "model") },
        { label: "負責同仁", value: s(p, "staff") },
      ],
      actionLabel: "查看交車檔",
      actionUrl: s(p, "actionUrl"),
    }),
};

export const customerHandoverScheduledGoogleChat: TemplateDefinition = {
  code: "customer-handover-scheduled.google-chat.default",
  eventCode: "customer.handover_scheduled",
  channelCode: "google-chat",
  format: "card",
  description: "交車排程（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "🏁",
      title: `交車已排定 · ${s(p, "customer")}`,
      subtitle: s(p, "scheduledAt"),
      fields: [
        { label: "機車", value: s(p, "model") },
        { label: "負責同仁", value: s(p, "staff") },
      ],
      actionLabel: "查看交車檔",
      actionUrl: s(p, "actionUrl"),
    }),
};
