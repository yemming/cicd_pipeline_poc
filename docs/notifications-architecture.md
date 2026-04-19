# Notification Hub — 架構

## 資料流（一張圖看懂）

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  業務模組（任何一處）                                                      │
│  ────────────────────                                                    │
│  POST /api/feedback/... → createTicket(fd) {                             │
│     const { id } = await supabase.insert(...);                           │
│                                                                          │
│     after(async () => {                         ◀── Next 16 非阻塞      │
│        notifications.dispatch({                                          │
│           code: 'feedback_ticket.created',                               │
│           payload: { ticketId: id, title, ... }                          │
│        })                                                                │
│     });                                                                  │
│                                                                          │
│     return redirect(`/feedback/tickets/${id}`);                          │
│  }                                                                       │
│                                                                          │
│                                  │                                       │
│                                  ▼                                       │
│                                                                          │
│  NotificationService.dispatch()                                          │
│  ──────────────────────────────                                          │
│                                                                          │
│   ┌──────────────────────────────────────────┐                          │
│   │ 1. resolver.ts                           │                          │
│   │    ┌─────────────────────────────────┐   │                          │
│   │    │ SELECT subscriptions            │   │  Supabase               │
│   │    │   JOIN targets                  │──────────→  service role    │
│   │    │   JOIN channels                 │   │  （繞過 RLS）            │
│   │    │ WHERE event_code = X            │   │                          │
│   │    │   AND is_active                 │   │                          │
│   │    └─────────────────────────────────┘   │                          │
│   │                                          │                          │
│   │ 2. filter_rules 比對（dealer_id match）   │                          │
│   │                                          │                          │
│   │ 3. getTemplate(event, channel, code?)    │                          │
│   │    DB 覆寫 > code registry fallback       │                          │
│   └──────────────────────────────────────────┘                          │
│                                  │                                       │
│              ┌───────────────────┼───────────────────┐                  │
│              ▼                   ▼                   ▼                  │
│        recipient[0]         recipient[1]        recipient[2]             │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────┐           │
│  │ Promise.allSettled — 三個 recipient 並行、互不影響          │           │
│  └──────────────────────────────────────────────────────────┘           │
│                                  │                                       │
│                                  ▼                                       │
│                                                                          │
│  sender.ts / sendToRecipient                                             │
│  ──────────────────────────                                              │
│                                                                          │
│   ┌───┬────────────────┬────────┬────────┬────────┬──────────────┐      │
│   │ 1 │ insert pending │  2     │  3     │  4     │ mark sent /  │      │
│   │   │ → deliveryId   │ render │ channel│ evaluate│ failed       │      │
│   │   │                │  tpl   │ .send()│ result │              │      │
│   └───┴────────────────┴────────┴────────┴────────┴──────────────┘      │
│                                                                          │
│                                  │                                       │
│              ┌───────────────────┼───────────────────┐                  │
│              ▼                   ▼                   ▼                  │
│                                                                          │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐   │
│  │ LineChannel      │    │ GoogleChatChannel│    │ (未來 Slack…)    │   │
│  │ @line/bot-sdk    │    │ 原生 fetch       │    │                  │   │
│  │ pushMessage      │    │ POST webhook URL │    │                  │   │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘   │
│           │                       │                                      │
│           ▼                       ▼                                      │
│      LINE Platform          Google Chat Space                            │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

## 重試策略

| HTTP 狀態 | 歸類 | 處理 |
|-----------|------|------|
| 2xx | 成功 | `status='sent'`, `attempts=1`, `sent_at=now()` |
| 429 (rate limit) | 可重試 | backoff [1s, 2s, 4s] 最多 3 次 |
| 5xx | 可重試 | 同上 |
| 4xx（非 429）| 不重試 | `status='failed'`, `last_error` 含完整 response body |
| Network timeout / TCP reset | 可重試 | 同 429 |

最終所有嘗試都失敗 → `status='failed'`，後台 UI 可手動點「重送」按鈕觸發 `retryDelivery()`。

## 為什麼不走 n8n？

規格書明確定調：**Next.js 原生、不經 n8n**。

| 維度 | Next.js 原生 | n8n |
|------|--------------|-----|
| 延遲 | `after()` 幾十 ms 直接打 | HTTP 出站 n8n + workflow 執行，~300-500ms |
| 部署 | 跟 DealerOS 一起部署，一份程式一份 repo | 獨立服務，獨立監控 |
| 錯誤處理 | `notification_deliveries` table 清楚 | n8n execution log 分散 |
| 模板管理 | `templates/*.ts` + DB override，git diff 可追 | n8n node 設定，audit 不便 |

n8n 的定位：給**非工程師用的 workflow 工具**（例如行銷做活動串接）。notification hub 是**基礎建設**，不該依賴一個需要維運的 n8n 實例。

## 未來擴充 checklist（v1.1+）

- [ ] Email / SMS channel
- [ ] 模板編輯器 UI（非工程師可改）
- [ ] 事件批次合併（同 5 分鐘內同類型合併為一則）
- [ ] 使用者層級訂閱（目前只到群組 / 個人層級）
- [ ] 接 n8n 反向整合（n8n workflow 也能呼叫 dispatch API）
- [ ] Supabase RLS 依 dealer_id row-level 隔離
- [ ] LINE 雙向對話（bot 回覆）

## 已知限制（v1.0）

- `filter_rules` 只支援 `dealer_id` 精準比對，更複雜條件（role、時段、payload key）未實作
- `attempts` 記錄以「最終結果」為準（成功=1、失敗=3），不精準記錄每次 retry 的時戳
- `sent_at` 只存最終成功時間，中間 retry 時戳未記錄
- 沒有 dead-letter queue — 重試 3 次全失敗就終止，只能靠後台手動重送
