# CRM04 — 銷售休眠戰敗管理（3-tab 重排 + 喚醒計畫 + 再接觸排程）Phase 1 提案

> 規格：`docs/DUCATI_v2_output/02_客服管理/01_銷售CRM/CRM04A_銷售休眠戰敗管理_v1.html`
> 現行：`src/app/(workspace)/crm/sales/dormant-leads/_components/dormant-leads-board.tsx`（610 行 / 已用 `<DataGrid>` + 5 張 KPI + 兩張橫條圖）
> 階段：**Phase 1（僅提案、不落地、不寫 code）**
> 日期：2026-05-16
> 對應 BDN 第三輪卡片：CRM04（S–M，1–2 天）

---

## 1. Spec 實際內容（3 tab 切分）

CRM04A spec 把現行「**單頁夾雜：KPI + 戰敗原因/競品分佈 + 列表**」整理成 **3 個 tab**，主軸換成「行為分階段」：

### Tab 1 — 💤 休眠客戶管理

- **4 張 KPI**（**新增「休眠天數分桶」**）
  - 休眠總數（超過 60 天未互動，navy）
  - 30–60 天（amber，「早期休眠，喚醒機率較高」）
  - 60–90 天（red，「需主動出擊」）
  - 90 天以上（deep-red，「高流失風險，建議活動喚醒」）
- **Filter Bar**：休眠天數（30/60/90）× HABC × 負責 RS × 搜尋；右側「匯出名單」
- **Header row**：客戶 / 最後互動 / HABC / 休眠天數 / 負責 RS
- **客戶列**：grid（1fr/120/100/110/120/auto）— 每列含休眠 badge（sb-30 amber / sb-60 red / sb-90 darkred）+ 操作 pill「電訪 / 排程」
- 點列 → 前往電子手卡

### Tab 2 — ❌ 戰敗原因分析

- **4 張 KPI**：本月戰敗 / 本季戰敗 / 最高戰敗原因（含 %）/ 最高競品（含 %）
- **兩欄 panel**：戰敗原因分佈橫條圖 + 競品流向分佈橫條圖（**現行已實作 BreakdownCard，視覺對齊即可**）
  - 競品 panel 底下多一條建議 callout：「💡 BMW 流失主因多為『騎乘姿勢舒適性』，可強化 Monster/Multistrada 試駕體驗對比」（**文案 hard-coded 或 metadata 可選**）
- **戰敗記錄明細 panel**：右上篩選原因下拉；每列 grid（1fr/120/120/80/auto）含 reason badge + 競品名 + 「再接觸」操作 pill

### Tab 3 — 🔄 再接觸排程（**Spec 全新增**）

- **頂部 amber callout**：「⚡ 再接觸原則：休眠 30 天 → 活動邀請簡訊；60 天 → RS 電話關懷；90 天以上 → 主管確認後最後接觸，無回應轉長期休眠」
- **本週待再接觸清單 panel**：右上 amber chip「N 件待處理」；每列 grid（1fr/110/100/80/120/auto）含「🔴 客戶名（90 天以上紅底）」「接觸方式 badge」「mono 日期」「RS」「note」+ 操作「✅ 完成 / 📅 改期」
- **手動新增再接觸任務 panel**：2 欄表單
  - 客戶姓名（搜尋輸入）
  - 接觸方式 select（📞 電話關懷 / 📱 LINE / 📧 E-mail / 🎟️ 活動邀請（Track Day/DRE）/ 🏍️ 新車款發表邀請）
  - 預定日期（date input）
  - 負責 RS（select）
  - 接觸備注（textarea，跨 2 欄）
  - 底部 [取消][確認排程]

---

## 2. 資料缺口 audit（DB 已查）

| 需求 | 現有？ | 位置 |
|------|--------|------|
| `dormancy_status` (active/dormant/lost/revived/converted) | ✅ | `sales_leads.dormancy_status` text NOT NULL |
| `lost_reason` text | ✅ | `sales_leads.lost_reason` |
| `competitor_brand` text | ✅ | `sales_leads.competitor_brand` |
| `lost_at` | ✅ | `sales_leads.lost_at` |
| `revive_attempt_count` / `last_revive_at` / `next_revive_at` | ✅ | `sales_leads.*` |
| `last_visit_at` (= 計算休眠天數的時間基準) | ✅ | `sales_leads.last_visit_at` date |
| `metadata jsonb` | ✅ | `sales_leads.metadata` |
| 戰敗原因分佈 / 競品流向（已存在 BreakdownCard） | ✅ | `dormant-leads-board.tsx` |
| 休眠分桶 KPI（30/60/90） | ❌ derive | 用 `last_visit_at` + `current_date` 計算 |
| **再接觸排程列表** | ✅ 重用 | **`call_tasks` 表（已存在）** |
| 喚醒計畫多步驟編輯器 | ❌ 新功能 | 建議 `sales_leads.metadata.awakening_plan` jsonb |
| 本月已喚回 KPI | ✅ derive | `revive_attempt_count > 0 AND last_revive_at >= date_trunc('month', now())` |

