# CRM03B — 售後電訪工作台（卡片展開 + NPS 快評 + RO 資訊條）Phase 1 提案

> 規格：`docs/DUCATI_v2_output/02_客服管理/02_售後CRM/CRM03B_售後電訪工作台_v1.html`
> 現行：`src/app/(workspace)/crm/aftersales/call-tasks/page.tsx`（thin wrapper、kind 鎖 'aftersales' 重用銷售側 `CallTasksBoard`）
> 階段：**Phase 1（僅提案、不落地、不寫 code）**
> 對應 BDN 第三輪卡片：CRM03B（M、3-4 天）
> 姊妹提案：
> - `docs/proposals/feature-crm03-call-tasks-phase1.md`（CRM03A 銷售電訪工作台，共用 schema 基礎 + 日期導覽 / tab pills / 話術提示）
> - `docs/proposals/feature-crm02b-aftersales-survey-templates-phase1.md`（CRM02B 售後問卷設定，提供本頁的話術 + hint 資料源）
> 日期：2026-05-16

---

## 0. TL;DR

CRM03B 跟 CRM03A（銷售電訪工作台）90% 共結構（sub-bar 日期導覽、tab pills、KPI 5 欄、卡片展開、話術 box、結果快選、saveCall 表單），**5 個售後特有差異**：

1. **tab pills 6 選 1**：全部 / D+3 / 回廠保養 / 保固 / Desmo / 自訂（vs 銷售側 5 個 D+3/D+7/邀約/報價/自訂）
2. **進廠後服務資訊條（RO 資訊條）** — 卡片展開時最上面一條淡綠底，秀「RO 編號 / 進廠日 / 里程 / 消費金額」，**join `repair_orders` 撈**
3. **NPS 快評 UI**（0-10 inline 11 顆 button）— D+3 / NPS 訪談類型才顯示；點選即寫，**直接 INSERT `nps_responses` 一筆**、不開 wizard
4. **KPI 第 5 欄改「本月 NPS 平均」**（vs 銷售側「未來已排程」）— 從 `nps_responses` 當月平均算
5. **歷史記錄項目源不同** — 售後時間軸要含「進廠紀錄」（從 repair_orders 倒推），不只 followup_events

**核心架構決策題**（同 CRM02B）：**(A) 銷售側 board 一起升級、prop 控制 vs (B) 售後拆出獨立 component**。Sub-agent **傾向 (A)**，理由見 §3.1。

---

## 1. Spec 實際內容（逐 section，含與 CRM03A 差異）

> 共通結構詳見 `feature-crm03-call-tasks-phase1.md` §1。本節只列 CRM03B 特有 / 不同的地方。

### 1.1 Header / Sub-bar / Sidenav

| 區塊 | CRM03A 銷售 | CRM03B 售後 |
|------|-----------|-----------|
| Header 右側 badge | — | **`sa-badge`「SA 售後專用」** |
| Header 連結 | ← 總覽 / 客戶基盤 / +新增 | ← 客戶基盤 / 問卷設定 / +新增 |
| Sub-bar tab pills | 5 個（全部/D+3/D+7/邀約/自訂） | **6 個**（全部 / D+3 / 回廠提醒 / 保固提醒 / Desmo / 自訂跟進） |
| Sub-bar filter-select | 全體 RS / HABC | 全體 SA（無 HABC） |
| Sidenav 任務狀態（5 項） | 全部 / 逾期 / 今日待 / 今日完 / 未來排程 | 同（完全一致） |
| Sidenav 電訪類型（n 項） | 4 項（d3/d7/invite/custom） | **5 項**（d3 ⭐ / maintenance ⏰ / warranty 🛡️ / desmo ⚙️ / custom 📌） |
| Sidenav 快速工具 | 客戶基盤 / 問卷設定 / 開新手卡 | 客戶基盤 / **問卷設定 / NPS 看板** |

### 1.2 Main — KPI 5 欄（第 5 欄差異）

```
1. total      (navy)    今日全部任務     9       2026-05-11
2. overdue    (red)     逾期未完成       2       需優先處理
3. pending    (amber)   今日待跟進       4       本日到期
4. done       (teal)    今日已完成       2       完成率 22%
5. ★ nps_avg  (blue)    本月 NPS 平均   8.2     已評 24 筆     ← CRM03A 是「未來已排程」
```

