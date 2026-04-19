import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, DUCATI_RED, s } from "./kits";

// 事件：維修工單建立（service 模組）
// payload 建議欄位：
//   - orderNo：工單編號
//   - customer：客戶名
//   - vehicle：車號/車型
//   - actionUrl：點擊前往工單詳情
//   - dealerId（選）：用於 filter_rules

export const workOrderCreatedLine: TemplateDefinition = {
  code: "work-order-created.line.default",
  eventCode: "work_order.created",
  channelCode: "line",
  format: "flex",
  description: "維修工單建立（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "🔧",
      title: `新工單 ${s(p, "orderNo")}`,
      headerColor: DUCATI_RED,
      fields: [
        { label: "客戶", value: s(p, "customer") },
        { label: "機車", value: s(p, "vehicle") },
        { label: "建立時間", value: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) },
      ],
      actionLabel: "查看工單",
      actionUrl: s(p, "actionUrl"),
    }),
};

export const workOrderCreatedGoogleChat: TemplateDefinition = {
  code: "work-order-created.google-chat.default",
  eventCode: "work_order.created",
  channelCode: "google-chat",
  format: "card",
  description: "維修工單建立（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "🔧",
      title: `新工單 ${s(p, "orderNo")}`,
      fields: [
        { label: "客戶", value: s(p, "customer") },
        { label: "機車", value: s(p, "vehicle") },
        { label: "建立時間", value: new Date().toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) },
      ],
      actionLabel: "查看工單",
      actionUrl: s(p, "actionUrl"),
    }),
};
