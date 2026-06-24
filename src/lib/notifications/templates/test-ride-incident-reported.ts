import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, DUCATI_RED } from "./kits";

// 事件：試乘事故登記（test_ride_incident.reported）
// payload：testDriveId / vehicleModel / customerName / description / location / reportedAt / actionUrl / brandId

export const testRideIncidentReportedLine: TemplateDefinition = {
  code: "test-ride-incident-reported.line.default",
  eventCode: "test_ride_incident.reported",
  channelCode: "line",
  format: "flex",
  description: "試乘事故登記（LINE Flex）— 通知店長立即處理",
  render: (p) =>
    buildLineFlex({
      emoji: "🚨",
      title: "試乘事故警報",
      subtitle: `車款：${s(p, "vehicleModel")}`,
      headerColor: DUCATI_RED,
      fields: [
        { label: "客戶", value: s(p, "customerName") },
        { label: "事故描述", value: s(p, "description") },
        { label: "地點", value: s(p, "location") || "（未填）" },
        { label: "回報時間", value: s(p, "reportedAt") },
      ],
      actionLabel: "查看試駕記錄",
      actionUrl: s(p, "actionUrl"),
    }),
};

export const testRideIncidentReportedGoogleChat: TemplateDefinition = {
  code: "test-ride-incident-reported.google-chat.default",
  eventCode: "test_ride_incident.reported",
  channelCode: "google-chat",
  format: "card",
  description: "試乘事故登記（Google Chat Card v2）— 通知店長立即處理",
  render: (p) =>
    buildGoogleCard({
      emoji: "🚨",
      title: "試乘事故警報",
      subtitle: `車款：${s(p, "vehicleModel")}`,
      fields: [
        { label: "客戶", value: s(p, "customerName") },
        { label: "事故描述", value: s(p, "description") },
        { label: "地點", value: s(p, "location") || "（未填）" },
        { label: "回報時間", value: s(p, "reportedAt") },
      ],
      actionLabel: "查看試駕記錄",
      actionUrl: s(p, "actionUrl"),
    }),
};
