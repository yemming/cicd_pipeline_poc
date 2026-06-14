import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, DUCATI_RED } from "./kits";

// 事件：RP5 主管授權申請 — SA 送出授權申請，推播通知主管
// payload: approvalId / scenario / scenarioLabel / roCode / customerName / saName / notes / context / actionUrl

export const aftersalesApprovalRequestedLine: TemplateDefinition = {
  code: "aftersales-approval-requested.line.default",
  eventCode: "aftersales_approval.requested",
  channelCode: "line",
  format: "flex",
  description: "RP5 主管授權申請通知（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "🔔",
      title: `授權申請：${s(p, "scenarioLabel")}`,
      subtitle: `工單 ${s(p, "roCode")}`,
      headerColor: DUCATI_RED,
      fields: [
        { label: "情境", value: s(p, "scenarioLabel") },
        { label: "工單號", value: s(p, "roCode") },
        { label: "客戶", value: s(p, "customerName") },
        { label: "申請 SA", value: s(p, "saName") },
        { label: "說明", value: s(p, "notes") || "（未填說明）" },
      ],
      actionLabel: "前往審批",
      actionUrl: s(p, "actionUrl"),
    }),
};

export const aftersalesApprovalRequestedGoogleChat: TemplateDefinition = {
  code: "aftersales-approval-requested.google-chat.default",
  eventCode: "aftersales_approval.requested",
  channelCode: "google-chat",
  format: "card",
  description: "RP5 主管授權申請通知（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "🔔",
      title: `授權申請：${s(p, "scenarioLabel")}`,
      subtitle: `工單 ${s(p, "roCode")}`,
      fields: [
        { label: "情境", value: s(p, "scenarioLabel") },
        { label: "工單號", value: s(p, "roCode") },
        { label: "客戶", value: s(p, "customerName") },
        { label: "申請 SA", value: s(p, "saName") },
        { label: "說明", value: s(p, "notes") || "（未填說明）" },
      ],
      actionLabel: "前往審批",
      actionUrl: s(p, "actionUrl"),
    }),
};