第 5 欄改 NPS 月度平均，從 `nps_responses` 撈：
```sql
SELECT
  ROUND(AVG(score)::numeric, 1) AS nps_avg,
  count(*) AS nps_total
FROM nps_responses
WHERE brand_id=$brand AND kind='aftersales'
  AND responded_at >= date_trunc('month', current_date)
  AND responded_at <  date_trunc('month', current_date) + interval '1 month';
```

### 1.3 Main — 卡片列表（cc-card）

**cc-hdr** 結構幾乎同 CRM03A，差異只在欄位 label：

- 上排：客戶姓名 + 電話 + 車牌（plate chip，售後特有 — 銷售側是「車型」）
- 中排：`SA：{name}` + `🏍️ {bike}` + **`最近 RO：{ro_code}`** + `消費 {amount}` + dueLabel
- 右側 type-badge 6 色（d3 紅 / maint amber / warranty teal / desmo blue / nps purple / custom gray）

> 同銷售側 CRM03A，cc-hdr 中排「SA」「最近 RO」這些欄位也都是 join 出來的衍生欄。

### 1.4 Main — 卡片展開 cc-body（**Phase 1 重點區**）

由上到下 **5 個區塊**：

#### (1) 🟢 RO 資訊條（CRM03B 特有，淡綠底 `#E1F5EE`）

```
📋 工單 RO-2026-0508 | 📅 2026-05-08 | 📏 里程 11,200 km | 💰 金額 NT$5,400
```

資料源：依任務類型不同，撈不同 RO：
- **d3** type → 撈 `closed_at = (scheduled_at - interval '3 days')` 那筆 RO（D+3 = 工單關閉後 3 天）
- **maintenance / warranty / desmo / custom** type → 撈該客戶 + 車輛**最近一筆 closed RO**（last visit）

⚠️ 不一定每張卡都有對應 RO（剛建檔的客戶可能沒進廠過）— UI 要做 nullable 處理（沒 RO 就隱藏整條 bar）。

#### (2) 🟦 話術提示（script-box，深藍底）

同 CRM03A、不重複。script_text + script_highlights 來源：

- 若 `survey_template_id` 有設 → 從 `survey_templates.metadata.script`（CRM02B 提案的話術欄）撈
- 否則用前端 helper `getCallScriptTemplate(call_type, kind='aftersales')` 帶預設範本

#### (3) 🟣 NPS 快評（CRM03B 特有、只 d3 / nps 類型顯示）

```html
<div class="nps-row">
  <span>📊 NPS 評分</span>
  <div class="nps-score-btns">
    <button data-v="0">0</button> ... <button data-v="10">10</button>
  </div>
</div>
```

11 顆 button（紫色系 `#534AB7` / 底 `#EEEDFE`），點選即記。

**業務語意**：D+3 滿意度回訪是「順手收 NPS」的場景，SA 不會為了 NPS 開另一個 modal、要的就是這條 inline 評分 row。

**寫入策略**（Phase 1 決策題、見 §3.4）：
- (a) 點即寫 — 點下立刻 INSERT `nps_responses` 一筆（+ optimistic UI）
- (b) 暫存 + saveCall 一起寫 — 跟 result/note/nextDate 同一個 transaction（保證原子）

→ **建議 (b)**：避免「打分數但忘了存通話」造成 NPS 沒 call_task_id 關聯、後續報表對不齊。UI 上即時反饋（已選的 button 高亮）、實際 INSERT 等 saveCall。

#### (4) 🕒 歷史記錄（prev-calls 時間軸、CRM03B 來源更廣）

每筆 prev-item = `dot 色 + 日期 + 文字`。CRM03B 來源**有 2 條**：

1. `followup_events` where `case_id = customer_id`（之前的電訪 / LINE / 來店）
2. `repair_orders` where `customer_id = $cid` AND `status='closed'`（最近 5 筆進廠紀錄、文字「進廠：{服務項目}（{ro_code}）」）

