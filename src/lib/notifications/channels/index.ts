export * from "./base.channel";
export { LineChannel } from "./line.channel";
export { GoogleChatChannel } from "./google-chat.channel";

import type { ChannelCode, NotificationChannel } from "../types";
import { LineChannel } from "./line.channel";
import { GoogleChatChannel } from "./google-chat.channel";

// Channel singleton registry：整個 app 共用一組 channel 實例（省去重複建 HTTP client 成本）
const channels: Record<ChannelCode, NotificationChannel> = {
  line: new LineChannel(),
  "google-chat": new GoogleChatChannel(),
};

export function getChannel(code: ChannelCode): NotificationChannel {
  const ch = channels[code];
  if (!ch) throw new Error(`未註冊的通路：${code}`);
  return ch;
}

export function listChannels(): NotificationChannel[] {
  return Object.values(channels);
}
