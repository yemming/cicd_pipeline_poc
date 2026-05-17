import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_INFO } from "./kits";

// 事件：CSI 問卷派發（template → instance），客戶收到 LINE 卡片點連結進回填頁
// payload：template_id / template_code / template_name / template_kind / response_id / customer_id / response_url

export const surveyDispatchedLine: TemplateDefinition = {
  code: "survey-dispatched.line.default",
  eventCode: "survey.dispatched",
  channelCode: "line",
  format: "flex",
  description: "問卷派發（LINE Flex）— 請客戶點連結填寫",
  render: (p) =>
    buildLineFlex({
      emoji: "📋",
      title: "您有一份新問卷",
      subtitle: s(p, "template_name"),
      headerColor: TONE_INFO,
      fields: [
        { label: "問卷代碼", value: s(p, "template_code") },
        { label: "類型", value: s(p, "template_kind") === "aftersales" ? "售後回訪" : "銷售追蹤" },
      ],
      actionLabel: "立即填寫",
      actionUrl: s(p, "response_url"),
    }),
};

export const surveyDispatchedGoogleChat: TemplateDefinition = {
  code: "survey-dispatched.google-chat.default",
  eventCode: "survey.dispatched",
  channelCode: "google-chat",
  format: "card",
  description: "問卷派發（Google Chat Card v2）",
  render: (p) =>
    buildGoogleCard({
      emoji: "📋",
      title: "您有一份新問卷",
      subtitle: s(p, "template_name"),
      fields: [
        { label: "問卷代碼", value: s(p, "template_code") },
        { label: "類型", value: s(p, "template_kind") === "aftersales" ? "售後回訪" : "銷售追蹤" },
      ],
      actionLabel: "立即填寫",
      actionUrl: s(p, "response_url"),
    }),
};
