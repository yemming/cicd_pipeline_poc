import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_WARNING } from "./kits";

// 事件：financing.pending_timeout — 貸款申請超過 7 天未核貸，通知業務員追蹤
// payload: orderId / orderNo / customerName / rsName / daysOverdue / vehicleModelName / actionUrl / brandId

export const financingPendingTimeoutLine: TemplateDefinition = {
  code: "financing-pending-timeout.line.default",
  eventCode: "financing.pending_timeout",
  channelCode: "line",
  format: "flex",
  description: "貸款審核逾 7 天提醒業務員追蹤（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "⏳",
      title: "貸款審核逾期提醒",
      subtitle: `訂單 ${s(p, "orderNo")}`,
      headerColor: TONE_WARNING,
      fields: [
        { label: "訂單號", value: s(p, "orderNo") },
        { label: "客戶", value: s(p, "customerName") },
        { label: "負責業務", value: s(p, "rsName") || "—" },
        { label: "車款", value: s(p, "vehicleModelName") || "—" },
        {
          label: "逾期天數",
          value: `申請後已 ${s(p, "daysOverdue")} 天尚未核准`,
        },
      ],
      actionLabel: "前往訂單追蹤",
      actionUrl: s(p, "actionUrl"),
      altText: `⏳ 貸款逾期 ${s(p, "daysOverdue")} 天：${s(p, "orderNo")} ${s(p, "customerName")}`,
    }),
};

export const financingPendingTimeoutGoogleChat: TemplateDefinition = {
  code: "financing-pending-timeout.google-chat.default",
  eventCode: "financing.pending_timeout",
  channelCode: "google-chat",
  format: "card",
  description: "貸款審核逾 7 天提醒業務員追蹤（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "⏳",
      title: "貸款審核逾期提醒",
      subtitle: `訂單 ${s(p, "orderNo")}`,
      fields: [
        { label: "訂單號", value: s(p, "orderNo") },
        { label: "客戶", value: s(p, "customerName") },
        { label: "負責業務", value: s(p, "rsName") || "—" },
        { label: "車款", value: s(p, "vehicleModelName") || "—" },
        {
          label: "逾期天數",
          value: `申請後已 ${s(p, "daysOverdue")} 天尚未核准`,
        },
      ],
      actionLabel: "前往訂單追蹤",
      actionUrl: s(p, "actionUrl"),
    }),
};
