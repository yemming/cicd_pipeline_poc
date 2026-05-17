# CRM04B — 售後休眠流失管理（3-tab + 喚醒計畫 + 再接觸排程）Phase 1 提案

> 規格：`docs/DUCATI_v2_output/02_客服管理/02_售後CRM/CRM04B_售後休眠流失管理_v1.html`
> 現行：`src/app/(workspace)/crm/aftersales/dormant-customers/page.tsx`（thin wrapper、重用銷售側 `DormantLeadsBoard` + 同一張 `sales_leads` 表 + `kind='aftersales'`）
> 階段：**Phase 1（僅提案、不落地、不寫 code）**
> 日期：2026-05-16
> 對應 BDN 第三輪卡片：CRM04B（L，5-7 天）

---

## 0. TL;DR — 為什麼這題比 CRM04 重

CRM04（銷售側）做完拿來 reuse，但 **CRM04B 的資料模型其實跟 CRM04 不同**：

| 維度 | CRM04（銷售） | CRM04B（售後） |
|------|---------------|----------------|
| 主資料源 | `sales_leads kind='sales'` | **`customer_vehicles` + `sales_leads kind='aftersales'`（雙來源）** |
| 「休眠」定義 | `dormancy_status` typed column（業務手動標） | **`next_service_due_date < current_date`** derive（系統自動算逾期天數） |
| 分桶 | 30-60 / 60-90 / 90+ | **30-60 / 60-120 / 120+**（120 天才算嚴重，週期長） |
| 流失原因 | typed enum：價格 / 競品 / 延後 / 喜好改變 / 家人 / 其他 | **derive**：逾期保養 / 低 NPS / 保固到期 / Desmo 超期 / 多次未接通 / 其他 |
| NPS 連動 | 無 | **必須**（Tab 2 「低 NPS 客戶追蹤」要拉 `nps_responses.score≤6`） |
| 車輛資訊 | 無（只有 lead.intent_model） | **必須**（顯示車牌 / Diavel V4 / 上次進廠 / 下次建議回廠） |
| BDN 估時 | S–M, 1-2 天 | **L, 5-7 天**（資料模型重新對齊 + 多源 join + NPS panel） |

**現行頁面（thin re-export 銷售側 board）是錯位**：售後場景的核心不是「lead 戰敗原因」、是「車主超過保養週期沒回廠」。Phase 2 要砍掉重練，不是改 props。

---

## 1. Spec 實際內容（3 tab 切分）

### Tab 1 — 💤 逾期未回廠管理

**4 張 KPI**（休眠天數分桶）：
- 逾期未回廠總數（navy）
- 30-60 天逾期（amber，「早期流失，喚醒機率高」）
- 60-120 天逾期（red，「需積極聯繫」）
- 120 天以上嚴重（red，「高流失風險，需主管介入」）

**Filter Bar**：逾期天數（30/60/120）× 風險等級（critical/high/mid）× SA × 搜尋（姓名/車牌）；右側「匯出名單」

**列表**：grid `1fr/100/120/120/100/100/auto`，每列：
- 客戶 / 車輛（姓名 + 車牌 · 車款 + 流失原因 chip 多選）
- 負責 SA
- 上次進廠（mono date）
- 下次建議回廠（mono date，逾期則紅字）
- 逾期天數 badge（sb-90 暗紅 120+ / sb-60 紅 60-120 / sb-30 amber 30-60 / sb-low blue <30 / b-teal 未逾期）
- 流失風險 badge（critical 暗紅 / high 紅 / mid amber / low teal）
- 列尾「電訪」「排程」操作 pill

點列 → 跳 CRM01B 客戶基盤。

### Tab 2 — 📊 流失風險分析

**4 張 KPI**：本月新增流失風險 / 低 NPS（≤6）客戶 / 主要流失原因（含 %）/ 本月喚醒成功

**兩欄 panel**：
- **流失風險原因分佈橫條圖**（6 類：逾期保養 / 低 NPS / 保固到期 / Desmo 超期 / 電訪未接通 / 其他，各自色票）+ 底部 callout「💡 逾期保養為主因，建議將 CRM03B 回廠提醒電訪週期縮短為逾期 30 天即啟動」
- **低 NPS 客戶追蹤**（NPS ≤6 的客戶 list，每列含 NPS 分數圓 chip + 客戶名 + 不滿原因 + 操作「主管關懷 / 記錄補救」）+ 底部 callout「💡 SA 主管於 NPS≤6 的 3 個工作天內主動致電」

