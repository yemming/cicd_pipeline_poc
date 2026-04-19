#!/usr/bin/env node
// Phase 0 一次性用途：驗證 LINE Channel Access Token 可以推一則訊息到指定 groupId / userId
//
// 用法（Node 20.6+ 原生支援 --env-file，不需 dotenv）：
//   node --env-file=.env.local scripts/probe-line.mjs <groupId|userId>
//
// 範例：
//   node --env-file=.env.local scripts/probe-line.mjs Cabc123def456...
//
// 預期結果：
//   - 你的 LINE 群組收到一則帶標題與按鈕的 Flex 訊息「✅ DealerOS 連線測試」
//   - Terminal 印出 HTTP 200 + LINE 回應
//
// 此 script 刻意不依賴 @line/bot-sdk，只用原生 fetch，方便 Phase 0 未裝套件前先跑通。

const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
if (!token) {
  console.error("❌ 環境變數 LINE_CHANNEL_ACCESS_TOKEN 未設定");
  console.error("   請確認：node --env-file=.env.local scripts/probe-line.mjs <id>");
  process.exit(1);
}

const target = process.argv[2];
if (!target) {
  console.error("❌ 請提供 groupId 或 userId 作為第一個 argv");
  console.error("   範例：node --env-file=.env.local scripts/probe-line.mjs Cabc123...");
  process.exit(1);
}

const body = {
  to: target,
  messages: [
    {
      type: "flex",
      altText: "✅ DealerOS 連線測試",
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "text",
              text: "✅ DealerOS",
              color: "#FFFFFF",
              weight: "bold",
              size: "sm",
            },
            {
              type: "text",
              text: "Notification Hub 連線測試",
              color: "#FFFFFF",
              weight: "bold",
              size: "lg",
              wrap: true,
            },
          ],
          backgroundColor: "#CC0000",
          paddingAll: "lg",
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            {
              type: "text",
              text: "LINE Channel 已成功連通。",
              size: "sm",
              wrap: true,
            },
            {
              type: "box",
              layout: "baseline",
              contents: [
                { type: "text", text: "發送時間", size: "xs", color: "#888888", flex: 2 },
                { type: "text", text: new Date().toISOString(), size: "xs", flex: 5, wrap: true },
              ],
            },
            {
              type: "box",
              layout: "baseline",
              contents: [
                { type: "text", text: "目標 ID", size: "xs", color: "#888888", flex: 2 },
                { type: "text", text: target, size: "xs", flex: 5, wrap: true },
              ],
            },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#CC0000",
              action: {
                type: "uri",
                label: "前往 DealerOS",
                uri: "https://github.com/yemming/cicd-pipeline-poc",
              },
            },
          ],
        },
      },
    },
  ],
};

const res = await fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(body),
});

const text = await res.text();
console.log("HTTP %d", res.status);
console.log("LINE response:", text || "(empty)");

if (res.ok) {
  console.log("✅ 送出成功 — 請到 LINE 目標確認收到訊息");
  process.exit(0);
} else {
  console.error("❌ 送出失敗");
  if (res.status === 401) {
    console.error("   401 → token 錯誤或過期");
  } else if (res.status === 400) {
    console.error("   400 → 通常是 groupId/userId 格式錯誤，或 Bot 尚未加入該群組");
  } else if (res.status === 429) {
    console.error("   429 → 被 LINE rate limit，稍等再試");
  }
  process.exit(2);
}
