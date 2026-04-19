# Notification Hub

DealerOS 的統一 IM 通知基礎建設（LINE + Google Chat）。業務模組只要呼叫一行 `notifications.dispatch(event)`，剩下的訂閱解析、模板渲染、並行發送、重試、送達記錄全自動。

規格書：[Notion — DealerOS Notification Hub IM v1.0](https://www.notion.so/yemming/DealerOS-Notification-Hub-IM-v1-0-34766adeb1d381c88815ce551c8cc7fe)
架構文件：[`docs/notifications-architecture.md`](../../../docs/notifications-architecture.md)

## 10 分鐘 quickstart — 如何接一個新事件

### 1. 在 `types.ts` 的 `EventCode` 加一個新字串

```ts
export type EventCode =
  | "work_order.created"
  | ...
  | "my_new.event";       // ← 加這行
```

### 2. 在 `templates/` 加一個檔，export LINE 與 Google Chat 兩個 `TemplateDefinition`

```ts
// templates/my-new-event.ts
import type { TemplateDefinition } from "../types";
import { buildLineFlex, buildGoogleCard, DUCATI_RED, s } from "./kits";

export const myNewEventLine: TemplateDefinition = {
  code: "my-new-event.line.default",
  eventCode: "my_new.event",
  channelCode: "line",
  format: "flex",
  render: (p) => buildLineFlex({
    emoji: "🚀",
    title: `Hello ${s(p, "name")}`,
    headerColor: DUCATI_RED,
    fields: [{ label: "時間", value: s(p, "at") }],
    actionLabel: "查看",
    actionUrl: s(p, "url"),
  }),
};

export const myNewEventGoogleChat: TemplateDefinition = { /* 同上 */ };
```

### 3. 在 `templates/registry.ts` 的 `CODE_TEMPLATES` 陣列 register

```ts
import { myNewEventLine, myNewEventGoogleChat } from "./my-new-event";
const CODE_TEMPLATES: TemplateDefinition[] = [
  ...
  myNewEventLine,
  myNewEventGoogleChat,
];
```

### 4. 在業務模組裡 dispatch

```ts
import { after } from "next/server";
import { notifications } from "@/lib/notifications";

export async function POST(req: Request) {
  // ... 主流程 ...

  after(async () => {
    await notifications.dispatch({
      code: "my_new.event",
      payload: { name: "Yemming", at: new Date().toISOString(), url: "..." },
    });
  });

  return Response.json(result);
}
```

### 5. 在後台建訂閱

進 `/admin/notifications/subscriptions` → **新增訂閱** → 選 `my_new.event` + target → 儲存。

下一次事件即生效，**不需要 deploy**。

## 核心檔案

| 檔案 | 職責 |
|------|------|
| `types.ts`              | 對外型別：EventCode / ChannelCode / NotificationEvent / TemplateDefinition |
| `errors.ts`             | 自訂錯誤類 |
| `env.ts`                | zod schema + `getNotificationEnv()` lazy cache |
| `admin.ts`              | `getCurrentUserAndNotificationAdmin()` + `requireNotificationAdmin()` |
| `http.ts`               | API route 守衛 + body 驗證 helper |
| `actions.ts`            | Server actions（後台 UI 呼叫） |
| `service.ts`            | `NotificationService` — dispatch / sendDirect / retryDelivery |
| `channels/*.channel.ts` | LINE / Google Chat channel + retry base class |
| `templates/*`           | 12 個內建模板 + DB override registry |
| `repositories/*`        | Supabase 存取層（pure async functions） |
| `dispatch/*`            | resolver + sender（service.ts 的 building blocks） |

## 關鍵設計

1. **`after()` 非阻塞**：業務流程回應不受通知耗時影響
2. **Promise.allSettled**：任一通路失敗不影響其他
3. **DB 模板 > code 模板**：可 hot-swap 訊息格式，不需 deploy
4. **service role client**：dispatch 屬 server 內部操作，繞 RLS，不受使用者權限限制
5. **Admin 守衛兩層**：
   - UI 層：`getCurrentUserAndNotificationAdmin()` 擋畫面
   - Server action / API 層：`requireNotificationAdmin()` 擋操作
6. **Dev bypass**：`NOTIFICATION_DEV_BYPASS_TOKEN` 讓 curl / CI 可直接呼叫 API（production 自動停用）

## 環境變數

```bash
# LINE（必填）
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...

# Google Chat（選填，未設定時該通路送出會 fail）
GOOGLE_CHAT_WEBHOOK_URL=...   # ← 實際上存在 notification_targets.target_ref

# Admin allowlist（fallback 吃 FEEDBACK_ADMIN_EMAILS）
NOTIFICATION_ADMIN_EMAILS=you@example.com,another@example.com

# Dispatch 參數
NOTIFICATION_DISPATCH_TIMEOUT_MS=10000
NOTIFICATION_MAX_RETRY=3
NOTIFICATION_DEBUG=true

# 只在 dev 有效
NOTIFICATION_DEV_BYPASS_TOKEN=phase3-local-verify

# 跳轉連結 base URL
APP_URL=https://your-dealeros.example.com
```

## 後台入口

登入後進 [`/admin/notifications`](/admin/notifications)（需在 NOTIFICATION_ADMIN_EMAILS allowlist 內）。

## 相關規格對齊

- `../../../docs/notifications-schema.sql` 是目前 Supabase 上的 schema snapshot
- 所有 migration 透過 Supabase MCP (`mcp__plugin_supabase_supabase__apply_migration`) 發送，不走 `supabase/migrations/` 目錄
- Migration names：`notification_hub_v1_schema`、`notification_hub_v1_rls_policies`
