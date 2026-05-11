# 提案：售後 — 11 取車通知設定（Pickup Notification Settings）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/11_取車通知設定.html`
> 日期：2026-05-11
> 階段：Phase 1 結構分析（待 Phase 2 架構提案 / Phase 3 拍板）
>
> 姊妹分析：
> - `feature-aftersales-overview-phase1.md`（00_導覽總覽）
> - `feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）
> - `feature-aftersales-final-check-phase1.md` — **dispatch 源頭主場**（06 竣工複檢的 Step 5 按下「發 Line / 簡訊 / 電話」就打到本頁定義的 channel 偏好與模板）
> - `feature-aftersales-customers-vehicles-phase1.md`（09 人車檔案，提供 LINE userId / 手機 / 偏好通道 — target 解析的源頭）
> - `feature-aftersales-management-phase1.md`（07 售後管理；本頁屬其「設定 / 通知」群組）
>
> **本頁的位置**：售後 pipeline 的 _配套設定頁_，不是流程內單據。功能是：
> 1. 維護「取車通知」的 Line / 簡訊 / 電話三種 channel 模板字串（含 placeholder `{車主姓名}` / `{車型}` / `{車牌}`）
> 2. 設定 SA 預設勾選哪幾個 channel
> 3. 顯示「待發送清單」（竣工複檢已通過、SA 還沒按發送的 RO）+ 一鍵 dispatch
> 4. 顯示「今日通知統計」（已發 / 待發 / 平均等候）
>
> **核心定位**：HTML 上方 banner 一句話總結 — 「SA 手動確認後才會發送通知，系統不會自動推播。確認按鈕設計為『緩衝機制』，讓 SA 在車輛準備妥當後再通知車主。」這個 _half-manual / SA-gated_ 是本頁設計核心，跟一般 event-driven 自動推播架構不一樣。

---

## 0. TL;DR — 跟既有 Notification Hub 的整合方式（用戶特別要求釐清）

### 結論

**不新建 `pickup_notification_settings` 表。整合採「Hub 既有四表 + 一個薄薄的 settings view（不是表）」：**

| 訴求 | 落腳 |
|---|---|
| 通知模板字串（Line 範本 / 簡訊範本） | `notification_templates`（既有表） |
| SA 預設勾哪些 channel | **`business_rules` 一筆** `rule_kind='pickup_notification_default_channels'`、`config: { channels: ['line', 'sms', 'call'] }` |
| 待發送清單（竣工複檢過、SA 未發） | **不存表**，是個 view / query：`SELECT FROM final_inspections WHERE status='signed' AND notify_methods_used = '{}'::jsonb` |
| 今日統計（已發、待發、平均等候） | **不存表**，是個 aggregate query 在 `notification_deliveries` + `final_inspections` 上跑 |
| dispatch 動作 | `notifications.dispatch({ code: 'vehicle.pickup_ready', payload: ... })` — 既有 hub |

→ **本頁不新建任何業務表**。新建：
1. 一個 `EventCode`：`vehicle.pickup_ready`（Notification Hub `types.ts`）
2. 兩個 template definition：`pickup-ready.line.default` / `pickup-ready.sms.default`（`templates/`）
3. 一個 `rule_kind`：`pickup_notification_default_channels`（`business_rules` 既有表）
4. SMS channel：**Hub 目前沒有 sms channel**（types.ts 只有 `'line' | 'google-chat'`）— 屬 [需確認] Q1，要決定 SMS 走 hub 還是另開新通路 facade
5. Call「通知方式」：純人工記錄、不真發、寫進 `final_inspections.notify_methods_used jsonb`

### 為什麼不新建 `pickup_notification_settings` 表

1. **設定內容本身少得可憐**：Line 模板字串、簡訊模板字串、預設勾選 channel — 三項。為三項設定開一張 8 欄業務表 = over-engineering。
2. **Notification Hub 設計初衷就是這個**：`notification_templates` 表本來就支援「DB 覆寫 code-registered 預設模板」，模板 hot-swap 不用 deploy（README §關鍵設計 #3）。把取車通知模板存在這已經是 SSOT。
3. **「預設 channel 勾選」是 boolean 開關**：但**不是 RBAC**（不是「角色能不能發」、是「預設勾不勾」），故走 `business_rules` 而非 `permissions`，依 SKILL 紀律的「判斷三步」走第三條（workflow / 流程描述）。
4. **「待發送清單」是 derived state**：它是 `final_inspections WHERE notify_methods_used 為空` 的查詢結果、不是獨立 entity。獨立成表會產生「FI 已通知但 settings 表還顯示待發送」的雙寫一致性問題。
5. **跟 06 final-check 的職責切分**：FI 那邊負責「按下按鈕、記錄已發、dispatch」，本頁負責「維護模板、看待辦看板、看統計」。資料源都在 FI / hub deliveries，本頁只是 _view_。

### 跟 06 final-check 的接點（責任邊界）

| 動作 | 06 final-check | 11 pickup-notify settings |
|---|---|---|
| 維護 Line / SMS 模板字串 | ❌ | ✅（CRUD `notification_templates`） |
| 設定預設勾選 channel | ❌ | ✅（CRUD `business_rules`） |
| FI 簽核 → 跳到 step 5 通知 UI | ✅ | ❌（流程內、屬 FI wizard） |
| 點「發送 Line」按鈕、實際 dispatch | ✅（FI 內的按鈕；helper 是 `sendPickupNotification`） | ✅（看板上同樣按鈕、helper 同一個） |
| 記錄哪些 channel 發了（notify_methods_used） | ✅ | ❌（只讀） |
| 統計「平均等候時間」（FI signed → 通知 sent） | ❌ | ✅（aggregate query） |
| 定時提醒（24 hr 沒取車自動再推） | ❌ | ✅（[需確認] Q6） |

→ **同一個 helper `sendPickupNotification(fi_id, channels[])` 雙頁共用**，住在 `src/domain/pickup-notifications.ts`（不住 final-inspections.ts，因 11 的看板要 import、避免循環依賴）。

---

## 1. 結構摘要（entities / actions / kpis / implied_pages）

### entities

```yaml
- PickupNotificationTemplate（取車通知模板，不另開表、reuse notification_templates）
  table: notification_templates
  rows:
    - code='pickup-ready.line.default'  format='flex' or 'text'  event_code='vehicle.pickup_ready'  channel_code='line'
      body: { template_string: '親愛的 {車主姓名}...' } or 結構化 flex bubble
    - code='pickup-ready.sms.default'   format='text'           event_code='vehicle.pickup_ready'  channel_code='sms'(*)
      body: { template_string: '{車主姓名} 您好...' }
  (*) sms channel 是否要新增到 ChannelCode 屬 [需確認] Q1

