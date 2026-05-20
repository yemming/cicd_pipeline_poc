import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, DUCATI_RED } from "./kits";

// 事件：售後增項閉環案件升級到主管介入
// payload：caseId / caseNo / title / customerName / vehicleModel / safetyLevel /
//          estimatedFee / saName / reason / actionUrl

export const aftersalesFollowupEscalatedLine: TemplateDefinition = {
  code: "aftersales-followup-escalated.line.default",
  eventCode: "aftersales_followup.escalated",
  channelCode: "line",
  format: "flex",
  description: "增項閉環案件升級主管介入（LINE Flex）— 安全等級或長期未回應自動推播",
  render: (p) =>
    buildLineFlex({
      emoji: "🔴",
      title: "主管介入：增項閉環",
      subtitle: s(p, "title"),
      headerColor: DUCATI_RED,
      fields: [
        { label: "案件號", value: s(p, "caseNo") },
        { label: "車主 / 車型", value: `${s(p, "customerName")} · ${s(p, "vehicleModel")}` },
        { label: "估計金額", value: `NT$${s(p, "estimatedFee")}` },
        { label: "安全等級", value: s(p, "safetyLevel") },
        { label: "負責 SA", value: s(p, "saName") },
        { label: "升級原因", value: s(p, "reason") },
      ],
      actionLabel: "前往處理",
      actionUrl: s(p, "actionUrl"),
    }),
};

export const aftersalesFollowupEscalatedGoogleChat: TemplateDefinition = {
  code: "aftersales-followup-escalated.google-chat.default",
  eventCode: "aftersales_followup.escalated",
  channelCode: "google-chat",
  format: "card",
  description: "增項閉環案件升級主管介入（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "🔴",
      title: "主管介入：增項閉環",
      subtitle: s(p, "title"),
      fields: [
        { label: "案件號", value: s(p, "caseNo") },
        { label: "車主 / 車型", value: `${s(p, "customerName")} · ${s(p, "vehicleModel")}` },
        { label: "估計金額", value: `NT$${s(p, "estimatedFee")}` },
        { label: "安全等級", value: s(p, "safetyLevel") },
        { label: "負責 SA", value: s(p, "saName") },
        { label: "升級原因", value: s(p, "reason") },
      ],
      actionLabel: "前往處理",
      actionUrl: s(p, "actionUrl"),
    }),
};