→ 兩源 union by `occurred_at desc` limit 10，顯示在同一條時間軸。

#### (5) ✍️ 結果快選 + 記錄表單

`result-icons` 5 顆 pill 跟 CRM03A 不一樣的地方：

| icon | 銷售 CRM03A | 售後 CRM03B |
|------|------------|------------|
| 1 | ✅ 已接通 | ✅ 已接通 |
| 2 | 📬 留言 | 📩 留言 |
| 3 | 📵 未接聽 | 📵 未接通 |
| 4 | 📅 改期 | 🔄 改期跟進 |
| 5 | ❌ 結案 | **⚠️ 有不滿需處理** |

「有不滿」是售後特有，業務語意是「客訴升級」（後續可能要轉客訴單）。Phase 1 暫不接客訴模組、只記 `call_result = 'complaint'` + note。

record-area grid 2 欄（同 CRM03A 結構）：
- 下次跟進日期 input
- CRM 備忘 textarea（提示文字改成「例：NPS 8分，對等待時間略有意見，下次提早告知取車時間...」）
- **沒有「競品去向 select」**（售後不需要）

save-call-row 兩顆 btn：⏰ 延後一天 / ✅ 儲存電訪結果。

### 1.5 新增電訪任務 Modal（同 CRM03A 結構、enum 不同）

電訪類型 6 選 1：`d3 / maintenance / warranty / desmo / nps / custom`（vs 銷售 5 選 1）。

頂部多一段提示 banner：「💡 D+3 滿意度回訪會由 SA 工單系統於工單關閉後自動建立，通常無需手動新增。其他類型請手動建立。」

**業務語意**：D+3 是工單關閉觸發、其餘是手動建。Phase 1 自動觸發**不做**（Phase 2 增量、可掛 `repair_orders.status` change trigger 或 cron 掃 closed_at + 3 days）。Phase 1 全部手動建。

---

## 2. 資料缺口 audit（接續 CRM03A.audit）

> CRM03A 提案的所有 `call_tasks` schema 缺口都共用（`call_type` typed column、`metadata.script_text/highlights/goal`、followup_events 時間軸、overdue derived、assignee_name 慣例）。本節只列 **CRM03B 特有**的缺口。

### 2.1 既有資料表現況（已 verify via information_schema）

| 表 | 關鍵欄位 | 狀態 |
|---|---|---|
| `call_tasks` | id/brand_id/kind/customer_id/survey_template_id/assignee_id/scheduled_at/status/call_result/attempt_count/answers/notes/metadata | ✅ schema 已備齊 |
| `repair_orders` | id/brand_id/ro_code/customer_id/vehicle_id/sa_id/status/opened_at/closed_at/mileage_in/lines_total/lines_subtotal/metadata | ✅ 完全足夠 RO 資訊條 |
| `nps_responses` | id/brand_id/kind/customer_id/**call_task_id**/survey_template_id/score/category/comment/store_id/responded_at/metadata | ✅ 有 call_task_id FK — 完美對接 NPS 快評 |
| `followup_events` | id/brand_id/case_id/event_type/outcome/body/acted_by/acted_by_name/occurred_at/metadata | ✅ 共用 CRM03A 慣例 |
| `customer_vehicles` | license_plate/model_id/current_mileage/last_service_date/last_service_mileage/warranty_until | ✅ 撈車牌 + 車型 |
| `survey_templates` | kind/name/questions/metadata（CRM02B 會加 `metadata.script`） | ⚠️ 取決於 CRM02B 落地進度 |

### 2.2 現況 row count

```
call_tasks: 6 筆全是 sales / brand=indian、aftersales 0 筆
```

→ **CRM03B.1 必須 seed indian 雙月份 9-12 筆售後電訪任務**（涵蓋 5 種 call_type、overdue/today/done/scheduled 4 種 status）才能畫面有東西展示。

### 2.3 RO 資訊條的撈取 query

