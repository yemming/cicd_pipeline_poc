import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_SUCCESS, DUCATI_RED } from "./kits";

// 事件：RP5 主管授權結果 — 主管核准/拒絕後，推播通知申請 SA
// payload: approvalId / scenario / scenarioLabel / roCode / customerName / decision / decisionLabel / reason / deciderName / actionUrl

export const aftersalesApprovalResolvedLine: TemplateDefinition = {
  code: "aftersales-approval-resolved.line.default",
  eventCode: "aftersales_approval.resolved",
  channelCode: "line",
  format: "flex",
  description: "RP5 主管授權結果通知（LINE Flex）",
  render: (p) => {
    const isApproved = s(p, "decision") === "approved";
    return buildLineFlex({
      emoji: isApproved ? "✅" : "❌",
      title: `授權${s(p, "decisionLabel")}：${s(p, "scenarioLabel")}`,
      subtitle: `工單 ${s(p, "roCode")}`,
      headerColor: isApproved ? TONE_SUCCESS : DUCATI_RED,
      fields: [
        { label: "情境", value: s(p, "scenarioLabel") },
        { label: "工單號", value: s(p, "roCode") },
        { label: "客戶", value: s(p, "customerName") },
        { label: "決定", value: s(p, "decisionLabel") },
        { label: "主管", value: s(p, "deciderName") },
        { label: "說明", value: s(p, "reason") },
      ],
      actionLabel: "前往工單",
      actionUrl: s(p, "actionUrl"),
    });
  },
};

export const aftersalesApprovalResolvedGoogleChat: TemplateDefinition = {
  code: "aftersales-approval-resolved.google-chat.default",
  eventCode: "aftersales_approval.resolved",
  channelCode: "google-chat",
  format: "card",
  description: "RP5 主管授權結果通知（Google Chat Card v2）",
  render: (p) => {
    const isApproved = s(p, "decision") === "approved";
    return buildGoogleCard({
      emoji: isApproved ? "✅" : "❌",
      title: `授權${s(p, "decisionLabel")}：${s(p, "scenarioLabel")}`,
      subtitle: `工單 ${s(p, "roCode")}`,
      fields: [
        { label: "情境", value: s(p, "scenarioLabel") },
        { label: "工單號", value: s(p, "roCode") },
        { label: "客戶", value: s(p, "customerName") },
        { label: "決定", value: s(p, "decisionLabel") },
        { label: "主管", value: s(p, "deciderName") },
        { label: "說明", value: s(p, "reason") },
      ],
      actionLabel: "前往工單",
      actionUrl: s(p, "actionUrl"),
    });
  },
};