### DB 現況實測（brand_id='indian'）

| 指標 | 數值 |
|------|------|
| dormant 筆數 | 4 |
| lost 筆數 | 5 |
| 30–60 天分桶 | 2 |
| 60–90 天分桶 | 0 |
| 90 天以上分桶 | 2 |
| distinct lost_reason | 5 |
| distinct competitor_brand | 3 |
| `metadata.awakening_plan` 已有？ | 全部 false（待補 fixture） |

→ **不需要新 schema**。typed core 已齊；喚醒計畫走 `metadata.awakening_plan` jsonb；再接觸排程走 `call_tasks` 新 kind。

### 既存 `call_tasks` 表欄位（spec Tab 3 完美對映）

```
id / brand_id / kind / customer_id / survey_template_id / assignee_id
/ scheduled_at / status / call_result / attempt_count / last_attempt_at
/ answers jsonb / notes / metadata jsonb / created_by / created_at / updated_at
```

`customer_id` 可指向 `sales_leads.id` 或 `customers.id`（POC 階段 schema 沒掛 FK constraint，靠 helper 控制）。

---

## 3. 預設架構（待 Ming 拍板）

### 3.1 Tab 切換 — board 內 `useState`、不走 URL

理由：
- 現行 `dormant-leads-board` 有 `kind` prop（sales / aftersales），URL 已被 `kind` shell 化（同元件給 `/crm/sales/dormant-leads` 跟 `/crm/aftersales/dormant-customers` 共用）。再加 `?tab=` 會跟 filter 的 `?status / ?habc / ?reason / ?q` 互相覆寫，複雜度暴增。
- spec 的 tab 切換是純前端視覺切換，沒有跨 session 分享 link 的需求。
- 進一步好處：3 個 tab 共用同一份 `rows`（已撈過的 sales_leads），靠 client 過濾分桶呈現，省一個 round-trip。

```tsx
const [tab, setTab] = useState<"dormant" | "lost-analytics" | "recontact">("dormant");
```

### 3.2 休眠分桶 KPI — derive from `last_visit_at`

加在現行 `getSalesDormantLeadStats` query 或 board 端 derive（rows 已含 `dormant_days`）：

```ts
// helper：buckets 從 rows 直接算
const bucket30_60 = rows.filter(r => r.dormancy_status === 'dormant' && r.dormant_days! >= 30 && r.dormant_days! < 60).length;
const bucket60_90 = rows.filter(r => r.dormancy_status === 'dormant' && r.dormant_days! >= 60 && r.dormant_days! < 90).length;
const bucket90plus = rows.filter(r => r.dormancy_status === 'dormant' && r.dormant_days! >= 90).length;
```

⚠️ **注意**：rows 是「篩選後 + paginated」結果，全集 KPI 必須走 server stats（現行 `stats` 是全集，新增分桶欄位即可）。建議擴 `DormantLeadStats` type：

```ts
type DormantLeadStats = {
  // 既有
  totalDormantOrLost: number;
  dormantCount: number;
  lostCount: number;
  revivedThisMonth: number;
  topLostReason: { reason: LostReason | null; count: number };
  reasonBreakdown: Array<{ reason: LostReason; count: number; pct: number }>;
  competitorBreakdown: Array<{ brand: string; count: number; pct: number }>;
  // 新增
  bucket30_60: number;
  bucket60_90: number;
  bucket90plus: number;
};
```

### 3.3 喚醒計畫（Tab 3 「手動新增再接觸任務」單筆視角）

⚠️ **這題有 2 條路、待 Ming 拍板**（見 §5 Q1）

**選項 A（建議，POC 適用）**：用 `call_tasks` 表 + 新 `kind='recontact'`

```sql
-- 不用 migration、純擴展 enum-like text 欄位
INSERT INTO call_tasks (brand_id, kind, customer_id, assignee_id, scheduled_at, status, notes, metadata)
VALUES ('indian', 'recontact', '<lead.id>', '<rs_user.id>', '2026-05-15 10:00+08', 'pending',
  '<備註>',
  '{"contact_method": "phone", "lead_id": "<lead.id>"}'::jsonb);
```

- 優點：表已有、call_tasks board / detail page 已存在、可共用 `markCallTaskDone` 之類的 action；Tab 3 列表 = 該 lead 的 call_tasks where kind='recontact'。
- 缺點：`customer_id` 在 lead 流程其實是 `lead.id`，命名要靠 helper 抽 facade（`createRecontactTask({ leadId, ... })`）。
- 「再接觸方式」走 `metadata.contact_method`，列舉 `phone | line | email | event_invite | new_model_event`。

