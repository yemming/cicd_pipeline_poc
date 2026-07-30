// 顯示用純函式 — 把技術性欄位翻成人話，不碰任何資料存取。

export function channelLabel(code: string): string {
  if (code === "line") return "LINE";
  if (code === "google-chat") return "Google Chat";
  return code;
}

export function targetTypeLabel(channelCode: string, targetType: string): string {
  if (channelCode === "google-chat") return "Google Chat";
  if (targetType === "group") return "LINE 群組";
  if (targetType === "user") return "LINE 個人";
  if (targetType === "webhook") return "Webhook";
  return `${channelLabel(channelCode)}（${targetType}）`;
}

/** target_ref 截斷顯示；客戶要求不在畫面上露出完整技術值，需要時 hover title 看完整值 */
export function truncateRef(ref: string, len = 6): string {
  if (!ref) return "";
  return ref.length <= len ? ref : `${ref.slice(0, len)}…`;
}