- PickupNotificationDefaultChannels（預設勾選 channel，reuse business_rules）
  table: business_rules
  rows:
    - rule_kind='pickup_notification_default_channels'
      scope_subsidiary_id=null（全集團）OR 指定（按店設定）
      config: { channels: ['line'], require_one: true }  # 至少要勾一個
      is_active=true

- PendingPickupNotification（待發送清單，derived view、不存表）
  query: |
    SELECT fi.id, fi.fi_code, ro.ro_code, c.name, v.model, v.plate, fi.signed_at, fi.notify_methods_used
    FROM final_inspections fi
    JOIN repair_orders ro ON ro.id = fi.repair_order_id
    JOIN customers c ON c.id = ro.customer_id
    JOIN vehicles v ON v.id = ro.vehicle_id
    WHERE fi.status IN ('signed', 'completed')
      AND coalesce(jsonb_typeof(fi.notify_methods_used), 'object') = 'object'
      AND fi.notify_methods_used = '{}'::jsonb
    ORDER BY fi.signed_at DESC

- PickupNotificationDeliveryLog（送達記錄，reuse notification_deliveries）
  table: notification_deliveries
  query 維度：event_code='vehicle.pickup_ready' 的 deliveries 即為本頁範疇

  relationships:
    - { to: final_inspections,        kind: 'reads, no fk' }      # 待發送清單來源
    - { to: notification_templates,   kind: 'crud, reuse' }
    - { to: business_rules,           kind: 'crud, reuse' }
    - { to: notification_deliveries,  kind: 'reads, aggregate' }  # 統計
    - { to: customers / vehicles,     kind: 'transitive via fi/ro' }  # 顯示車主資訊
```

### actions

```yaml
# 模板 CRUD（後台設定區）
- listPickupTemplates()                                      # 列出 line / sms 模板
- updatePickupTemplate(channel_code, template_body)          # 修改模板字串（hot-swap）
- previewPickupTemplate(channel_code, sample_payload)        # render 預覽（用 dummy 車主資料）

# 預設 channel 設定
- getDefaultChannels(scope?)                                 # 讀 business_rules
- updateDefaultChannels(scope, channels[])                   # 寫 business_rules

# 待發送看板（讀）
- listPendingPickupNotifications(filter?: { brand_id, store_id, date_range })
- getPickupNotificationStats(filter?)                        # { sent_today, pending, avg_wait_minutes }

# 發送動作（雙頁共用 helper、住 src/domain/pickup-notifications.ts）
- sendPickupNotification(fi_id, channels: ('line'|'sms'|'call')[])
  signature: '({ fi_id, channels }) => Promise<{ ok, deliveries?: {channel, delivery_id}[], error? }>'
  internals:
    1. 撈 fi + ro + customer + vehicle、組 payload
    2. for each channel in channels:
       - if 'call'：純 UPDATE fi.notify_methods_used.call = { recorded_at, recorded_by }、不 dispatch
       - else: notifications.dispatch({ code: 'vehicle.pickup_ready', payload, channelHint: channel })
              並把 delivery_id 寫進 fi.notify_methods_used[channel].delivery_id
    3. 全部成功 → 回 ok；任一失敗 → fi.notify_methods_used 部分寫入、回 ok + warnings

