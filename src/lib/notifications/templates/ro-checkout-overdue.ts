import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_WARNING } from "./kits";

// 事件：ro_checkout.unpaid_overdue — 付費 RO 待結帳超過 N 天，升級通知店長
// payload: checkoutNo / roCode / customerName / overdueDays / payable / actionUrl / brandId

export const roCheckoutOverdueLine: TemplateDefinition = {
  code: "ro-checkout-overdue.line.default",
  eventCode: "ro_checkout.unpaid_overdue",
  channelCode: "line",
  format: "flex",
  description: "付費 RO 待結帳超過 N 天升級通知（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "⚠️",
      title: `待結帳逾期：${s(p, "overdueDays")} 天未結`,
      subtitle: `工單 ${s(p, "roCode")}　結帳單 ${s(p, "checkoutNo")}`,
      headerColor: TONE_WARNING,
      fields: [
        { label: "結帳單號", value: s(p, "checkoutNo") },
        { label: "工單號", value: s(p, "roCode") },
        { label: "車主", value: s(p, "customerName") || "（未知車主）" },
        { label: "逾期天數", value: `${s(p, "overdueDays")} 天` },
        {
          label: "應收金額",
          value: s(p, "payable")
            ? `NT$ ${Number(s(p, "payable")).toLocaleString("zh-TW")}`
            : "（尚未確認）",
        },
      ],
      actionLabel: "前往結帳頁",
      actionUrl: s(p, "actionUrl"),
      altText: `⚠️ 待結帳逾期 ${s(p, "overdueDays")} 天：${s(p, "roCode")}`,
    }),
};

export const roCheckoutOverdueGoogleChat: TemplateDefinition = {
  code: "ro-checkout-overdue.google-chat.default",
  eventCode: "ro_checkout.unpaid_overdue",
  channelCode: "google-chat",
  format: "card",
  description: "付費 RO 待結帳超過 N 天升級通知（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "⚠️",
      title: `待結帳逾期：${s(p, "overdueDays")} 天未結`,
      subtitle: `工單 ${s(p, "roCode")}　結帳單 ${s(p, "checkoutNo")}`,
      fields: [
        { label: "結帳單號", value: s(p, "checkoutNo") },
        { label: "工單號", value: s(p, "roCode") },
        { label: "車主", value: s(p, "customerName") || "（未知車主）" },
        { label: "逾期天數", value: `${s(p, "overdueDays")} 天` },
        {
          label: "應收金額",
          value: s(p, "payable")
            ? `NT$ ${Number(s(p, "payable")).toLocaleString("zh-TW")}`
            : "（尚未確認）",
        },
      ],
      actionLabel: "前往結帳頁",
      actionUrl: s(p, "actionUrl"),
    }),
};
