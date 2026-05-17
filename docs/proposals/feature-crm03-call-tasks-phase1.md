# CRM03 — 銷售電訪工作台（日期導覽 + tab pills + 話術提示）Phase 1 提案

> 規格：`docs/DUCATI_v2_output/02_客服管理/01_銷售CRM/CRM03A_銷售電訪工作台_v1.html`
> 現行：`src/app/(workspace)/crm/sales/call-tasks/_components/call-tasks-board.tsx`（DataGrid + Detail Page，已升 design pattern）
> 階段：**Phase 1（僅提案、不落地、不寫 code）**
> 日期：2026-05-16
> 對應 BDN 第三輪卡片：CRM03（L、6-8 天）

---

## 1. Spec 實際內容（逐 section）

### 1.1 Header（深藍 52px sticky）

- 左：DUCATI logo + 麵包屑「銷售 CRM › **CRM03A 銷售電訪工作台**」+ v1 badge
- 右：3 顆 hbtn —「← 總覽」「客戶基盤」「**＋ 新增電訪任務**（hbtn-red）」
- 共用 shell 已提供 — header 不重做，3 顆 action 改成 `useSetPageHeader` 的 actions 或 toolbar。

### 1.2 Sub-bar（白底 sticky top:52px，**Phase 1 新增重點**）

由左到右：

| 區段 | 內容 | 行為 |
|------|------|------|
| **date-nav** | `‹` button + `date-label`（2026-05-10, 13px bold #1A3A5C）+ `›` button + 「今天」button | `shiftDate(±1)` / `goToday()`，純前端切日期，filter 走 `scheduled_at::date = $date` |
| sub-divider | — | — |
| **tab-pills** | 全部 / D+3 / D+7 / 邀約活動 / 自訂跟進（5 顆 inline pill，active 深藍底白字） | `setTab(type)` 對應 `call_tasks.metadata.call_type` |
| sub-divider | — | — |
| filter-select × 2 | 全體 RS / 所有 HABC | 客戶端篩選 |
| result-count | 靠右「今日任務：5 筆」 | 即時 reflect filter 結果 |

### 1.3 Sidenav（190px 白底，三段）

| 區段 | 項目（spec 寫死的範例） | 行為 |
|------|----------------------|------|
| 狀態篩選 | 全部任務 (8) ・ 逾期未完成 (2) ・ 今日待跟進 (3) ・ 今日已完成 (2) ・ 未來已排程 (1) | 切 `status` filter |
| 電訪類型 | D+3 即時追蹤 (3) ・ D+7 深度確認 (2) ・ 活動邀約 (2) ・ 自訂跟進 (1) | 切 `type` filter（與 tab-pills 同步） |
| 快速工具 | 客戶基盤 ・ 問卷設定 ・ 開新手卡 | 跳頁 |

每個 nav-item 含 nav-dot 顏色 + 文字 + nav-count chip；active 態 `bg #EAF4FB / text #185FA5 / 粗體`。

### 1.4 Main — 5 欄 KPI summary-row

`grid-template-columns:repeat(5,1fr)`，每張 sum-card 帶左側 3px 色條 + label / 大數字 / 副標：

| 卡片 | 色條 | label | 範例值 | 副標 |
|------|------|-------|--------|------|
| total | navy `#1A3A5C` | 今日全部任務 | 8 | 2026-05-10 |
| urgent | red `#C8001A` | 逾期未完成 | 2 | 需優先處理 |
| today | amber `#F0C97E` | 今日待跟進 | 3 | 本日到期 |
| done | teal `#0F6E56` | 今日已完成 | 2 | 完成率 40% |
| sched | blue `#185FA5` | 未來已排程 | 1 | 近 7 日 |

### 1.5 Main — 電訪卡片列表（卡片化、可折疊展開）

**每張 call-card**（白底圓角 9px、左 3px 狀態色條）：

cc-hdr（點擊整列展開／收合）：
- `cc-expand` chevron（旋轉動畫） ・ `grade-pill` 28×28 H/A/B/C 圓角方塊
- cc-info：上排「客戶姓名 + 電話 + 🏍️ 車型」、下排「👤 RS + 目標 28 字截斷」
- cc-right：右側 type-badge（D+3 紅 / D+7 amber / 邀約 藍 / 報價 teal / 自訂 紫）+ 狀態 badge + 「到期：YYYY-MM-DD」+ 操作 pill 兩顆（📞 記錄通話 / 詳情）

cc-body（折疊展開）：
1. **script-box（深藍底話術提示，Phase 1 新增重點）**
   - script-tag「話術提示 — D+3 追蹤」
   - script-text 12.5px 白字（範例：「陳小姐您好，我是 DUCATI 台北展示中心的陳雅惠⋯」）
   - script-highlights chip 列（要點 chip：「確認分期方案」「詢問決策進度」「提供補充資料」）
