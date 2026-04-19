import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_SUCCESS } from "./kits";

// 事件：機車 PDI（Pre-Delivery Inspection）完成
// payload：vehicleVin / model / customer / technician / actionUrl

export const vehiclePdiCompletedLine: TemplateDefinition = {
  code: "vehicle-pdi-completed.line.default",
  eventCode: "vehicle.pdi_completed",
  channelCode: "line",
  format: "flex",
  description: "PDI 完成（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "✅",
      title: `PDI 完成 · ${s(p, "model")}`,
      subtitle: "可安排交車時段",
      headerColor: TONE_SUCCESS,
      fields: [
        { label: "VIN", value: s(p, "vehicleVin") },
        { label: "客戶", value: s(p, "customer") },
        { label: "檢修人員", value: s(p, "technician") },
      ],
      actionLabel: "前往交車排程",
      actionUrl: s(p, "actionUrl"),
    }),
};

export const vehiclePdiCompletedGoogleChat: TemplateDefinition = {
  code: "vehicle-pdi-completed.google-chat.default",
  eventCode: "vehicle.pdi_completed",
  channelCode: "google-chat",
  format: "card",
  description: "PDI 完成（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "✅",
      title: `PDI 完成 · ${s(p, "model")}`,
      subtitle: "可安排交車時段",
      fields: [
        { label: "VIN", value: s(p, "vehicleVin") },
        { label: "客戶", value: s(p, "customer") },
        { label: "檢修人員", value: s(p, "technician") },
      ],
      actionLabel: "前往交車排程",
      actionUrl: s(p, "actionUrl"),
    }),
};