**月度趨勢 panel**：近 6 個月逾期數柱狀圖（spec hard-coded 8/10/13/16/11/9/7、五月趨勢改善）

### Tab 3 — 🔄 喚醒再接觸排程

**頂部 amber callout**：「⚡ SA 側喚醒原則：逾期 30 天 → CRM03B 自動建立回廠提醒電訪任務；60 天 → SA 主動電話關懷；90 天 → 主管介入確認後執行最後接觸；120 天以上 → 標記長期休眠，轉入存檔管理，不再主動推送」

**本週待再接觸清單 panel**：grid `1fr/120/100/80/130/auto`，每列含 urgent flag（紅底）+ 逾期天數 + 接觸方式 badge（電話 / LINE / SMS / E-mail / 活動邀請）+ 排程日期 + SA + note + 「✅ 完成 / 📅 改期」

**SA 喚醒計畫模板 panel**（3 個 plan-box 階段卡）：
- ⏰ 30-60 天逾期：主動提醒階段（3 步驟：CRM03B 自動建立電訪 → LINE/SMS 推播 → 客戶回應協助預約）
- 🔴 60-120 天逾期：積極介入階段（4 步驟：SA 主動關懷 → 不滿則主管介入 → 費用顧慮推套餐 → Desmo/保固到期強調風險）
- ⬜ 120 天以上：最後接觸 / 存檔（3 步驟：主管確認後最後接觸 → 無回應標長期休眠 → 每季店長檢視）

**手動新增再接觸任務 panel**：2 欄表單
- 客戶姓名 / 車牌搜尋
- 接觸方式 select（📞 電話關懷 / 📱 LINE-SMS 推播 / 📧 E-mail / 🎟️ 活動邀請（騎士節/DRE）/ 🔧 免費車況健檢邀請 / 🛡️ 保固到期通知 / ⚙️ Desmo 到期提醒）
- 預定接觸日期
- 負責 SA
- 接觸切入點 / 備注（textarea，跨 2 欄）
- 底部 [取消][確認排程] → 提示「✅ 已加入 CRM03B 電訪工作台」

---

## 2. 資料缺口 audit（DB 已查 — 2026-05-16）

### 2.1 typed column 對映表

| Spec 需求 | 來源表 / 欄位 | 現況 |
|----------|--------------|------|
| 上次進廠 | `customer_vehicles.last_service_date` | ✅ 5/5 indian vehicles 有值 |
| 下次建議回廠 | `customer_vehicles.next_service_due_date` | ✅ 5/5 indian vehicles 有值 |
| 逾期天數 | `current_date - next_service_due_date` derive | ✅ |
| 客戶姓名 / 車牌 / 車款 | `customers.name` + `customer_vehicles.license_plate` + `vehicle_models.name` | ✅ |
| 保固到期 | `customer_vehicles.warranty_until` | ✅ 5/5 indian vehicles 有值 |
| NPS 分數 | `nps_responses.score` (smallint) + `customer_id` | ✅ schema 齊；indian fixture 數量待驗 |
| NPS 不滿原因 | `nps_responses.comment` | ✅ |
| SA / 負責業務 | `customer_vehicles.preferred_technician_id` (uuid) 或 `customers.assignee_id` | ⚠️ spec 講的「SA」對映不明（見 §5 Q1） |
| 喚醒計畫 / 再接觸任務 | `call_tasks` 表 + `kind='aftersales'` 已用 | ✅ 14 筆 call_tasks 中 6 筆 aftersales（fixture 已存在） |

### 2.2 derive 邏輯（無需新 schema）

```ts
// 逾期天數
overdue_days = max(0, current_date - vehicle.next_service_due_date)

// 風險等級（derive，不存 typed）
risk = critical if overdue_days >= 120 OR last_nps_score <= 5
     : high     if overdue_days >= 60  OR Desmo_overdue OR warranty_expired
     : mid      if overdue_days >= 30  OR last_nps_score <= 6
     : low      otherwise

// 流失原因 chip（多選 derive）
reasons = [
  'rt-maint'    if overdue_days >= 30,
  'rt-nps'      if exists nps_response with score <= 6 in last 90d,
  'rt-warranty' if warranty_until < current_date OR warranty_until - current_date < 30 days,
  'rt-desmo'    if vehicle.metadata.desmo_due_date < current_date,   // ⚠️ 見 §5 Q2
  'rt-silent'   if call_tasks.attempt_count >= 3 AND status IN ('failed','skipped'),
]
```