# 後續提醒（[需確認] Q6 拍板後）
- listOverduePickupReminders(threshold_hours=24)             # 通知過 24hr 但 RO 還沒 closed_at 的車主
- sendPickupReminder(fi_id, channels)                        # 再推一次（同樣走 hub、但模板 code 換成 pickup-reminder.line.default）

  suspected_side_effects:
    - updatePickupTemplate 是 hot-swap、無 deploy、立即生效（hub 設計初衷）
    - sendPickupNotification 寫 fi.notify_methods_used (jsonb merge)、寫 notification_deliveries（每 channel 一筆）
    - sendPickupNotification 動 fi.notify_methods_used 不改 fi.status（FI 在 signed → completed 的轉換由 06 final-check 自己負責）
    - 「call」channel 沒外撥、純人工記錄；UI 應顯示「請手動撥電話、按下確認以記錄已通知」二步驟
```

### kpis

```yaml
- 今日已發送通知數
  source: count(notification_deliveries WHERE event_code='vehicle.pickup_ready' AND status='sent' AND created_at::date = today)
        # 對 demo「今日通知統計 - 已發送通知 5 筆」

- 今日待發送
  source: |
    count(*) FROM final_inspections fi
    WHERE fi.status IN ('signed','completed')
      AND fi.notify_methods_used = '{}'::jsonb
      AND fi.signed_at::date = today
        # 對 demo「待發送 3 筆」

- 平均等候時間（FI signed → 客戶取車）
  source: |
    avg(
      coalesce(ro.closed_at, now())
      - coalesce((fi.notify_methods_used->'line'->>'sent_at')::timestamptz, fi.signed_at)
    )
    FROM final_inspections fi JOIN repair_orders ro ...
    WHERE fi.completed_at::date = today
        # 對 demo「平均等候時間 48 分鐘」
        # ⚠️ demo 沒明確定義「等候」是什麼，本提案推測為「通知發出 → 客戶到店取車（ro.closed_at）」

- 通知 → 取車 SLA
  source: 同上、按週期 group by

- 哪個 channel 比較有效
  source: |
    送達後 N 小時內客戶到店的比例（按 channel 拆）
    需要 ro.closed_at - notification.sent_at 統計
        # KPI 用、不是當下顯示
```

### implied_pages

```yaml
- kind: 'setting / dashboard hybrid'                  # 本頁本身（11 取車通知設定）
  route: '/parts/setup/pickup-notifications'   或   '/parts/aftersales/pickup-notifications'
  comment: |
    - 左欄「待發送清單」（其實是 mini dashboard）
    - 右欄「通知範本設定 + 今日統計」
    - 屬於「設定 + 看板混合」、不是純 list/detail
    - 不適用 items-board.tsx 範本；自製 2-column layout
    - HTML 已示範完整版面、可逐 1:1 還原

- kind: 'edit dialog / form'                          # 模板編輯彈窗
  route: same page, modal
  comment: |
    - 點「Line 通知範本 textarea」直接編輯
    - 點「儲存範本」按鈕觸發 updatePickupTemplate
    - 模板 placeholder 提示：{車主姓名} / {車型} / {車牌} / {ro_code} / {fi_code}（建議擴增）