2. **prev-calls 歷史接觸時間軸**
   - prev-title「歷史接觸記錄」
   - prev-item：時間軸 dot（teal/blue/amber/red）+ 日期（mono）+ 文字內容
3. **記錄通話表單**（status≠done 才顯示）
   - result-icons：5 顆 pill「✅ 已接通」「📬 留言」「📵 未接聽」「📅 改期」「❌ 結案」（單選色票切換）
   - record-area grid 2 欄：下次跟進日期 input ・ 競品去向 select（BMW / Triumph / MV Agusta / Kawasaki / Yamaha / 中古車行）
   - 通話備註 textarea（跨 2 欄）
   - save-call-row：[略過（今日不跟進）] [💾 儲存通話記錄]

### 1.6 新增電訪任務 Modal

兩欄表單：客戶（從基盤選）・電訪類型（5 選 1）・預定跟進日期 ・ 負責 RS；下方跟進目標 textarea + hint「儲存後系統自動產生對應話術提示」。

---

## 2. 資料缺口 audit

### 2.1 既有 `call_tasks` 表欄位（已備齊）

| 欄位 | 用途 | 狀態 |
|------|------|------|
| `id` / `brand_id` / `kind` | 基礎 | ✅ |
| `customer_id` | 客戶 FK | ✅（join customers 拿 name/phone） |
| `survey_template_id` | 問卷 FK | ✅ |
| `assignee_id` | 負責 RS（uuid） | ✅ 但**沒有 rs_name 顯示欄**，需 join `auth.users` 或 `user_profiles` |
| `scheduled_at` (timestamptz) | 預定撥打 → 日期導覽 filter | ✅ |
| `status` (pending/in_progress/completed/skipped) | KPI 切片 | ✅ 但**沒有 overdue 狀態**（spec 把過了 due 還 pending 視為 overdue） |
| `call_result` (connected/voicemail/noanswer/reschedule/closed) | 記錄通話結果 | ✅ |
| `attempt_count` / `last_attempt_at` | 嘗試次數 | ✅ |
| `answers` (jsonb) | 問卷答案 | ✅ |
| `notes` | 備註 | ✅ |
| `metadata` (jsonb) | 彈性欄 | ✅（會放 call_type / script / highlights / competitor_brand） |

### 2.2 Spec 用到、現行 `call_tasks` **缺**的概念

| Spec 概念 | 落點建議 | typed vs jsonb | 理由 |
|----------|---------|--------------|------|
| **電訪類型 type** (d3/d7/invite/check/custom) | 新增 typed column `call_type text` | typed | 是分頁主鍵、要 index、要報表 group by；5 個 enum 形狀穩 |
| **話術 script** + **要點 highlights[]** | `metadata.script_text` + `metadata.script_highlights[]` | jsonb | 跟 survey_template 一對一綁、純顯示、可能改寫 |
| **跟進目標 goal** | `metadata.goal` | jsonb | 開放式文字、單頁專用 |
| **歷史接觸時間軸** | reuse `followup_events`（已有 case_id/event_type/outcome/body/occurred_at/acted_by_name） | — | **不要再新開表**，followup_events 已就位、銷售/售後共用 |
| **客戶 HABC** | reuse `sales_leads.habc` 或 `customers.metadata.habc` | — | sales_leads 已有 habc text typed；客戶基盤頁 CRM01 已用 |
| **客戶車型 bike** | reuse `customer_vehicles`（join 撈 model） | — | 已有專表 |
| **競品去向 competitor** | `metadata.competitor_brand` | jsonb | 5 個常見品牌 + 自由值，jsonb 比 enum 彈性 |
| **下次跟進日 nextDate** | 已有：儲存後新開一筆 `call_tasks` with new `scheduled_at`（不在當前列改） | — | 跟 spec 邏輯一致：略過 → 自動排 7 天後 |
| **逾期 overdue** | **derived**：`status='pending' AND scheduled_at::date < today` | — | 不存實體欄位，避免每天跑 cron 改 status；query 算 |

### 2.3 跨表 join 需求總結

```sql
call_tasks
  ├─ customers (code, name, phone, habc?)
  ├─ customer_vehicles (model)        -- 拿車型顯示
  ├─ survey_templates (code, name)
  ├─ followup_events                  -- 歷史時間軸，case_id = call_tasks.id 或 customer_id
  ├─ user_profiles or auth.users      -- assignee_id → rs_name
  └─ sales_leads (habc, rs_name)      -- 可選，若客戶尚未轉為 customer
```

⚠️ **`call_tasks.assignee_id → rs_name` 缺一個穩定 join**。現行 board 只顯示 uuid。Phase 1 須拍板：