### 2.3 DB 實測（brand_id='indian'）

| 指標 | 數值 | 備註 |
|------|------|------|
| `customer_vehicles` 總數 | 5 | fixture 偏少 |
| 有 `last_service_date` | 5 | ✅ |
| 有 `next_service_due_date` | 5 | ✅ |
| **目前已逾期**（next_service_due_date < today） | **1** | 只有 IMC-003，overdue 21 天 |
| `call_tasks kind='aftersales'` | 6 | ✅ 含各 status |
| `nps_responses` 樣本 | 待補驗 | schema 齊、indian 數量未確認 |

⚠️ **fixture 量太薄**：要 demo 3-tab + 分桶 + NPS + 喚醒計畫，至少要：
- 5+ 台 indian customer_vehicles 逾期（覆蓋 30-60 / 60-120 / 120+ 三桶）
- 5+ 筆 indian nps_responses score≤6
- 7+ 筆 indian call_tasks kind='aftersales' status='pending' 落在本週

### 2.4 不需要的東西

- ❌ 不開新表
- ❌ 不加 typed column（風險 / 流失原因都 derive）
- ❌ 不動 sales_leads（現行 thin wrapper 用 sales_leads 是錯位、Phase 2 改用 customer_vehicles）

---

## 3. 預設架構（待 Ming 拍板）

### 3.1 主資料源換軌：customer_vehicles 取代 sales_leads kind='aftersales'

**核心決策**：CRM04B 不 reuse 銷售側 `DormantLeadsBoard`。

理由：
1. spec 列表第一欄是「車牌 + 車款」，不是 lead.intent_model
2. spec「上次進廠 / 下次建議回廠 / 逾期天數」直接對映 `customer_vehicles` typed column、不需要套 sales_leads.last_visit_at 的 fallback chain
3. 售後 NPS / 保固 / Desmo 都掛在「車」上，不是 lead 上
4. 現行 thin wrapper 撈到的 6 筆 `sales_leads kind='aftersales'` 其實是「售後 leads / 意向」概念（fixture 命名 AL20260515xxx），跟「現有車主回廠管理」是兩件事

**新 helper**：`@/domain/aftersales-dormant.ts`

```ts
export type AftersalesDormantRow = {
  id: string;                          // customer_vehicle.id
  customer_id: string;
  customer_name: string;
  license_plate: string | null;
  bike_model: string | null;           // vehicle_models.name
  preferred_sa: string | null;         // preferred_technician.name 或 customer.assignee
  last_service_date: string | null;
  next_service_due_date: string | null;
  overdue_days: number;                // derive: max(0, today - next_due)
  warranty_until: string | null;
  warranty_status: 'valid' | 'expiring' | 'expired';   // derive
  last_nps_score: number | null;
  last_nps_comment: string | null;
  risk: 'critical' | 'high' | 'mid' | 'low';           // derive
  reasons: AftersalesDormantReason[];                  // derive 陣列
};

export type AftersalesDormantStats = {
  totalOverdue: number;
  bucket30_60: number;
  bucket60_120: number;
  bucket120plus: number;
  newRisksThisMonth: number;
  lowNpsCount: number;
  topReason: { key: AftersalesDormantReason; count: number; pct: number };
  revivedThisMonth: number;
  reasonBreakdown: Array<{ key: AftersalesDormantReason; count: number; pct: number }>;
  monthlyOverdueTrend: Array<{ month: string; count: number }>; // 近 6 個月
};

export async function listAftersalesDormant(filters: AftersalesDormantFilters): Promise<AftersalesDormantRow[]>
export async function getAftersalesDormantStats(): Promise<AftersalesDormantStats>
export async function listLowNpsCustomers(limit?: number): Promise<LowNpsRow[]>
```

### 3.2 喚醒計畫策略 — 完全 reuse CRM04 拍板的 call_tasks 策略

**復用 CRM04 §3.3 選項 A**：用 `call_tasks` 表 + `kind='aftersales'` + `metadata.contact_method` + `metadata.subkind='recontact'`。

差異：
- CRM04 是 `kind='recontact'`、CRM04B 是 `kind='aftersales' + metadata.subkind='recontact'`（因為售後本來就有 `kind='aftersales'` call_tasks 在跑回廠提醒，不能再加新 kind 污染既有工作台）
- 也可考慮新 `kind='aftersales_recontact'`、Phase 2 再決（見 §5 Q3）

新 helper `@/domain/aftersales-recontact.ts`：