```

---

## 2. Settings vs Notification Hub — 整合架構決策（完整推演）

> 用戶特別要求釐清這條。三方案逐項比較。

### 2.1 方案 A：新建 `pickup_notification_settings` 表（拒絕）

**做法**：
```sql
CREATE TABLE pickup_notification_settings (
  id uuid PRIMARY KEY,
  brand_id text,
  subsidiary_id uuid,
  store_id uuid,
  line_template text,
  sms_template text,
  default_channels text[],
  enable_reminder boolean,
  reminder_hours int,
  metadata jsonb,
  created_at, updated_at
);
```

**問題**：
1. **Duplicate hub 職責**：`line_template` / `sms_template` 內容、形狀、版本管理跟 `notification_templates` 100% 重疊；得選一個 SSOT，否則「我在後台改了模板、為什麼推出去還是舊版」就會發生
2. **Demo 上的設定就 3 個欄位**：line 模板、sms 模板、預設勾選。為 3 欄位開表 = 過度設計、未來 metadata 還是要丟 jsonb
3. **「per-store 還是 global」是個未來才會問的問題**：開大表先預留 subsidiary_id / store_id 是 future-proof，違反 SKILL 反例（「不為了 future-proof 全部 typed」）；單一 brand_id 一筆 row 就夠，要加 scope 再 alter
4. **跟 hub `notification_deliveries` 失聯**：自開的 sent 記錄 vs hub 自帶的 deliveries 表會是兩份歷史紀錄、查單對不上、debug 噩夢

**Verdict**：❌ 拒絕。

### 2.2 方案 B：完全靠 Notification Hub（推薦）

**做法**：
- 模板存 `notification_templates`（既有）
- 預設 channel 存 `business_rules` `rule_kind='pickup_notification_default_channels'`（既有）
- 待發送清單 = `final_inspections` 的 query（無新表）
- 統計 = `notification_deliveries` + `final_inspections` 的 aggregate query（無新表）

**優點**：
- ✅ 零新表、零新業務表 schema 維護成本
- ✅ 模板 hot-swap 本來就是 hub 強項
- ✅ 跟既有 LINE / Google Chat / 未來 SMS 完全一致的 dispatch 路徑
- ✅ deliveries 表既是 audit trail 也是 KPI 來源（單一事實）
- ✅ 後台 `/admin/notifications/templates` 已有 UI，只是本頁要做一個「售後 SA 用的 friendlier UI」

**缺點**：
- SMS channel 尚未實作（hub 目前只有 line / google-chat）— [需確認] Q1
- Hub 目前沒「per-store 預設 channel」概念，要 `business_rules.scope_subsidiary_id` 撐起 scope；多 brand 多 subsidiary 多 store 三層 scope resolution 邏輯要寫
- `notification_templates.body` 是 `jsonb`、demo 的 textarea 模板字串只是純 text；要決定 textarea 內容塞進 body 哪個 key（建議 `body.template_string`）

**Verdict**：✅ 推薦。

### 2.3 方案 C：薄薄一張 `pickup_notification_settings` 表只存「business 層 metadata」（折衷）

**做法**：
- 模板還是放 hub `notification_templates`
- 但開一張 `pickup_notification_settings` 只存「跟 hub 無關的業務邏輯設定」：是否啟用 24hr 提醒、提醒間隔、提醒次數上限、緩衝期分鐘數、是否允許跳過某些 channel

**評估**：當「業務邏輯設定」累積到 5 個以上、且形狀穩定時，方案 C 比方案 B 好。但 **demo 目前沒有任何這類業務邏輯設定**（甚至連 reminder 都沒做）；把「未來可能有」當理由建表是 future-proof anti-pattern。**先走 B、需要時走 C** — 屆時 `business_rules` 多開幾個 `rule_kind` 也能撐到 5 條設定再考慮獨立表。

**Verdict**：⚠️ 備案、不選。

### 2.4 推薦

→ **方案 B**（完全靠 Hub + business_rules）。Phase 3 用戶可否決。

---

## 3. 副作用清單

| 動作 | 副作用 | 確定性 |
|---|---|---|
| `updatePickupTemplate` | UPDATE `notification_templates` WHERE code=...、立即 hot-swap、下一筆 dispatch 用新模板 | 高 |
| `previewPickupTemplate` | 純 render、無副作用；client-side 用 sample payload 套字串 | 高 |
| `updateDefaultChannels` | INSERT or UPDATE `business_rules` rule_kind='pickup_notification_default_channels' | 高 |
| `sendPickupNotification(['line'])` | `notifications.dispatch` → hub 推 LINE、寫 `notification_deliveries` 一筆、UPDATE fi.notify_methods_used.line = { sent_at, delivery_id } | 高（hub 已通） |
| `sendPickupNotification(['sms'])` | 同上，channel='sms'；但 **hub 目前沒實作 sms channel**、會直接失敗 | [需確認] Q1 |
| `sendPickupNotification(['call'])` | UPDATE fi.notify_methods_used.call = { recorded_at, recorded_by }、不 dispatch、不寫 deliveries | 高 |
| `sendPickupNotification(['line','sms'])` | 並行 dispatch、Promise.allSettled、部分成功部分失敗都記錄 | 中（部分失敗 UI 表達待設計） |
| `sendPickupReminder` | 同 sendPickupNotification、但模板 code 換成 `pickup-reminder.*.default`、payload 帶 `reminder_index: 1/2/3` | [需確認] Q6 |
| `listPendingPickupNotifications` | 純讀、會 JOIN fi / ro / customers / vehicles、應加 brand_id + RLS 跑得動的 index | 高 |
| `getPickupNotificationStats` | 純 aggregate、可能慢（如 fi / deliveries 巨大時）；可考慮 materialized view 或 5min cache | 中（量級夠才需要） |
| Hub `notification_templates` 被改 | 跟其他模組共用 — 改 `pickup-ready.line.default` 不會影響 `work-order-created.line.default`、彼此獨立 | 高 |
| Hub `notification_subscriptions` 是否要建一筆？ | demo 是「SA 點按鈕直接 dispatch」、沒走 subscription resolver；故 **不需要建 subscription**（dispatch 走 sendDirect 路徑）| [需確認] Q2 |

⚠️ Q1 / Q2 / Q6 進 Phase 3 拍板。

---

## 4. 跟其他姊妹頁的接點

| 對象 | 本頁怎麼跟它互動 |
|---|---|
| `final_inspections` (06) | **強讀依賴**：待發送清單查 fi where notify_methods_used 為空；sendPickupNotification 寫 fi.notify_methods_used；統計 query JOIN fi |
| `repair_orders` (02) | 透過 fi.repair_order_id 反查，顯示 ro_code、ro.closed_at（取車時間） |
| `customers` (09) | 透過 ro.customer_id 拉車主姓名、LINE userId、手機（target 解析來源） |
| `vehicles` (09) | 透過 ro.vehicle_id 拉車型、車牌（模板 placeholder 渲染） |
| `notification_hub` | **主要整合**：模板 CRUD、dispatch 入口、deliveries 來源 |
| `business_rules` | rule_kind='pickup_notification_default_channels'（預設勾選） |
| `06 final-check` 的 Step 5 | 共用 `sendPickupNotification` helper、共用模板；FI 那邊是「流程內按鈕」、本頁是「看板批次按鈕」 |
| `07 售後管理 / dashboard` | 「今日通知統計」可能會在 07 的 dashboard 顯示一張小卡 |
| `permissions` (RBAC) | `pickup_notification.send` / `pickup_notification.manage_template` 兩個權限 code（[需確認] Q3） |
| `12 客戶標籤主管設定` | 跟本頁無直接關係（12 是 RBAC、本頁是通知模板） |

---

## 5. Schema 草案（Phase 2 才會落實際 migration）

### 不新建任何業務表！

**所有設定都 fit 既有 schema**：

#### A. `notification_templates` 既有表插 2 筆 seed

```sql
-- 走既有 hub schema，不 alter
INSERT INTO notification_templates (code, event_code, channel_code, format, body, description)
VALUES
  ('pickup-ready.line.default', 'vehicle.pickup_ready', 'line', 'flex',
   jsonb_build_object(
     'template_string', '親愛的 {customer_name} 您好，\n您的 {vehicle_model} ({vehicle_plate}) 維修作業已完成，\n請您方便時前來取車。\n\nDUCATI 台北直營店 敬上',
     -- 真實上 line 應該用 flex bubble、body 結構化；template_string 是備援
     'flex_bubble', jsonb_build_object(
        'type', 'bubble',
        'header', jsonb_build_object(...),
        'body',   jsonb_build_object(...),
        'footer', jsonb_build_object(...)
     )
   ),
   '取車通知 Line 預設模板'),
  ('pickup-ready.sms.default', 'vehicle.pickup_ready', 'sms', 'text',
   jsonb_build_object(
     'template_string', '{customer_name} 您好，您的{vehicle_model}({vehicle_plate})已完修，請取車。DUCATI台北'
   ),
   '取車通知簡訊預設模板');