```sql
-- D+3 case：撈 closed_at 對應的工單
SELECT ro.ro_code, ro.closed_at::date AS visit_date,
       ro.mileage_in, COALESCE(ro.lines_total, ro.estimated_subtotal) AS amount
FROM repair_orders ro
WHERE ro.customer_id = $customer_id
  AND ro.status = 'closed'
  AND ro.closed_at::date = ($scheduled_at::date - interval '3 days')::date
LIMIT 1;

-- 其他 type：撈最近一筆 closed RO（last visit）
SELECT ro_code, closed_at::date, mileage_in, lines_total
FROM repair_orders
WHERE customer_id = $customer_id AND status = 'closed'
ORDER BY closed_at DESC
LIMIT 1;
```

兩個 query 都在 server component pre-fetch、不在 client 跑。批次撈：一次 `WHERE customer_id IN (...)` 撈全部、用 Map 對應；不要 N+1。

### 2.4 NPS 快評寫入 schema

`nps_responses` 已有 `call_task_id` FK（list_tables 確認）→ 直接走：

```sql
INSERT INTO nps_responses (
  id, brand_id, kind, customer_id, call_task_id, survey_template_id,
  score, category,         -- 'promoter'(9-10) / 'passive'(7-8) / 'detractor'(0-6)
  comment, store_id, sales_person, responded_at, metadata
) VALUES (...);
```

`category` 從 `score` 衍生（promoter/passive/detractor 三分），可在 domain helper 算。

⚠️ **去重邏輯**：同一個 call_task 多次點 saveCall → 要避免重複 INSERT。建議：
- 加 unique constraint `(call_task_id) where call_task_id is not null`
- 或在 helper 內 upsert `ON CONFLICT (call_task_id) DO UPDATE`

→ Phase 1 採 **upsert by call_task_id**（schema 已就位、不需新增 unique，靠 helper 控制即可；若要保險、未來加 partial unique index）。

### 2.5 KPI「本月 NPS 平均」query

```sql
SELECT
  ROUND(AVG(score)::numeric, 1) AS nps_avg,
  COUNT(*) AS nps_total
FROM nps_responses
WHERE brand_id = $brand AND kind = 'aftersales'
  AND responded_at >= date_trunc('month', current_date)
  AND responded_at <  date_trunc('month', current_date) + interval '1 month';
```

加進 `getCallTaskListPageData` 的 stats 第 6 個欄位（aftersales-only、sales 側回 `null` 就好）。

### 2.6 沒有缺口的東西

- `call_tasks.status` 4 種值（pending/in_progress/completed/skipped）涵蓋 spec 所需（spec 'overdue' = derived，不入欄）
- `nps_responses.score` smallint 0-10、`comment` text — 完整支援 spec
- `repair_orders` 進廠資訊全齊（ro_code, closed_at, mileage_in, lines_total）

---

## 3. 架構決策（同 CRM02B，**主要決策題、待 Ming 拍板**）

### 3.1 現況（兩條業務線共享 `CallTasksBoard`）

`src/app/(workspace)/crm/sales/call-tasks/_components/call-tasks-board.tsx`（440+ lines、已升 design pattern、DataGrid）—— 同時服務銷售 / 售後：

- `crm/sales/call-tasks/page.tsx` → 傳 `kind='sales'` + `basePath='/crm/sales/call-tasks'`
- `crm/aftersales/call-tasks/page.tsx` → thin wrapper 改傳 `kind='aftersales'` + `basePath='/crm/aftersales/call-tasks'`
- board 內已用 `KIND_LABEL[kind]` / `filters.kind === 'sales'` 等 prop 切換做基本差異

### 3.2 兩條路徑

#### 路徑 (A) — 銷售側 + 售後同步升級、prop 控制差異

- CRM03A.3（卡片視圖 + sub-bar 日期導覽 + 折疊話術）跟 CRM03B 共用一份 board
- 用 `filters.kind === 'aftersales'` 條件渲染：
  - tab pills（5 vs 6 個）
  - KPI 第 5 欄（未來排程 vs NPS 月均）
  - 卡片展開區的 RO 資訊條（aftersales 顯示）
  - NPS 快評 row（aftersales + call_type∈{d3,nps} 顯示）
  - 結果快選第 5 顆（結案 ❌ vs 不滿 ⚠️）
  - record-area 是否有「競品去向」（sales-only）