```ts
export type AftersalesContactMethod =
  | 'phone'                   // 📞 電話關懷
  | 'line_sms'                // 📱 LINE / SMS 推播
  | 'email'                   // 📧 E-mail
  | 'event_invite'            // 🎟️ 活動邀請（騎士節 / DRE）
  | 'free_inspection'         // 🔧 免費車況健檢邀請
  | 'warranty_reminder'       // 🛡️ 保固到期通知
  | 'desmo_reminder';         // ⚙️ Desmo 到期提醒

listAftersalesRecontactsThisWeek({ saId? })
createAftersalesRecontact({ customerId, vehicleId, contactMethod, scheduledAt, saId, notes })
markRecontactDone(taskId)
rescheduleRecontact(taskId, newDate)
```

寫入 `call_tasks` 範例：
```sql
INSERT INTO call_tasks (brand_id, kind, customer_id, scheduled_at, status, notes, metadata)
VALUES ('indian', 'aftersales', '<customer.id>', '2026-05-15 10:00+08', 'pending',
  '<備註>',
  '{"subkind": "recontact", "vehicle_id": "...", "contact_method": "phone", "reason_chips": ["rt-desmo","rt-maint"]}'::jsonb);
```

### 3.3 流失風險徽章 — 預設 derived、不存 typed

如 §2.2 規則。風險演算法寫在 `@/domain/aftersales-dormant.ts` 的 `deriveRisk()`，需要客製時走 `business_rules` 表的 `rule_kind='aftersales_risk_thresholds'`（Phase 2）。

POC 階段先寫死：120+ overdue 或 NPS≤5 → critical；60+ 或保固已過 → high；30+ 或 NPS≤6 → mid。

### 3.4 Tab 切換 — board 內 `useState`、不走 URL

同 CRM04 §3.1 結論。3 個 tab 共用同一份 rows + stats，client 過濾分桶呈現，省 round-trip。

### 3.5 sidenav 改 FilterBar chip 列

spec 沒有 sidenav；現行 board 也沒有。**這條對 CRM04B 不適用**（任務描述列了這條，但實際 spec 無 sidenav 元素），跳過。

### 3.6 視覺對齊

- KPI 卡 4 張橫排（Tab 1 用分桶、Tab 2 用流失分析）
- 流失原因橫條圖：6 類分色（amber/red/blue/purple/gray/lightgray）— 完整 reuse 銷售側 `BreakdownCard` + 擴 `colorByKey` 支援
- 低 NPS 客戶 panel：左 NPS 圓 chip（紅 ≤5、amber 6）+ 中客戶資訊 + 右操作
- 月度趨勢柱狀圖：簡易 div height % 即可（spec 也是 hard-coded）
- 列尾操作 3 顆：「電訪」（→ CRM03B call task 新增）/「排程」（切 Tab 3 預填）/「詳情」（→ CRM01B 客戶基盤）
- Tab 1 列保留 `<DataGrid>`（不退回手刻 cust-row），對齊 CRM04 結論

### 3.7 月度趨勢實作

```sql
SELECT date_trunc('month', s) AS month,
       count(*) FILTER (WHERE next_service_due_date < s + INTERVAL '1 month' - INTERVAL '1 day') AS overdue_count
FROM customer_vehicles, generate_series(current_date - INTERVAL '5 months', current_date, INTERVAL '1 month') AS s
WHERE brand_id = 'indian'
GROUP BY 1 ORDER BY 1;
```

POC 階段 fixture 太薄、可考慮 hard-code（spec 也 hard-code）；上線前改真實 query。

---

## 4. 落地拆分（CRM04B.1 ~ CRM04B.5）

### CRM04B.1 — 砍掉 thin wrapper，建獨立 board + helper 骨架（M，1-1.5 天）

- 新 `@/domain/aftersales-dormant.ts`（list / stats / derive 邏輯）
- 新 `src/app/(workspace)/crm/aftersales/dormant-customers/_components/aftersales-dormant-board.tsx`
- `page.tsx` 改撈 customer_vehicles + customers + vehicle_models + nps_responses 並組裝
- 移除對銷售側 `DormantLeadsBoard` 的依賴
- 3 顆 tab btn + Tab 1 用 `<DataGrid>`（管 column visibility / 排序 / 匯出）
- 列尾 3 顆操作 pill：電訪 / 排程 / 詳情
- KPI 4 張（休眠分桶）

### CRM04B.2 — Tab 2 流失風險分析 panel（M，1 天）