```

#### B. `business_rules` 既有表插 1 筆預設

```sql
INSERT INTO business_rules (brand_id, rule_kind, scope_subsidiary_id, scope_role_code, config, is_active)
VALUES
  ('ducati', 'pickup_notification_default_channels', null, null,
   jsonb_build_object('channels', ARRAY['line'], 'require_one', true),
   true),
  ('indian', 'pickup_notification_default_channels', null, null,
   jsonb_build_object('channels', ARRAY['line'], 'require_one', true),
   true);
```

#### C. Notification Hub 既有 `EventCode` 加 1 個值

```ts
// src/lib/notifications/types.ts
export type EventCode =
  | "work_order.created"
  | ...
  | "feedback_ticket.created"
  | "vehicle.pickup_ready";     // ← 新增
```

#### D. SMS channel — [需確認] Q1（看 Phase 3 決定）

如果決定接 SMS：
```ts
export type ChannelCode = "line" | "google-chat" | "sms";
```
+ 新建 `src/lib/notifications/channels/sms.channel.ts`（實作 send / render）
+ Provider 選擇（Twilio / 三竹 / 中華電信簡訊）屬商業決策，Phase 3 拍板

如果決定 SMS 走 hub 外部、不接 hub：
- 本頁 `sendPickupNotification` 內部判斷 `if (channel === 'sms') { 走另一個 send-sms helper }`
- `notification_deliveries` 不會有 sms row，統計要分兩處撈（破壞 SSOT）
- ❌ 不推薦

#### E. RLS

完全 reuse hub 既有 RLS（`authenticated_all`）+ `business_rules` 既有 RLS（如已有 `user_has_brand`），不新增。

> ⚠️ **本提案不寫實際 migration、不執行 DDL**。落地交給 Phase 4。

### 欄位分類（typed vs jsonb）— 本提案不涉及新表，僅標註 hub `notification_templates.body` 與 `business_rules.config` 的用法

| 落腳 | 內容 | 理由 |
|---|---|---|
| `notification_templates.body` (jsonb) | `{ template_string, flex_bubble?, ... }` | hub 本來就 jsonb；本頁 line 模板要 flex bubble + 純文字備援；sms 模板純 string；jsonb 容納差異 |
| `business_rules.config` (jsonb) | `{ channels: [...], require_one, reminder?: {...} }` | 業務規則 config 標準位置；reminder 未來可加進來 |
| `final_inspections.notify_methods_used` (jsonb) | `{ line: { sent_at, delivery_id }, sms: {...}, call: { recorded_at, recorded_by } }` | 屬 06 final-check 的責任；本頁只讀 |

---

## 6. Domain Helper 規劃（Phase 4 才建檔）

### 預計檔案

```
src/domain/pickup-notifications.ts             -- 主 facade（'use server'，async only）
src/domain/pickup-notifications.constants.ts   -- enum / const: PICKUP_CHANNELS / EVENT_CODE / TEMPLATE_CODES
```

> ⚠️ **重點規範**（依 SKILL 紀律）：
> - `pickup-notifications.ts` 走 `'use server'` → 只 export async function；所有 const / enum 移到 `.constants.ts`
> - UI 一律 `import { sendPickupNotification } from '@/domain/pickup-notifications'`，禁止 `import { createClient } from '@/lib/supabase/...'`
> - Day 1 內部直連 supabase + 呼叫 `notifications.dispatch`；不開新 server action 檔

### 預計 API

```ts
// reads
listPickupTemplates(): Promise<PickupTemplate[]>
getDefaultChannels(scope?: { brand_id, subsidiary_id?, store_id? }): Promise<{ channels: PickupChannel[]; require_one: boolean }>
listPendingPickupNotifications(filter): Promise<PendingPickupRow[]>
getPickupNotificationStats(filter): Promise<{ sent_today: number; pending: number; avg_wait_minutes: number | null }>