**利**：兩側永遠同步、共用 server fetch / actions / 卡片元件；維護單點。
**弊**：board 從 440 → 700+ 行；條件渲染散落；售後 5 個差異點要小心不要污染銷售側。
**工時**：3-4 天（含 CRM03A 沒做的卡片視圖 + 兩側 timing 適配 + NPS 快評 + RO 資訊條 + 售後特有 result enum）。

#### 路徑 (B) — 售後拆出 `aftersales-call-tasks-board.tsx` 獨立 component

- 新建 `src/app/(workspace)/crm/aftersales/call-tasks/_components/aftersales-call-tasks-board.tsx`
- aftersales/page.tsx 改 import 自家 board
- sales 版 board 不動（CRM03A 落地時自己升）
- domain helper / actions 共用一份（schema 一樣）

**利**：兩側獨立演進、改動局限、邏輯清晰。
**弊**：90% code 重複、卡片視圖要做兩遍、視覺升級要改兩處。
**工時**：3-4 天（不會比 (A) 快、只是測試風險局限）。

### 3.3 Sub-agent 中立分析意見

跟 CRM02B 同類問題，從 spec 看 CRM03A vs CRM03B 結構也 **90% 一樣**（sub-bar、tab pills、KPI、卡片展開、話術 box、結果快選、saveCall 表單）；差異點都是**資料欄位 / enum 值 / 條件區塊**而非**工作流結構**——適合 prop 控制。

**Sub-agent 傾向 (A)**，理由：
1. 結構同源、差異欄位化 → prop 控制天然 fit
2. 銷售側目前已是兩線共用 board（kind prop 切資料）、共用慣例已建立
3. CRM03A.3「卡片視圖」是大頭、不如一次到位讓兩側都有
4. POC 階段不過度 future-proof（架構文 §不寫什麼）

**但 (B) 的理由也成立**：
- Ming 在 CRM02B 同類決策可能選 (B)（commit ff45491 過去拆 sales/aftersales 14 頁明示偏好獨立）
- 售後 SA 工作流的 RO 資訊條 / NPS 快評跟銷售業代差異會越拉越大
- board 變胖 700 行讀起來會頭痛

**Q1 待 Ming 拍板**。CRM02B 跟 CRM03B 的 Q1 答案最好對齊（都選 A 或都選 B），避免 sales/aftersales 雙 board 一邊共用一邊拆。

### 3.4 NPS 快評寫入時機（Phase 1 必拍板）

| 方案 | 行為 | 利 | 弊 |
|------|------|---|---|
| (a) 點即寫 | 點 NPS button 立刻 INSERT nps_responses（optimistic） | UX 即時 / SA 不會忘記點儲存 | 沒打完整通通話就有 NPS row、可能孤兒（call_task 後來 cancel） |
| (b) saveCall 一起寫 | UI 暫存選擇、saveCall 時 transaction 寫 nps + update call_task + insert followup_event | 原子保證 / 整潔 | 點了 NPS 但忘記按儲存 → 資料丟失 |

→ **預設 (b)**（架構乾淨），UI 給明顯「未儲存」提示（如「📊 NPS 評分：8 分（未儲存）」灰字 hint），鼓勵 SA 點儲存。Q3。

### 3.5 結果 enum「complaint」處置（Phase 1 範圍）

`call_result = 'complaint'` 是新值，**只記不轉**：
- DB 不加 check constraint（call_result 是 text、自由）
- 記到 metadata 內可選的 `complaint_severity` enum（low/mid/high）？— Phase 1 **不做**，只記 result + note
- 後續若要接客訴模組（升級 ticket / 通知主管）→ Phase 2 增量

### 3.6 RO 資訊條 batch fetch 策略

每張 call task 卡片需要 1 筆 RO，N 張卡 = N 筆 RO。**不要 N+1**：

```ts
// server component pre-fetch
const customerIds = rows.map(r => r.customer_id);
const ros = await getLatestClosedROsByCustomers(customerIds, /* d3 cutoff dates */);
// 在 row mapper 內查 Map<customer_id, RO>
```