- 4 張 KPI（本月新增流失風險 / 低 NPS / 主要流失原因 / 本月喚醒成功）
- 流失原因 6 類橫條圖（`BreakdownCard` + `colorByKey`）+ callout
- 低 NPS 客戶 panel（`listLowNpsCustomers` helper、score≤6、左 NPS chip + 中資訊 + 右雙操作）
- 月度趨勢柱狀圖（先 derive 用 SQL、fixture 不夠就 hard-code、後續切真實 query）

### CRM04B.3 — Tab 3 再接觸排程（M，1-1.5 天）

- 新 helper `@/domain/aftersales-recontact.ts`（list / create / markDone / reschedule）
- 「本週待再接觸清單」panel（從 call_tasks where kind='aftersales' AND metadata->>'subkind'='recontact' AND scheduled_at BETWEEN now()..+7d）
- 「手動新增再接觸任務」表單 + server action（7 種 contact_method）
- 列尾「✅ 完成 / 📅 改期」

### CRM04B.4 — 喚醒計畫模板區塊 + Tab 1 列尾「排程」貫通（S，0.5 天）

- 3 個 plan-box 階段卡（純視覺、hard-code 文字、無 state）
- Tab 1 列尾「排程」按鈕：切 Tab 3 + 開「手動新增再接觸任務」modal 預填當前車主 / 車輛 / 建議 contact_method
- Tab 1 列尾「電訪」按鈕：跳 `/crm/aftersales/call-tasks/new?customer_id=...&vehicle_id=...`

### CRM04B.5 — Indian fixture 補資料 + 整合驗收（S，0.5 天）

- 補 customer_vehicles fixture：30-60 / 60-120 / 120+ 三桶各 2 台、warranty_until 涵蓋已過/將過/有效
- 補 nps_responses fixture：5+ 筆 score≤6（含 comment 不滿原因文案）
- 補 call_tasks fixture：7+ 筆 kind='aftersales' + metadata.subkind='recontact' 落在本週
- 補 customer_vehicles.metadata.desmo_due_date（若 §5 Q2 拍板用 metadata）
- 手測 Tab 1/2/3 完整動線；audit `grep -rn "@/lib/supabase" src/app/\(workspace\)/crm/aftersales/dormant-customers` → 0 hit

**總計 4-5 天工**，跟 BDN 估算「L, 5-7 天」吻合（高端是因為 fixture 補資料 + monthly trend 真實 query 可能要花時間）。

---

## 5. 待 Ming 拍板（Q1 ~ Q5）

### Q1 — 「負責 SA」對映哪個欄位？（**最關鍵**）

Spec Tab 1 列表第二欄是「SA」，列名「許明志 / 林雅婷 / 陳建宏」。對映候選：
- **(a)** `customer_vehicles.preferred_technician_id` → `aftersales_technicians.name` —— 偏「車輛專屬技師」、跟 spec「SA = 服務顧問」語義略偏
- **(b)** `customers.metadata.assignee_id` 或新 typed column `customers.preferred_sa_id` —— 偏「客戶專屬 SA」、語義對、但 schema 未必有
- **(c)** 最近一張 RO 的 SA（`repair_orders.sa_id`）—— 動態查、貼近實際接觸但 query 重

我建議 **(a) + helper 抽象**：先用 `preferred_technician_id` 對映 `aftersales_staff`（不是 technician）；helper 命名 `preferred_sa`、UI 顯示「SA」；後續 Phase 2 若有客戶層級 SA 需求再加 typed column。

### Q2 — Desmo 超期怎麼判定？

`customer_vehicles` 目前**沒有** `desmo_due_date` typed column。選項：
- **(a)** 加 typed column `desmo_due_date date` —— Ducati 重機特性、值得 typed（建議）
- **(b)** 走 `customer_vehicles.metadata.desmo_due_date` —— 變動中 / 暫無 index 需求
- **(c)** Phase 1 暫不做 `rt-desmo` reason chip，等業務確認 desmo 怎麼追

建議 **(b) → metadata**，理由：POC 階段先驗業務流程通不通，3 頁以上用到再 promote typed。fixture 在 metadata.desmo_due_date 塞值即可。

### Q3 — Recontact task 用 `kind='aftersales' + metadata.subkind='recontact'` 還是 `kind='aftersales_recontact'`？

- **(a)** subkind in metadata：不污染 kind enum、CRM03B 電訪工作台預設過濾掉 subkind='recontact' 避免雙重提醒（或讓電訪工作台本來就會看到，行為對齊 SA 喚醒原則 spec 文字「自動建立回廠提醒電訪任務」）
- **(b)** 新 kind：清爽、易 query、但 enum 擴張