// writes
updatePickupTemplate(channel_code: 'line' | 'sms', body: Record<string, unknown>): Promise<Result>
previewPickupTemplate(channel_code, sample_payload): Promise<{ rendered: unknown }>  // pure render
updateDefaultChannels(scope, channels: PickupChannel[]): Promise<Result>
sendPickupNotification(input: { fi_id: string; channels: PickupChannel[] }): Promise<{ ok: boolean; deliveries?: DeliveryInfo[]; warnings?: string[]; error?: string }>

// 後續（[需確認] Q6 拍板後）
listOverduePickupReminders(threshold_hours?: number): Promise<...>
sendPickupReminder(fi_id, channels): Promise<Result>
```

### 跟 `final-inspections.ts` 的循環依賴避免

- 06 FI 的 `sendPickupNotification` 把實作搬到 `src/domain/pickup-notifications.ts`
- FI wizard step 5 `import { sendPickupNotification } from '@/domain/pickup-notifications'`
- 11 看板 `import { sendPickupNotification } from '@/domain/pickup-notifications'`
- `pickup-notifications.ts` 內部 `import` final-inspections 的 `getFinalInspectionById` 來拉 payload — 是單向依賴、不循環
- 06 提案 §11 Critical Files 那行「`sendPickupNotification` 住 final-inspections.ts」改成「住 pickup-notifications.ts」— 本提案修正 06 的計畫

---

## 7. 頁面骨架

| 頁面 | 路徑 | 類型 | 範本 | 備註 |
|---|---|---|---|---|
| 取車通知設定看板 | `/parts/aftersales/pickup-notifications`（或 `/parts/setup/pickup-notifications`） | **2-column dashboard**（左待辦清單 + 右設定/統計）、非標準 list/detail | 自製 layout、HTML 1:1 還原 | demo 是這個版面，直接照搬 |
| 編輯模板 dialog | same page modal | inline modal | 自製 | 點 textarea 編輯、儲存即 hot-swap |
| 路徑歸屬 | `/parts/aftersales/...` vs `/parts/setup/...` | — | — | [需確認] Q4 |

> ⚠️ 本頁是「設定 + 看板混合」、**不適用 items-board.tsx 範本**。可 reuse 06 / 07 / 01 已用過的 card / chip / button token，layout 自製。

**雙 brand 共用同一條路由 + 同一個 nav_node 入口**（template 內容 / business_rules 透過 brand_id 自然分流）。

---

## 8. nav_nodes（雙 brand、Phase 4 才動）

兩種擺位 candidate：

| Candidate | parent | 理由 | 推薦 |
|---|---|---|---|
| A. 售後管理底下 | `售後` → `配套設定` | 跟業務情境最近、SA 常用 | ⭐ |
| B. 設定主檔底下 | `List 主檔` → `通知設定`群組 | 跟 hub 後台同層、IT 管 | 次 |

→ 推薦 A。在 [需確認] Q4 確認後 INSERT 雙 brand 兩筆。

```sql
-- Phase 4 才動
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES
  ('ducati', '<ducati-aftersales-settings-parent>', 3, <n>, '取車通知設定', 'notifications_active', '/parts/aftersales/pickup-notifications', 'react_route', true, false),
  ('indian', '<indian-aftersales-settings-parent>', 3, <n>, '取車通知設定', 'notifications_active', '/parts/aftersales/pickup-notifications', 'react_route', true, false);