- 方案 A：join `user_profiles.display_name`（如有）
- 方案 B：寫死 `metadata.rs_name`（不 normalize、demo 期可行）
- 方案 C：寫到 typed column `assignee_name text`（多 1 欄、寫入時同步）

→ **建議方案 B（demo 期）**：跟 `followup_events.acted_by_name` 慣例一致。

---

## 3. 預設架構策略

### 3.1 路由與檔案結構

延用既有：`(workspace)/crm/sales/call-tasks/`
- `page.tsx`（server）— 撈 rows + lookups + counts + 歷史事件
- `_components/call-tasks-board.tsx`（client）— **重寫**：日期導覽 + tab pills + sidenav + KPI + 折疊卡片
- `[id]/page.tsx` — 維持單張詳情頁（複雜的問卷填答還是走 detail page，不擠進折疊）

### 3.2 sidenav（190px）vs shell PagesPanel（240px）— 雙 sidebar 問題

跟 CRM02 同樣的衝突。**遵循 §Workspace Shell Architecture 原則：Stitch sidebar 不照抄**：

- shell 的 PagesPanel 仍負責模組導覽
- spec 上的 sidenav 是「頁面內篩選器」→ **改為 FilterBar 上的 chip 群組或左側 in-page filter column（190px、不 fixed）**
- 「快速工具」3 顆改放 sub-bar 右側 dropdown 或 page header actions

→ **建議**：sidenav 整段拆成
- 狀態切片 → KPI 卡點擊化（5 欄 KPI 兼當「狀態 tab」、點擊切 status filter；spec 本來就 1:1 對應）
- 電訪類型 → 已是 tab pills，不重複
- 快速工具 → 移到頁面右上 actions（「客戶基盤」「問卷設定」「開新手卡」3 個 Link）

省下 190px、跟 CRM02 視覺一致、避免雙 sidebar 套娃。

### 3.3 列表展示：DataGrid vs Card list — **改用卡片**

現行 `call-tasks-board.tsx` 是 DataGrid 表格。spec 是**折疊卡片**（cc-hdr + cc-body 內含話術 + 時間軸 + 通話表單）。

→ **建議：拆雙視圖**
- 預設「卡片視圖」(spec 樣式)
- 提供「表格視圖」toggle（reuse 既有 DataGrid）
- 兩者共用同一筆 fetched data、純 client 切換

理由：DataGrid 處理大量 row 好，但 spec 主打「同頁就地填表」、折疊式 UX 在桌機看是 6-10 筆視野最佳。

### 3.4 KPI 計算（server-side aggregation）

不在 client 算（rows 是分頁 / filtered 後的子集）。在 `getCallTaskListPageData` 加第 3 個 query：

```sql
SELECT
  count(*) FILTER (WHERE status='pending' AND scheduled_at::date < $today) AS overdue,
  count(*) FILTER (WHERE status='pending' AND scheduled_at::date = $today) AS today,
  count(*) FILTER (WHERE status='completed' AND last_attempt_at::date = $today) AS done_today,
  count(*) FILTER (WHERE status IN ('pending','in_progress') AND scheduled_at::date > $today) AS scheduled,
  count(*) AS total
FROM call_tasks
WHERE brand_id=$brand AND kind='sales';
```

回傳 `CallTaskStats` 給 board。`completion_rate` (40%) 純前端算。

### 3.5 話術提示來源（Phase 1 拍板項）

兩條路：

| 方案 | 優點 | 缺點 |
|------|------|------|
| **A：從 `survey_templates.questions` 衍生** | 跟 CRM02 已落地的問卷模板共用、可版本化 | survey_templates.questions 目前是「題目陣列」、沒有 script_text 概念，要擴 schema |
| **B：直接存 `call_tasks.metadata.script_text` + `script_highlights[]`** | 零 schema 改動、可逐單客製 | 沒 normalize、跨單話術重複 |
| **C：新表 `call_scripts`（call_type → script）** | 系統化、可後台管理 | 多一張表、Phase 1 過度設計 |

→ **建議方案 B + 後續延伸 A**：Phase 1 把話術塞 `metadata.script_text` / `script_highlights[]`，由「新增電訪任務」時依 `call_type` 帶入預設範本（前端常數）；後續 CRM02 升級成「問卷帶話術」時再 promote 到 survey_templates。

### 3.6 歷史接觸時間軸（reuse followup_events）

`followup_events` 表結構正好 fit：

```ts
type FollowupEvent = {
  case_id: uuid       // ← 用 call_tasks.id 或 customer_id
  event_type: text    // 'call' / 'visit' / 'sms' / 'line'
  outcome: text       // 'connected' / 'voicemail' / 'visited' / ...
  body: text          // 內容
  occurred_at: timestamptz
  acted_by_name: text
  metadata: jsonb
};
```

