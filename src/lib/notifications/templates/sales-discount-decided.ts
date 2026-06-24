import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_SUCCESS } from "./kits";

const REJECT_RED = "#CC0000";

// 事件：sales_discount.decided — 主管核准 / 駁回，通知業務員
// payload: approvalId / decision / reason / actionUrl / vehicleModelName

export const salesDiscountDecidedLine: TemplateDefinition = {
  code: "sales-discount-decided.line.default",
  eventCode: "sales_discount.decided",
  channelCode: "line",
  format: "flex",
  description: "折扣審核結果通知業務員（LINE Flex）",
  render: (p) => {
    const isApproved = String(s(p, "decision")).includes("核准");
    return buildLineFlex({
      emoji: isApproved ? "✅" : "❌",
      title: `折扣審核：${s(p, "decision")}`,
      subtitle: s(p, "vehicleModelName") ? `車款：${s(p, "vehicleModelName")}` : undefined,
      headerColor: isApproved ? TONE_SUCCESS : REJECT_RED,
      fields: [
        { label: "審核結果", value: s(p, "decision") },
        { label: "說明", value: s(p, "reason") || "（無說明）" },
      ],
      actionLabel: "查看報價單",
      actionUrl: s(p, "actionUrl"),
      altText: `${isApproved ? "✅" : "❌"} 折扣審核 ${s(p, "decision")}`,
    });
  },
};

export const salesDiscountDecidedGoogleChat: TemplateDefinition = {
  code: "sales-discount-decided.google-chat.default",
  eventCode: "sales_discount.decided",
  channelCode: "google-chat",
  format: "card",
  description: "折扣審核結果通知業務員（Google Chat Card v2）",
  render: (p) => {
    const isApproved = String(s(p, "decision")).includes("核准");
    return buildGoogleCard({
      emoji: isApproved ? "✅" : "❌",
      title: `折扣審核：${s(p, "decision")}`,
      subtitle: s(p, "vehicleModelName") ? `車款：${s(p, "vehicleModelName")}` : undefined,
      fields: [
        { label: "審核結果", value: s(p, "decision") },
        { label: "說明", value: s(p, "reason") || "（無說明）" },
      ],
      actionLabel: "查看報價單",
      actionUrl: s(p, "actionUrl"),
    });
  },
};
