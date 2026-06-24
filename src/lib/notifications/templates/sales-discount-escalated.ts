import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s } from "./kits";

const ESCALATE_RED = "#CC0000";

// 事件：sales_discount.escalated — 折扣審核逾時，升級到代理審核人
// payload: approvalId / quoteId / discountPct / discountAmount / vehicleModelName / overdueMinutes / escalatedToName / actionUrl

export const salesDiscountEscalatedLine: TemplateDefinition = {
  code: "sales-discount-escalated.line.default",
  eventCode: "sales_discount.escalated",
  channelCode: "line",
  format: "flex",
  description: "折扣審核逾時升級通知代理審核人（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "🚨",
      title: "折扣審核逾時！已升級",
      subtitle: `車款：${s(p, "vehicleModelName")}`,
      headerColor: ESCALATE_RED,
      fields: [
        { label: "逾時時間", value: `${s(p, "overdueMinutes")} 分鐘未處理` },
        { label: "折扣比例", value: `${s(p, "discountPct")}%` },
        {
          label: "折扣金額",
          value: s(p, "discountAmount")
            ? `NT$ ${Number(s(p, "discountAmount")).toLocaleString("zh-TW")}`
            : "—",
        },
        { label: "代理審核人", value: s(p, "escalatedToName") || "（已通知）" },
      ],
      actionLabel: "立即審批",
      actionUrl: s(p, "actionUrl"),
      altText: `🚨 折扣審核逾時 ${s(p, "overdueMinutes")} 分 — ${s(p, "vehicleModelName")}`,
    }),
};

export const salesDiscountEscalatedGoogleChat: TemplateDefinition = {
  code: "sales-discount-escalated.google-chat.default",
  eventCode: "sales_discount.escalated",
  channelCode: "google-chat",
  format: "card",
  description: "折扣審核逾時升級通知代理審核人（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "🚨",
      title: "折扣審核逾時！已升級",
      subtitle: `車款：${s(p, "vehicleModelName")}`,
      fields: [
        { label: "逾時時間", value: `${s(p, "overdueMinutes")} 分鐘未處理` },
        { label: "折扣比例", value: `${s(p, "discountPct")}%` },
        {
          label: "折扣金額",
          value: s(p, "discountAmount")
            ? `NT$ ${Number(s(p, "discountAmount")).toLocaleString("zh-TW")}`
            : "—",
        },
        { label: "代理審核人", value: s(p, "escalatedToName") || "（已通知）" },
      ],
      actionLabel: "立即審批",
      actionUrl: s(p, "actionUrl"),
    }),
};