**選項 B**：在 `sales_leads.metadata.awakening_plan` 塞多步驟計畫

```jsonb
{
  "awakening_plan": {
    "status": "active" | "completed" | "abandoned",
    "created_by": "<user_id>",
    "created_at": "2026-05-16T...",
    "steps": [
      { "at": "2026-05-15", "action": "phone", "note": "確認分期方案", "done": false },
      { "at": "2026-05-22", "action": "event_invite", "note": "Track Day 邀請", "done": false }
    ]
  }
}
```

- 優點：一個 lead 一份計畫、跟 lead 強綁定、不污染 call_tasks 跨模組視野。
- 缺點：跨 lead 的「本週待接觸」聚合要 jsonb scan，效能差；call-tasks 工作台不會自然看到這些 recontact。

**建議**：**選 A**（call_tasks 重用），原因——
1. spec Tab 3 的「本週待再接觸清單」本質就是 call task list、不是 plan view
2. 已有 CRM03 電訪工作台 page，recontact 任務自動進電訪工作台，動線更順
3. 「多步驟喚醒計畫」實際就是「多筆 call_tasks 共享 lead_id」，metadata 可選掛 `wave_id` 串連
4. POC 階段不要過早抽象「Plan + Steps」雙表

### 3.4 視覺微調對齊 spec

- KPI 卡：從現行 5 張橫排 → 拆兩列
  - Tab 1 上方：4 張（休眠總數 / 30–60 / 60–90 / 90+）
  - Tab 2 上方：4 張（本月戰敗 / 本季戰敗 / 最高戰敗原因 / 最高競品）
- 戰敗原因 / 競品流向 BreakdownCard：色票對齊（價格 red / 延後 amber / 競品 blue / 家人 olive / 喜好改變 gray / 其他 lightgray）— 現行用單一 navy 條，要加 color map by reason key
- 競品 panel 底下加 callout：用 `stats.topCompetitor.brand` 動態文字（spec 是 hard-coded BMW 文案；建議用 const map「{ BMW: '騎乘姿勢舒適性', KTM: '越野規格', ... }」）
- Tab 1 「客戶列」現行已用 DataGrid，**不換成 spec 的 cust-row** — DataGrid 視覺等價、且支援欄位選擇/排序/匯出，回退手刻 grid 是降級
- Tab 1 列尾操作：現行「再接觸 / 詳情 / 刪除」→ 改成「電訪 / 排程 / 詳情」對齊 spec
  - 電訪 → `<Link href="/crm/sales/call-tasks/new?lead_id=...">`
  - 排程 → 跳 Tab 3 + 開「新增再接觸任務」modal（lead 預填）
  - 詳情保留

---

## 4. 落地拆分（CRM04.1 ~ CRM04.4）

### CRM04.1 — 3 tab 切換 + 視覺對齊（XS，0.3 天）

- Board 加 `tab` state + 3 顆 tab btn（h-[40px] / active border-b navy / 對齊 spec 樣式）
- KPI 區 conditional render（tab 1 = 休眠分桶 / tab 2 = 戰敗 / tab 3 隱藏 KPI）
- 篩選 bar / DataGrid / BreakdownCard 依 tab 顯示對應內容
- 既有 5 張 KPI 改成 4 + 4 拆 tab
- BreakdownCard 加 `colorByKey` 支援多色橫條
- 競品 callout（hard-coded 文案 map）

### CRM04.2 — 休眠分桶 KPI（XS，0.2 天）

- `DormantLeadStats` 擴 `bucket30_60 / bucket60_90 / bucket90plus`
- `src/lib/sales/sales-dormant-leads-queries.ts`（or `@/domain/sales-dormant-leads.ts`）的 stats query 加 3 個 `count(*) FILTER (WHERE last_visit_at < current_date - 30 AND last_visit_at >= current_date - 60)` 等
- KPI 卡：Tab 1 直接讀 stats 對應欄位

### CRM04.3 — 喚醒計畫（再接觸任務 — 走 call_tasks）（S，0.5 天）

- 新 helper `@/domain/sales-recontact.ts`：
  - `listRecontactTasksThisWeek({ leadId? })`
  - `createRecontactTask({ leadId, contactMethod, scheduledAt, assigneeId, notes })`
  - `markRecontactDone(taskId)` / `rescheduleRecontact(taskId, newDate)`
- 內部寫 `call_tasks` table、`kind='recontact'`、`metadata.lead_id`、`metadata.contact_method`
- Tab 3 「手動新增再接觸任務」表單 + server action
- 「本週待再接觸清單」列表（fetch call_tasks where kind='recontact' AND scheduled_at BETWEEN now()..+7d）
- 列尾「✅ 完成 / 📅 改期」按鈕 wire 到 helper