D+3 case 還要對齊「scheduled_at - 3 days」這個日期 → query 加 `IN ((cust1, date1), (cust2, date2), ...)` 或寬鬆撈最近 30 天 closed RO 再 client side 對日期。Phase 1 採後者（query 簡單）。

### 3.7 歷史時間軸雙源合併

UI 在 client 把 2 個 array merge by occurred_at，server 一次撈完傳下來：

```ts
type TimelineItem = {
  source: 'followup' | 'repair';
  occurred_at: string;
  dot: 'teal' | 'blue' | 'amber' | 'red' | 'purple';
  text: string;
};
```

server 撈 followup_events（最近 10）+ repair_orders（最近 5 筆 closed），合併 sort desc limit 10。

---

## 4. 落地拆分（CRM03B.1 ~ .5）

> 假設選 (A) 銷售側一起升級。若選 (B) 拆 board，則 .2/.3 變成在獨立 aftersales board 上實作。

### CRM03B.1 — schema 增量 + seed（沿用 CRM03A.1）

- 沿用 CRM03A.1：`call_tasks.call_type` typed column / `metadata.script_text` 等
- **新增**：`nps_responses` 確認 `call_task_id` FK 已就位（已驗，不用動 schema）
- **新增 seed**：indian 雙月份 **9-12 筆售後 call_tasks**：
  - 涵蓋 5 種 call_type（d3 × 3、maintenance × 2、warranty × 2、desmo × 1、custom × 1）
  - 涵蓋 4 種 status × scheduled_at 分佈（overdue 2 / today 4 / done 2 / future 1）
  - 對應 `repair_orders` 也補 indian 售後場景 seed（若不足）
  - 部分 d3 已有 `nps_responses` row（demo 已評筆數）

**前置依賴**：CRM03A.1 是否落地？若否，CRM03B.1 合併進去（同一個 migration）。

**風險**：中（seed 量大 + 跨表關聯）。

### CRM03B.2 — Domain helper 售後增量

- `getCallTaskListPageData(filters, userId)`：
  - kind='aftersales' 時加撈 **RO batch fetch**（最近 30 天 closed RO by customer_ids）
  - 加撈 **車輛 license_plate**（join customer_vehicles）
  - 加撈 **followup_events**（每客戶最近 5 筆）+ **repair_orders 時間軸**（每客戶最近 5 筆 closed）
  - stats 加第 6 欄 `nps_avg_month` / `nps_total_month`（kind='aftersales' only）
- `saveAftersalesCallAction(input)` server action：
  - transaction 內：(1) update call_tasks status / result / notes / last_attempt_at；(2) insert followup_event；(3) **upsert nps_responses by call_task_id**（若有評分）；(4) 若有 nextDate → insert 新 call_task
  - 回傳 `Result<{ id, nps_response_id? }>`

**風險**：中（multi-table transaction + upsert 邏輯）。

### CRM03B.3 — Board UI 卡片視圖升級（共用 CRM03A 卡片基礎、加售後 5 差異）

- sub-bar：日期導覽 + **6 個 tab pills**（aftersales 時）
- KPI 第 5 欄：**「本月 NPS 平均 / 已評 X 筆」**（aftersales 時）
- 卡片展開區：
  - RO 資訊條（淡綠底）— aftersales-only
  - 話術 box（共用 CRM03A）
  - **NPS 快評 row**（aftersales + call_type∈{d3,nps}）
  - 歷史時間軸（雙源 merge）
  - 結果快選（第 5 顆改「⚠️ 有不滿需處理」、移除「競品去向」）

**風險**：中（條件渲染密度高、需要嚴格測試 sales 側不受污染）。

### CRM03B.4 — NPS 快評儲存邏輯

- 前端：點 button → state 更新 selectedNps、視覺高亮、顯示「（未儲存）」提示
- saveCall 時：把 nps 跟 result / note / nextDate 一起送 server action
- 後端：upsert by call_task_id；同步算 category（promoter/passive/detractor）
- 列表 banner 顯示「✅ 電訪結果已儲存｜NPS：8 分」（搭配 §UX 互動規範 §3 的成功 banner）

**風險**：低（純資料寫入）。

### CRM03B.5 — 新增電訪任務 Modal（aftersales 適配）