→ **設計**：`case_id` 存 `customer_id`（不是 task_id），這樣同個客戶歷代電訪／到店／LINE 都串得起來。每次 `saveCall` 寫 1 筆 followup_event；列表頁撈當前 task 的 customer 最近 10 筆事件 join 進來。

⚠️ 需確認既有 followup_events 用法（aftersales 是不是已經用了不同 case_id 慣例）— 列入 Q4。

### 3.7 日期導覽 filter 加進 URL

`?date=2026-05-10` 推進 URL，shifts/today 用 `router.push` 不要純 state — 便於分享連結 & refresh。

---

## 4. 落地拆分

| 子任務 | 範圍 | 預估 |
|--------|------|------|
| **CRM03.1** — Schema migration | 加 `call_tasks.call_type text`、index `(brand_id, kind, scheduled_at)`；補 indian seed 8 筆雙 call_type 範例（D+3/D+7/邀約/自訂） | 0.5 天 |
| **CRM03.2** — Domain helper 擴充 | `getCallTaskListPageData`: 加 `date` / `call_type` filter、回傳 `stats`、join `customer_vehicles.model`、join `followup_events`（最近 10 筆）；helper 函式 `getCallScriptTemplate(call_type)` 回預設話術 + highlights | 1 天 |
| **CRM03.3** — Board UI 重構（卡片視圖 + 折疊） | sub-bar 日期導覽 + tab pills（5 顆 + URL sync）・KPI 5 欄（點擊切 status）・卡片列表 + 折疊 body（話術 box + 時間軸 + 通話表單）・空狀態 ・表格／卡片 toggle | 2-3 天 |
| **CRM03.4** — saveCall server action 強化 | 寫 1 筆 followup_event（event_type='call', outcome=call_result, body=notes）+ 更新 task 狀態 + 若有 nextDate 則 insert 新 task（chained）；transactional | 1 天 |
| **CRM03.5** — 新增電訪任務 Modal + 話術自動帶入 | reuse 既有 `new/page.tsx` 邏輯改成 Modal；送出後依 call_type 把預設 script_text / highlights 寫進 metadata | 1 天 |
| **驗證** | tsc 0 / eslint 0 / E2E: 日期切換 / tab 切換 / KPI 對齊 / 卡片展開 / saveCall / skipCall / 排程下次 / 表格／卡片切換 | 0.5 天 |
| **合計** | | **6-8 天**（對齊 BDN 估時 L） |

---

## 5. 待 Ming 拍板

| # | 議題 | 選項 | 推薦 |
|---|------|------|------|
| **Q1** | 列表用卡片視圖（spec 樣）還是 DataGrid，還是雙視圖切換？ | A 純卡片 / B 純表格 / C 雙視圖 toggle | **C** |
| **Q2** | 話術提示來源（§3.5） | A 衍生自 survey_templates / B 存 call_tasks.metadata / C 新表 call_scripts | **B**（Phase 1） |
| **Q3** | sidenav 190px 處置（§3.2） | A 照 spec 做（會有雙 sidebar） / B 拿掉、KPI 兼當 status tab + tools 移到 actions | **B** |
| **Q4** | `followup_events.case_id` 用哪個 ID？ | A 用 customer_id（跨單共享） / B 用 call_tasks.id（任務隔離） | **A**（跨單時間軸最自然） |
| **Q5** | `assignee_id → rs_name` 顯示 | A join user_profiles / B 寫死 metadata.rs_name / C typed column | **B**（demo 期） |
| **Q6** | KPI「完成率 40%」分母怎麼算？ | A 今日全部任務 / B 今日待跟進+已完成 / C overdue+today+done | **A**（最直觀） |
| **Q7** | 日期導覽切到非今天時，KPI 卡的「逾期未完成」要不要動？ | A 永遠相對 today 算 / B 相對選取日 | **A**（逾期是時間概念、不該變） |
| **Q8** | 「電訪類型 type」要 typed column 還是 enum？ | A typed text + check constraint / B postgres enum / C metadata.call_type jsonb | **A**（穩定 5 值 + 要 index） |

待回答後進入 CRM03.1 落地。

---

## 6. 邊界（這份提案沒有涵蓋的事）

- 不處理「主動撥號」（VoIP / WebRTC 整合）— 純記錄
- 不處理「自動排程下次跟進的 cron job」— 由 saveCall 同步創新 task，沒有定期掃描
- 不處理「LINE / SMS 通知」— 走既有 notifications hub（後續事件接點：`call_task.scheduled_reminder`）
- 不處理 i18n（系統現階段只有繁中）
- 不處理問卷答案 inline 填答（仍走 detail page，本頁只記錄通話結果）

---

**等 Ming 拍板 Q1-Q8 後動工。**