```

---

## 9. 開放問題（Phase 3 拍板）

- [ ] **Q1**：SMS channel 怎麼接？
   - (a) 加進 Notification Hub `ChannelCode = 'line' | 'google-chat' | 'sms'`，新建 `channels/sms.channel.ts`，Provider 用 Twilio / 三竹 / 中華電信。dispatch 同路徑、deliveries 同表、KPI 同 query — **架構最乾淨**
   - (b) SMS 走 hub 外、helper 內 switch — 破壞 SSOT、deliveries 分散兩處 — ❌
   - (c) POC 階段先不做 SMS、UI 顯示「未啟用」、只跑 line + call — **MVP 推薦**
   - 推薦 (c) for POC，未來真要 SMS 再走 (a)
- [ ] **Q2**：需要 `notification_subscriptions` 嗎？
   - (a) 不需要：本頁是「SA 手動點按鈕」flow、走 `sendPickupNotification` 直接 dispatch（不經 resolver）。target_ref 由 customer.line_user_id 直接帶入，不查 subscription 表
   - (b) 需要：每個車主註冊一筆 subscription（filter_rules: { customer_id }）、SA 點按鈕等於觸發 dispatch、resolver 找到該訂閱、推給該 target — 過度設計
   - 推薦 (a)
- [ ] **Q3**：權限分配？
   - 動作：「修改模板」/「設定預設 channel」/「發送通知」/「設定提醒」四個
   - (a) 全部走 RBAC permissions：`pickup_notification.manage_template` / `pickup_notification.send` 兩個 code
   - (b) 模板 = NOTIFICATION_ADMIN_EMAILS allowlist（跟 `/admin/notifications/templates` 一致）；發送 = SA 角色就可
   - 推薦 (a) — RBAC SSOT
- [ ] **Q4**：路徑與 nav 擺位？
   - (a) `/parts/aftersales/pickup-notifications` 放售後配套設定
   - (b) `/parts/setup/pickup-notifications` 放 List 主檔/通知設定
   - (c) 直接放 `/admin/notifications/pickup`（跟 hub 後台同層）
   - 推薦 (a) — SA 常用、跟業務情境最近
- [ ] **Q5**：模板 placeholder 命名規範？
   - demo HTML 用中文 `{車主姓名}` / `{車型}` / `{車牌}`
   - hub 慣例（kits.ts）用英文 `{customer_name}`
   - (a) 模板字串存中文 placeholder、render 時透過 mapping 轉
   - (b) 直接英文、UI 顯示 hint「可用變數：{customer_name}, {vehicle_model}, ...」
   - 推薦 (b) — 跟 hub 一致、避免中英 mapping 維護
- [ ] **Q6**：定時提醒（24hr 未取車自動推第二次）做不做？
   - (a) MVP 不做、本頁只負責一次性通知；overdue 邏輯交給 07 售後管理的 dashboard 提醒 SA 手動聯絡
   - (b) 做、用 pg_cron（Supabase 內建）每小時掃 fi where notify_methods_used 非空 AND ro.closed_at IS NULL AND sent_at < now() - 24hr → 觸發 `sendPickupReminder`
   - 推薦 (a) for MVP
- [ ] **Q7**：「平均等候時間」demo 顯示 48 分鐘 — 定義？
   - (a) 通知發出 → 客戶到店（ro.closed_at）
   - (b) FI signed → 客戶到店
   - (c) 通知發出 → 客戶開始來店（demo 沒這資料）
   - 推薦 (a)
- [ ] **Q8**：模板支援 _多語言 / 多 brand 訊息_ 嗎？
   - demo 模板含「DUCATI 台北直營店」— 是 brand-specific
   - (a) per-brand 模板：`pickup-ready.line.ducati.default` / `pickup-ready.line.indian.default`、code 加 brand
   - (b) 同一模板、用 placeholder `{brand_display_name}` + `{store_display_name}` 動態插入
   - 推薦 (b)
- [ ] **Q9**：call channel 是否要進一步分「打過了 / 沒接通 / 留言」？
   - demo 沒分；只是按下「電話提醒」紀錄一次
   - (a) 不分：純 boolean 已紀錄
   - (b) 分：notify_methods_used.call = { recorded_at, recorded_by, result: 'answered' | 'voicemail' | 'no_answer' }
   - 推薦 (a) for MVP、(b) 留 metadata 升級
- [ ] **Q10**：通知失敗（LINE 推不到、推 webhook 4xx）UI 如何呈現？
   - (a) 待發送清單該 row 顯示紅色 chip「Line 失敗、可重試」、按鈕變「重試 Line + 電話備援」
   - (b) 只顯示「失敗」、SA 自己想辦法
   - 推薦 (a) — UX 友善
- [ ] **Q11**：「儲存範本」按鈕是否做版本歷史？
   - hub `notification_templates` 沒做 version；改了就改了
   - (a) 不做：跟 hub 一致、後悔自己 ctrl-Z 重打
   - (b) 做：另開 `notification_template_history`（hub 級別的改進，不該本頁獨佔）
   - 推薦 (a) for MVP；如需要走 hub 層級提案、本頁不獨自做
- [ ] **Q12**：與 06 final-check Step 5 通知 UI 的視覺一致性？
   - 兩處按鈕、tooltip、loading state、失敗 UI 必須一模一樣（共用 component）
   - 推薦：抽 `<PickupNotifyButton fi_id channels />` 共用元件、放 `src/components/aftersales/pickup-notify-button.tsx`

---

## 10. Critical Files（Phase 4 才動）

| 動作 | 路徑 |
|---|---|
| 新增 | `src/domain/pickup-notifications.ts`（facade） |
| 新增 | `src/domain/pickup-notifications.constants.ts`（PICKUP_CHANNELS / EVENT_CODE） |
| 新增 | `src/app/(workspace)/parts/aftersales/pickup-notifications/page.tsx`（看板） |
| 新增 | `src/app/(workspace)/parts/aftersales/pickup-notifications/_components/pending-list.tsx`（左欄） |
| 新增 | `src/app/(workspace)/parts/aftersales/pickup-notifications/_components/template-editor.tsx`（右欄） |
| 新增 | `src/app/(workspace)/parts/aftersales/pickup-notifications/_components/today-stats.tsx`（右欄） |
| 新增 | `src/components/aftersales/pickup-notify-button.tsx`（共用按鈕；06 / 11 共用） |
| 新增 | `src/lib/notifications/templates/pickup-ready.ts`（兩個 TemplateDefinition） |
| 修改 | `src/lib/notifications/types.ts` — `EventCode` 加 `vehicle.pickup_ready`（如 Q1 採 (a) 也加 sms 進 `ChannelCode`） |
| 修改 | `src/lib/notifications/templates/registry.ts` — register pickupReadyLine / pickupReadySms |
| 新增 | DB seed: `notification_templates` 兩筆 + `business_rules` 雙 brand 各一筆 |
| 修改 | 06 提案 §11 — `sendPickupNotification` 改住 pickup-notifications.ts、不住 final-inspections.ts |
| 修改 | RBAC `permissions` 表 — 新增 `pickup_notification.manage_template` / `pickup_notification.send` |
| 新增 | nav_nodes 雙 brand 兩筆（[需確認] Q4 路徑確認後） |

---

## 11. Verification（落地完手測，Phase 5 跑）

1. **模板 hot-swap**：在 11 改 Line 模板「請過來取車」→「請於 17:00 前取車」、立即進 06 FI step 5 按發送、實收 LINE 訊息是新版
2. **預設 channel 套用**：把 `business_rules` 改成 `['line', 'sms']`、06 FI step 5 進入時 checkbox 預設兩個都勾
3. **待發送清單正確性**：手動把某 FI status='signed' 且 notify_methods_used={} → 11 看板出現該 row；發送後 row 從清單消失
4. **dispatch 雙頁一致**：06 FI 內按發送 vs 11 看板按發送，兩處 deliveries 表落筆內容（payload / template_code）完全一樣
5. **call channel 不發 hub**：點「電話提醒」→ fi.notify_methods_used.call 寫入、`notification_deliveries` 不多一筆
6. **統計準確性**：今日 sent count = `notification_deliveries WHERE event_code='vehicle.pickup_ready' AND status='sent' AND created_at::date=today`
7. **brand 隔離**：ducati 看不到 indian 的 pending 清單（through fi.brand_id RLS）；ducati 改了模板不影響 indian 看到的模板（[需確認] Q8 採 (b) 用 placeholder 就同模板；採 (a) 就 per-brand template code）
8. **失敗 retry**：人為製造 LINE token 失效、按發送 → delivery 寫 failed、看板該 row 紅 chip「Line 失敗、可重試」、按下 retry 走 hub `retryDelivery`
9. **權限隔離**：沒 `pickup_notification.manage_template` 的人看不到「儲存範本」按鈕；沒 `pickup_notification.send` 的人看不到「發送」按鈕
10. **placeholder 渲染**：模板 `{customer_name}` 在 LINE 收到變成「鄭宗勳」、`{vehicle_plate}` 變「LGX-8096」
11. **tsc --noEmit / eslint** 0 errors

---

## 12. 邊界（什麼不做）

- ❌ 不新建 `pickup_notification_settings` 業務表（依 §2 推演）
- ❌ 不重複落 `notification_*` schema（已存在）
- ❌ 不在本頁實作「自動推送」（demo 明示 SA 手動 gated；自動推不符合本頁設計）
- ❌ 不做模板版本歷史（[需確認] Q11 — MVP 不做、要做走 hub 級別）
- ❌ 不接 SMS provider 整合（[需確認] Q1 — MVP 不做）
- ❌ 不做定時提醒（[需確認] Q6 — MVP 不做）
- ❌ 不寫真正撥電話功能（call channel = 純人工記錄）
- ❌ 不在 nav_nodes 加流程內頁（本頁是設定 + 看板、屬入口頁）
- ❌ 不取代 `/admin/notifications/templates` 後台（那邊 IT/Hub admin 用、本頁是售後 SA 友善 UI）

---

## 13. 對 spec-to-feature SKILL 自己的回饋

跑這頁時的觀察：

1. ✅ **既有基礎建設複用評估有用**：spec-to-feature 雖然沒有「先檢查 hub」這條 step，但 architecture.md §3 的「先檢查 permissions 表 + PERMISSIONS 常數」對應到「先檢查 notification_templates 表 + EventCode 常數」邏輯一致 — 抽象出來就是「碰到設定類頁面、先看現有 SSOT 能不能 reuse」
2. ✅ **「不開新表的提案」也有價值**：phase 1 不一定要建表、有時候最大價值是釐清「為什麼不要建表」+ 把 reuse 路徑寫清楚；本頁就是這個典型
3. ⚠️ **跨提案的 helper 歸屬建議**：06 提案說 `sendPickupNotification` 住 `final-inspections.ts`、本提案說該住 `pickup-notifications.ts`；spec-to-feature 沒明確規定「跨頁共用 helper 歸誰」、第二份提案要回頭修正第一份的計畫，應該有條 SOP「跨頁共用 helper 屬於 _用得多的那一方_ + 在後寫的提案要 update Critical Files」
4. ⚠️ **「設定頁 + dashboard 混合」沒範本**：跟 06 FI wizard 一樣，本頁也是 list/detail 範本之外的型別；spec-to-feature page-templates.md 可考慮補一條 _settings + dashboard hybrid_ 範本
5. ✅ **「不新建表」的決策過程**：方案 A / B / C 三方推演對於避免 over-engineering 蠻有效；建議 spec-to-feature 也補一條「先列『新建表 vs reuse 既有』三方案推演」當 phase 1 必做章節