建議 **(a)**，理由：spec Tab 3 「手動新增再接觸任務」確認按鈕的 toast 是「✅ 已加入 CRM03B 電訪工作台」—— spec 明說 recontact 就是進電訪工作台、不是另開分流。

### Q4 — Monthly trend 真實 query 還是 hard-code？

Spec hard-code 8/10/13/16/11/9/7 但 indian fixture 只有 1 台逾期。
- **(a)** Phase 1 hard-code（跟 spec 視覺等價）
- **(b)** Phase 1 寫真實 query、fixture 補足、可能跑出來月度都是 0-1 不好看

建議 **(a) hard-code**，但 helper 留 `getMonthlyOverdueTrend()` placeholder 讓 Phase 2 接真資料。

### Q5 — 「本月喚醒成功」KPI 怎麼算？

候選定義：
- **(a)** 「本月內，曾經 overdue 但 last_service_date 落在本月」的 customer_vehicles 數
- **(b)** 「本月內，完成的 call_tasks kind='aftersales' subkind='recontact' AND status='completed'」數
- **(c)** 雙重交集（call task 完成 AND 該 vehicle 真的回廠）

建議 **(a)**，乾淨、語義對齊「真的回廠才算喚醒成功」、不被 call task 完成但客戶沒回廠的雜訊污染。

---

## 6. 不在 Phase 1 範圍

- 自動排程演算法（「逾期 30 天到 → 自動建 SMS 任務」）→ cron / hook 範疇，未來 CRM06B 推播通知模組做
- 喚醒模板套用（「Track Day 邀請」「免費健檢邀請」一鍵套用）→ Phase 2
- 長期休眠歸檔 batch job（120 天無回應自動標 archived）→ Phase 2
- LINE / SMS 真實發送 → 走既有 notifications hub，等 use case 明確再接
- `business_rules` 風險閾值客製 → Phase 2

---

## 7. 落地前 audit checklist

```bash
# 1) UI 不直連 supabase
grep -rn "@/lib/supabase" \
  "src/app/(workspace)/crm/aftersales/dormant-customers" \
  src/components/aftersales-dormant 2>/dev/null  # 預期 0 hit

# 2) call_tasks 用 helper、不亂寫
grep -rn 'from(.call_tasks.)' "src/app/(workspace)/crm/aftersales" 2>/dev/null  # 預期 0 hit

# 3) 確認資料源換軌：頁面不再 import 銷售側 DormantLeadsBoard
grep -rn "DormantLeadsBoard" "src/app/(workspace)/crm/aftersales" 2>/dev/null  # 預期 0 hit

# 4) Indian fixture audit
psql -c "
SELECT
  (SELECT count(*) FROM customer_vehicles WHERE brand_id='indian' AND next_service_due_date < current_date - 30) AS overdue30plus,
  (SELECT count(*) FROM nps_responses WHERE store_id IN (SELECT id FROM stores WHERE brand_id='indian') AND score <= 6) AS low_nps,
  (SELECT count(*) FROM call_tasks WHERE brand_id='indian' AND kind='aftersales' AND metadata->>'subkind'='recontact') AS recontacts
"
# 預期：overdue30plus ≥ 5、low_nps ≥ 5、recontacts ≥ 7
```

---

## 8. Ming review 點

- [ ] **Q1 SA 對映欄位**（preferred_technician_id / customers 層 / RO 最近）→ 建議 preferred_technician_id + helper 抽象成 `preferred_sa`
- [ ] **Q2 Desmo 落點**（typed column / metadata / 暫不做）→ 建議 metadata.desmo_due_date
- [ ] **Q3 Recontact 走 subkind 還是新 kind**？→ 建議 metadata.subkind='recontact'
- [ ] **Q4 Monthly trend hard-code 還是真 query**？→ 建議 hard-code、留 helper placeholder
- [ ] **Q5 「本月喚醒成功」定義** → 建議「本月 last_service_date 落在本月的曾 overdue 車輛數」
- [ ] 拍板 **資料源換軌**（不 reuse 銷售側 `DormantLeadsBoard`、改 customer_vehicles 主軸）是否同意
- [ ] CRM04B.1 ~ CRM04B.5 拆題顆粒度 OK 不 OK
- [ ] 確認「Tab 1 列保留 DataGrid、不退回 spec cust-row」可接受

拍板後 Phase 2 落地，預估 4-5 天工。