### CRM04.4 — 再接觸排程列表 + Tab 1 列尾操作改造（XS，0.3 天）

- Tab 1 列尾 3 顆 button：電訪（跳 call-tasks/new）/ 排程（切 Tab 3 + 預填）/ 詳情
- Tab 3 列表完整體驗（urgent flag、操作 pill、note 截斷）
- Tab 2 「戰敗記錄明細」panel：篩選下拉 + 列尾「再接觸」按鈕（也 fire CRM04.3 的 createRecontactTask）

**總計 1.3 天工**，跟 BDN 估算「S–M, 1-2 天」吻合。

---

## 5. 待 Ming 拍板（Q1–Q4）

### Q1 — 喚醒計畫落點：`call_tasks` 重用 還是 `metadata.awakening_plan` 自建？（**最關鍵**）

我建議走 **call_tasks + kind='recontact'**（理由詳見 §3.3）。

- 動線：客戶提需求 → 在 CRM04 Tab 3 開排程 → 自動進電訪工作台 → SA 跑日常 daily call
- 不需要 schema 變更
- 「多步驟計畫」自然展開成多筆 task（同 `metadata.lead_id` 串連）

如果 Ming 想保留「lead 上一份正式 Plan 物件 + 多 step」的結構（例如要做喚醒模板套用），改走 metadata.awakening_plan 也行 — 但這是 spec 沒明說的擴張，POC 階段不建議。

### Q2 — Tab 切換要不要記 URL？

我建議 **不記**（board 內 `useState`），理由詳見 §3.1。
反方理由：如果未來要從 dashboard 跳「直接看戰敗分析」`?tab=lost-analytics`，URL 就有用。

若要保留 URL，建議用 hash `#tab=lost-analytics`（不跟現有 query string 干涉）。

### Q3 — 「最高戰敗原因 / 最高競品」KPI 是「本季」還是「全期」？

spec Tab 2 KPI label 寫「本月戰敗 / 本季戰敗」、原因卻寫「最高戰敗原因（佔 38%）」沒寫期間。現行 `topLostReason` 是全期累計。

建議：KPI 加期間範圍下拉（本月 / 本季 / 全期），預設本季；原因/競品 breakdown 也跟著切。
Phase 1 簡化版：先全部用本季（2026 Q2），不加切換。

### Q4 — 「再接觸方式」enum 是否要長期化？

spec 列了 5 種：📞 電話關懷 / 📱 LINE / 📧 E-mail / 🎟️ 活動邀請（Track Day/DRE）/ 🏍️ 新車款發表邀請。

選項：
- **(a)** 寫死在 `@/domain/sales-dormant-leads.constants.ts` 的 `RECONTACT_METHODS` map（POC 適合）
- **(b)** 走 `business_rules` 表的 `rule_kind='recontact_method'`（為將來其他 brand 客製化準備、但 over-eng）

我建議 **(a)** — 先寫死，使用者真的要客製再 promote。

---

## 6. 不在 Phase 1 範圍

- 自動排程演算法（「30 天到 → 自動建 SMS 任務」）→ 屬 cron / hook 範疇，未來 CRM06 自動行銷模組做
- 喚醒模板（「Track Day 邀請模板」「年式發表模板」一鍵套用）→ Phase 2
- 戰敗轉長期休眠歸檔（90 天無回應）→ Phase 2 / 走 batch job
- LINE / SMS 真實發送 → 走既有 notifications hub，等 use case 明確再接

---

## 7. 落地前 audit checklist（給 Phase 2 用）

```bash
# 1) UI 不直連 supabase
grep -rn "@/lib/supabase" \
  "src/app/(workspace)/crm/sales/dormant-leads" \
  src/components/dormant-leads 2>/dev/null  # 預期 0 hit

# 2) call_tasks 用 helper、不亂寫
grep -rn 'from(.call_tasks.)' "src/app/(workspace)/crm" 2>/dev/null  # 預期 0 hit

# 3) Indian fixture：建立 4-6 筆 awakening recontact tasks（kind='recontact', brand_id='indian'）
#    驗收：Tab 3「本週待接觸」≥ 3 件
```

---

## 8. Ming review 點

- [ ] **Q1 喚醒計畫落點**（call_tasks vs metadata）→ 建議 call_tasks
- [ ] **Q2 Tab 切換 URL**（要 / 不要）→ 建議不要
- [ ] **Q3 KPI 期間**（本季 / 全期 / 切換）→ 建議先寫死本季
- [ ] **Q4 再接觸方式 enum 落點**（constants vs business_rules）→ 建議 constants
- [ ] 拍板 CRM04.1 ~ CRM04.4 拆題顆粒度 OK 不 OK
- [ ] 確認「Tab 1 客戶列保留 DataGrid、不換成 spec cust-row」是合理 trade-off

拍板後 Phase 2 落地，預估 1.3 天工。