- reuse 現行 `new/page.tsx` 邏輯改成 Modal（CRM03A.5 同步做）
- aftersales 時：類型 select 換 6 個 enum；頂部 banner 提示「D+3 由工單系統自動建立」
- 送出後依 call_type 把 default script / highlights 寫進 metadata

**風險**：低。

### 驗證 / 測試

- tsc 0 / eslint 0
- E2E：日期切換 / tab 切換 / KPI 對齊 / 卡片展開 / RO 資訊條顯示 / NPS 快評選擇 / saveCall（含 NPS）/ 改期跟進 / 卡片切到 sales 側不受污染

### 總工時

| 子任務 | 估時 |
|--------|------|
| CRM03B.1 schema + seed | 0.5 天（前提 CRM03A.1 已落地；否則 1 天合併） |
| CRM03B.2 domain helper | 1 天 |
| CRM03B.3 board UI 卡片升級 | 1-1.5 天 |
| CRM03B.4 NPS 儲存邏輯 | 0.5 天 |
| CRM03B.5 新增 modal 售後適配 | 0.5 天 |
| 驗證 | 0.5 天 |
| **合計** | **3-4 天**（對齊 BDN 估時 M） |

---

## 5. 待 Ming 拍板（Q1-Q8）

| # | 問題 | 預設 / 傾向 | 為什麼問 |
|---|------|------------|---------|
| **Q1** | **架構選邊：(A) 銷售側 board 一起升級、prop 控制 vs (B) 售後拆出獨立 board** | Sub-agent **傾向 (A)**，未自選；建議與 CRM02B Q1 答案對齊 | 影響整個落地路徑、CRM02B 同類問題 |
| **Q2** | RO 資訊條只在卡片展開時顯示，還是 cc-hdr 中排已秀「最近 RO」就夠了？ | **展開時才顯示資訊條**（spec 原版） | spec 兩處都顯示、是否重複 |
| **Q3** | NPS 快評寫入時機 (a) 點即寫 / (b) saveCall 一起寫 | **(b) saveCall 一起寫** | 原子性 + 避免孤兒 NPS row |
| **Q4** | NPS 快評在 cc-body 哪些 call_type 才顯示？ | **d3 + nps 兩種**（spec 邏輯） | maintenance/warranty/desmo 也順手收 NPS 嗎？ |
| **Q5** | 「⚠️ 有不滿需處理」第 5 顆 Phase 1 只記 result+note，不接客訴模組 OK 嗎？ | **OK**（Phase 1 不接） | 後續可能要升 ticket / 通知主管 |
| **Q6** | 歷史時間軸是否合併 `repair_orders` 進廠紀錄（除了 followup_events）？ | **合併**（spec 範例就含進廠紀錄） | 兩源 merge 工程量 +0.5 天 |
| **Q7** | KPI 第 5 欄「本月 NPS 平均」用 `responded_at` 還是 `created_at` 取月份切片？ | **`responded_at`**（業務語意正確） | created_at 是 row insert 時間、可能跟回填 NPS 不一致 |
| **Q8** | D+3 自動觸發（工單關閉 +3 天自動建 call_task）— Phase 1 做嗎？ | **不做**（Phase 1 全手動） | Phase 2 增量、可掛 trigger 或 cron |

待回答後進入 CRM03B.1 落地。

---

## 6. 邊界（這份提案沒有涵蓋的事）

- **不處理 D+3 自動觸發**（工單 closed 後 3 天自動建電訪任務）— Phase 2 增量
- **不處理「⚠️ 有不滿」轉客訴單**（升級 ticket / 通知主管）— Phase 2 增量
- **不處理主動撥號**（VoIP / WebRTC）— 純記錄
- **不處理深度 NPS 訪談 wizard**（nps type 也走 inline 快評，深訪內容塞 textarea）
- **不處理 LINE / SMS 提醒**（走既有 notifications hub、後續事件接點：`call_task.scheduled_reminder`）
- **不處理話術編輯**（話術是從 CRM02B 問卷設定來、本頁 readonly）
- **不處理 NPS 看板**（CRM05B 另卡負責）

---

**等 Ming 拍板 Q1-Q8 後動工。**
