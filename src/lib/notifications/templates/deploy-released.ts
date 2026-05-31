import type { TemplateDefinition } from "../types";
import { buildGoogleCard, buildLineFlex, s, TONE_SUCCESS } from "./kits";

// 事件：Zeabur 部署成功後，推「本輪更新摘要」到開發群組（CI/CD pipeline 的出口訊號）
// payload：
//   version    版本/commit 短碼（例 "811edb5"）
//   summary    本輪更新摘要（多行；每行一項，由 git log 組）
//   changeCount 更新項目數（字串）
//   deployedAt 上版時間（已格式化字串，Asia/Taipei）
//   url        正式站連結（部署後 URL）

export const deployReleasedLine: TemplateDefinition = {
  code: "deploy-released.line.default",
  eventCode: "deploy.released",
  channelCode: "line",
  format: "flex",
  description: "Zeabur 部署成功（LINE Flex）— 通知老闆與開發團隊已上版",
  render: (p) =>
    buildLineFlex({
      emoji: "🚀",
      title: "已上版",
      subtitle: `本輪 ${s(p, "changeCount", "—")} 項更新 · ${s(p, "version")}`,
      headerColor: TONE_SUCCESS,
      fields: [
        { label: "更新摘要", value: s(p, "summary", "（無摘要）") },
        { label: "上版時間", value: s(p, "deployedAt") },
        { label: "版本", value: s(p, "version") },
      ],
      actionLabel: "前往查看",
      actionUrl: s(p, "url"),
    }),
};

export const deployReleasedGoogleChat: TemplateDefinition = {
  code: "deploy-released.google-chat.default",
  eventCode: "deploy.released",
  channelCode: "google-chat",
  format: "card",
  description: "Zeabur 部署成功（Google Chat Card v2）— 通知已上版",
  render: (p) =>
    buildGoogleCard({
      emoji: "🚀",
      title: "已上版",
      subtitle: `本輪 ${s(p, "changeCount", "—")} 項更新 · ${s(p, "version")}`,
      fields: [
        { label: "更新摘要", value: s(p, "summary", "（無摘要）") },
        { label: "上版時間", value: s(p, "deployedAt") },
        { label: "版本", value: s(p, "version") },
      ],
      actionLabel: "前往查看",
      actionUrl: s(p, "url"),
    }),
};
