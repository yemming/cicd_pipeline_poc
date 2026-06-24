import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_WARNING } from "./kits";

// 事件：sales_discount.requested — 業務員折扣超授權，送審通知主管
// payload: approvalId / quoteId / discountPct / discountAmount / inStoreWaiting / vehicleModelName / notes / actionUrl

export const salesDiscountRequestedLine: TemplateDefinition = {
  code: "sales-discount-requested.line.default",
  eventCode: "sales_discount.requested",
  channelCode: "line",
  format: "flex",
  description: "折扣超授權送審通知主管（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "🔖",
      title: "折扣授權申請",
      subtitle: `車款：${s(p, "vehicleModelName")}`,
      headerColor: TONE_WARNING,
      fields: [
        { label: "折扣比例", value: `${s(p, "discountPct")}%` },
        {
          label: "折扣金額",
          value: s(p, "discountAmount")
            ? `NT$ ${Number(s(p, "discountAmount")).toLocaleString("zh-TW")}`
            : "—",
        },
        { label: "客戶在場", value: s(p, "inStoreWaiting") },
        { label: "說明", value: s(p, "notes") || "（未填）" },
      ],
      actionLabel: "前往審批",
      actionUrl: s(p, "actionUrl"),
      altText: `🔖 折扣授權申請：${s(p, "vehicleModelName")} 折扣 ${s(p, "discountPct")}%`,
    }),
};

export const salesDiscountRequestedGoogleChat: TemplateDefinition = {
  code: "sales-discount-requested.google-chat.default",
  eventCode: "sales_discount.requested",
  channelCode: "google-chat",
  format: "card",
  description: "折扣超授權送審通知主管（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "🔖",
      title: "折扣授權申請",
      subtitle: `車款：${s(p, "vehicleModelName")}`,
      fields: [
        { label: "折扣比例", value: `${s(p, "discountPct")}%` },
        {
          label: "折扣金額",
          value: s(p, "discountAmount")
            ? `NT$ ${Number(s(p, "discountAmount")).toLocaleString("zh-TW")}`
            : "—",
        },
        { label: "客戶在場", value: s(p, "inStoreWaiting") },
        { label: "說明", value: s(p, "notes") || "（未填）" },
      ],
      actionLabel: "前往審批",
      actionUrl: s(p, "actionUrl"),
    }),
};
