import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s } from "./kits";

const TONE_DANGER = "#CC0000";

// 事件：inventory.release_failed — 取消訂單後車輛庫存回滾寫入失敗，通知主管人工處理
// payload: orderId / orderNo / vehicleType / vehicleId / errorMessage / actionUrl / brandId

export const inventoryReleaseFailedLine: TemplateDefinition = {
  code: "inventory-release-failed.line.default",
  eventCode: "inventory.release_failed",
  channelCode: "line",
  format: "flex",
  description: "取消訂單後車輛庫存回滾失敗，通知主管（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "🚨",
      title: "車輛庫存回滾失敗",
      subtitle: `訂單 ${s(p, "orderNo")}`,
      headerColor: TONE_DANGER,
      fields: [
        { label: "訂單號", value: s(p, "orderNo") },
        { label: "車輛類型", value: s(p, "vehicleType") },
        { label: "車輛ID", value: s(p, "vehicleId") },
        { label: "錯誤訊息", value: s(p, "errorMessage") || "—" },
      ],
      actionLabel: "前往訂單處理",
      actionUrl: s(p, "actionUrl"),
      altText: `🚨 庫存回滾失敗：訂單 ${s(p, "orderNo")} 需人工釋放車輛`,
    }),
};

export const inventoryReleaseFailedGoogleChat: TemplateDefinition = {
  code: "inventory-release-failed.google-chat.default",
  eventCode: "inventory.release_failed",
  channelCode: "google-chat",
  format: "card",
  description: "取消訂單後車輛庫存回滾失敗，通知主管（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "🚨",
      title: "車輛庫存回滾失敗",
      subtitle: `訂單 ${s(p, "orderNo")}`,
      fields: [
        { label: "訂單號", value: s(p, "orderNo") },
        { label: "車輛類型", value: s(p, "vehicleType") },
        { label: "車輛ID", value: s(p, "vehicleId") },
        { label: "錯誤訊息", value: s(p, "errorMessage") || "—" },
      ],
      actionLabel: "前往訂單處理",
      actionUrl: s(p, "actionUrl"),
    }),
};
