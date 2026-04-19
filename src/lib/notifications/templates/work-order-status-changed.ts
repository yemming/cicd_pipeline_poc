import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_WARNING } from "./kits";

// 事件：維修工單狀態改變
// payload：orderNo / from / to / actor / actionUrl

export const workOrderStatusChangedLine: TemplateDefinition = {
  code: "work-order-status-changed.line.default",
  eventCode: "work_order.status_changed",
  channelCode: "line",
  format: "flex",
  description: "工單狀態變更（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "🔄",
      title: `工單 ${s(p, "orderNo")} 狀態更新`,
      headerColor: TONE_WARNING,
      fields: [
        { label: "原狀態", value: s(p, "from") },
        { label: "新狀態", value: s(p, "to") },
        { label: "操作人", value: s(p, "actor") },
      ],
      actionLabel: "查看工單",
      actionUrl: s(p, "actionUrl"),
    }),
};

export const workOrderStatusChangedGoogleChat: TemplateDefinition = {
  code: "work-order-status-changed.google-chat.default",
  eventCode: "work_order.status_changed",
  channelCode: "google-chat",
  format: "card",
  description: "工單狀態變更（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "🔄",
      title: `工單 ${s(p, "orderNo")} 狀態更新`,
      fields: [
        { label: "原狀態", value: s(p, "from") },
        { label: "新狀態", value: s(p, "to") },
        { label: "操作人", value: s(p, "actor") },
      ],
      actionLabel: "查看工單",
      actionUrl: s(p, "actionUrl"),
    }),
};
