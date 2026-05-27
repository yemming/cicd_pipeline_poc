import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_SUCCESS } from "./kits";

// 事件：整車到港確認完成（RS_INV02）— PDI 工單已批次建立，通知售後主管分派技師
// payload：arrivalNo / confirmedCount / damagedCount / pdiCount / actionUrl

export const vehicleArrivalConfirmedLine: TemplateDefinition = {
  code: "vehicle-arrival-confirmed.line.default",
  eventCode: "vehicle_arrival.confirmed",
  channelCode: "line",
  format: "flex",
  description: "整車到港確認完成（LINE Flex）",
  render: (p) =>
    buildLineFlex({
      emoji: "🚢",
      title: `新車到港 · ${s(p, "confirmedCount")} 台待 PDI`,
      subtitle: "PDI 工單已建立，請分派技師",
      headerColor: TONE_SUCCESS,
      fields: [
        { label: "到港批次", value: s(p, "arrivalNo") },
        { label: "已確認", value: `${s(p, "confirmedCount")} 台` },
        { label: "PDI 工單", value: `${s(p, "pdiCount")} 筆` },
        { label: "損傷車輛", value: `${s(p, "damagedCount")} 台` },
      ],
      actionLabel: "查看到港批次",
      actionUrl: s(p, "actionUrl"),
    }),
};

export const vehicleArrivalConfirmedGoogleChat: TemplateDefinition = {
  code: "vehicle-arrival-confirmed.google-chat.default",
  eventCode: "vehicle_arrival.confirmed",
  channelCode: "google-chat",
  format: "card",
  description: "整車到港確認完成（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "🚢",
      title: `新車到港 · ${s(p, "confirmedCount")} 台待 PDI`,
      subtitle: "PDI 工單已建立，請分派技師",
      fields: [
        { label: "到港批次", value: s(p, "arrivalNo") },
        { label: "已確認", value: `${s(p, "confirmedCount")} 台` },
        { label: "PDI 工單", value: `${s(p, "pdiCount")} 筆` },
        { label: "損傷車輛", value: `${s(p, "damagedCount")} 台` },
      ],
      actionLabel: "查看到港批次",
      actionUrl: s(p, "actionUrl"),
    }),
};
