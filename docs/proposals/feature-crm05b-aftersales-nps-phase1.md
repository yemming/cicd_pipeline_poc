# CRM05B — 售後 NPS 看板（Hero 區 + 期間切換 + 6 面向 + SA / 服務類型 / 批評者追蹤）Phase 1 提案

> 規格：`docs/DUCATI_v2_output/02_客服管理/02_售後CRM/CRM05B_NPS看板_售後_v1.html`
> 現行：`src/app/(workspace)/crm/aftersales/nps/page.tsx`（thin wrapper、kind 鎖 'aftersales' 重用銷售側 `NpsDashboardView` + `getSalesNpsDashboard`、URL `?range=7d|30d|90d|all`）
> 階段：**Phase 1（僅提案、不落地、不寫 code）**
> 對應 BDN 第三輪卡片：CRM05B（M、3-4 天）— **第三輪 BDN 最後一條**
> 姊妹提案：
> - `docs/proposals/feature-crm02b-aftersales-survey-templates-phase1.md`（CRM02B 售後問卷設定，提供 6 面向 / SA 工作流上下文）
> - `docs/proposals/feature-crm03b-aftersales-call-tasks-phase1.md`（CRM03B 售後電訪工作台，提供 NPS 快評寫入流程）
> - `docs/proposals/feature-crm04b-aftersales-dormant-phase1.md`（CRM04B 售後休眠流失，提供「低 NPS 客戶追蹤」panel 對照）
> 日期：2026-05-16

---

## 0. TL;DR — 為什麼 CRM05B 拆獨立 component 的論證最強

銷售 NPS（`/crm/sales/nps`）已上線，現行 `NpsDashboardView` 共 423 行、結構為「KPI 5 顆 → 趨勢線 → 分組（store / sales_person）→ 批評者留言 8 筆」。**CRM05B 售後規格跟銷售側結構差異是三條 CRM0xB 裡最大的**：

| 差異點 | CRM05A 銷售（現行） | CRM05B 售後（spec） |
|---|---|---|
| Hero 區 | ❌ 無、KPI 5 顆橫排 | ✅ **大型 Hero 卡片**（漸層 navy 底 + 大字 NPS +68 + Promoters/Passives/Detractors 三欄 + 進度條 + 月比較 ▲ +5）|
| 期間切換 | `<select>` 4 選 1（7d/30d/90d/all）| ✅ **Pill bar 5 選 1**（本月 / 本季 / 近半年 / 近一年 / 全體）+ **SA 過濾** + **服務類型過濾** |
| KPI | 「總回收 / 推薦者 / 中立者 / 批評者 / 平均分」 | ✅ **「D+3 電訪完成率」/「平均滿意度」/「批評者待處理」/「推薦轉介新客戶」**（4 顆、語意完全不同）|
| 趨勢 | 折線、週 bucket、近 90 天 | ✅ **月柱狀圖**（近 6 / 12 個月切換）+ 異常標記（農曆年假人手少）|
| 分組 | by store + by sales_person | ✅ **by SA**（含「待改善」標記 + 主管建議文案）+ **by service_type**（5 類：Desmo / 大保養 / PDI / 定期保養 / 故障維修）|
| 面向細項 | ❌ 無 | ✅ **6 面向平均分**（SA 服務態度 / 維修品質 / 等待時間 / 費用透明 / 取車說明 / 整體體驗）+ 環比 ▲▼ + callout（「等待時間連續下滑」）|
| 批評者區 | 簡單 list 8 筆 | ✅ **D+3 進廠後回訪記錄表格**（4 tab pill：全部 / 推薦 / 中立 / 批評）+ **批評者追蹤處理區**（評分≤6 待處理、需主管介入、含回應機制）|
| 服務類型 NPS | ❌ | ✅ **依服務類型拆 NPS 橫條圖**（Desmo +76 / 大保養 +72 / PDI +70 / 定保 +62 / 故障 +44）+ callout（連動 CRM06B 推播）|

→ **9 個結構差異**，遠多於 CRM02B / CRM03B 的 5 個（差異全是工作流結構不只是欄位）。**拆出獨立 component 在 CRM05B 比 CRM02B/03B 更站得住腳**。

但 Q1 仍是架構選邊題，**sub-agent 不自選**，理由與選項見 §3.1。

---

## 1. Spec 實際內容（逐 section）

### 1.1 Header / Sub-bar

| 區塊 | 內容 |
|------|------|
| Header 標題 | `CRM05B NPS 滿意度看板 v1` + 右側 `sa-badge`「SA 售後專用」|
| Header 連結 | ← CRM 總覽 / ← 休眠流失 / 電訪工作台 / 店長報表 → |
| Sub-bar 期間 pill | **5 選 1**：本月 / 本季 / 近半年 / 近一年 / 全體 |
| Sub-bar SA 篩選 | `select`：全體 SA / 許明志 / 林雅婷 / 陳建宏 |
| Sub-bar 服務類型篩選 | `select`：所有服務類型 / 定期保養 / 大保養 / Desmo Service / 故障維修 / PDI 整備 |
| Sub-bar 右側 | 「24 筆回答」label + 「匯出報表」btn |

### 1.2 Hero 區 — 大型 NPS 卡片（CRM05B 核心特色）

```
┌──────────────────────────────────────────────────────────────────┐
│  本月售後 NPS                                                    │  ← 漸層 navy 底
│  +68             ▲ +5 vs 上月                                    │  ← 大字 64-72px
│  滿分 +100                                                       │
│                                                                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐               │
│  │ 推薦者 9-10 │ │ 被動 7-8    │ │ 批評者 0-6  │               │  ← 三欄分區
│  │ 15  62%     │ │ 5   21%     │ │ 4   17%     │               │
│  │ ▓▓▓▓▓▓▓░░░ │ │ ▓▓░░░░░░░░ │ │ ▓░░░░░░░░░ │               │  ← 進度條
│  └─────────────┘ └─────────────┘ └─────────────┘               │
│                                                                  │
│  本月有效回答：24 份 ・ 問卷完成率：83%                          │  ← caption
└──────────────────────────────────────────────────────────────────┘
```

視覺 token：
- 卡片背景：`linear-gradient(135deg, #1A3A5C 0%, #0F2A45 100%)` + `rounded-lg p-6`
- 大字 NPS：`text-[72px] font-bold text-white`（正分綠色 #4FD17A、零綠、負分紅）
- 月比較 chip：`bg-white/10 text-white px-2 py-0.5 rounded-md text-[12px]`（▲ 綠 / ▼ 紅）
- 三欄子卡：`bg-white/10 backdrop-blur rounded-lg p-3`
- 進度條：`h-1.5 rounded-full bg-white/20` 內 fill `bg-[color]`（promoter 綠 / passive 黃 / detractor 紅）

### 1.3 KPI 4 欄（Hero 區下方）

```
1. D+3 電訪完成率    83%   本月 24/29 件完成        teal
2. 平均滿意度分數     8.6   滿分 10 分               navy
3. 批評者（≤6）待處理  4    需主管介入跟進          red
4. 推薦轉介新客戶     2    本月高分客戶帶來的新進廠 amber/green
```

### 1.4 月度趨勢卡（柱狀圖 + 註釋）

```
📈 售後 NPS 月度趨勢                  [近 6 個月 ▼ / 近 12 個月]
+80 ─────────────────────────
+65 ────────────────▓─────▓──    63    68
+50 ─────▓──▓──▓──▓─────────    52    55    48    58
+35 ─────────────────────────
        12月 1月 2月 3月 4月 5月
        農曆年假人手少 ←─ 註釋
```

實作：簡易 div height % 即可、x 軸 12 格、y 軸 4 格刻度。

### 1.5 SA 個人 NPS 表現（CRM05B 特有）

```
👤 SA 個人 NPS 表現  本月各 SA 客戶滿意度

許明志  最高    8.9   10 筆回答    推薦者 70%       ← 綠 chip 最高
林雅婷         8.5    8 筆回答    推薦者 62%
陳建宏  待改善  7.8    6 筆回答    批評者 33%       ← amber chip 待改善

💡 陳建宏本月批評者比例偏高（33%），主因為「逾期未回廠客戶的不滿」。建議主管本週約談，協助改善主動提醒機制。
```

每行：頭像/縮寫 + 姓名 + 標籤 chip（最高綠 / 待改善 amber）+ 平均分 + 筆數 + 推薦者%。Callout 在最下方一條 amber 底。

### 1.6 售後各面向平均分（6 面向、CRM05B 特有）

```
⭐ 售後各面向平均分  D+3 問卷細項（滿分 10）

SA 服務態度與溝通        9.1 / 10   ▲ +0.3
維修品質與效果           8.8 / 10   ▲ +0.5
等待時間與準時交車       7.4 / 10   ▼ -0.4     ← 紅色標
費用透明度與說明         7.9 / 10   ▲ +0.2
取車說明完整度           8.2 / 10   ▲ +0.1
整體進廠體驗             8.6 / 10   ▲ +0.4

⚠️ 「等待時間」連續下滑，建議檢視工位排程與 SA 工單接量上限。
```

每行：左面向名稱 + 中分數（大字 18px）+ 右 trend chip（▲ 綠 / ▼ 紅）。Callout 連動 spec 文字。

⚠️ **資料缺口最大的區塊**：6 面向細項 = `nps_responses.metadata.facet_scores` 物件、目前 0 筆有值（見 §2）。

### 1.7 依服務類型 NPS 拆分（CRM05B 特有）

```
🔧 依服務類型 NPS 拆分  不同服務類型的滿意度差異

Desmo Service     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ +76    5 筆
大保養           ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ +72    7 筆
PDI 新車整備      ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ +70    3 筆
定期保養          ━━━━━━━━━━━━━━━━━━━━━━━━━━━ +62          6 筆
故障維修          ━━━━━━━━━━━━━━━━━━━━ +44                3 筆     ← 偏低紅標

💡 故障維修 NPS 偏低（+44），主因為「不確定性高，等待時間長」。建議優化故障維修的進度主動通知機制（連動 CRM06B 推播）。
```

橫條圖：寬度 = `(npsScore + 100) / 200 * 100%`（NPS 範圍 -100 ~ +100）；色票依分數區段（>70 綠 / 50-70 navy / 30-50 amber / <30 紅）。

### 1.8 D+3 進廠後回訪記錄（4 tab pill 表格、CRM05B 特有）

```
📋 D+3 進廠後回訪記錄  本月有效回答，來源：CRM03B 電訪工作台

[全部] [推薦者 9-10] [被動者 7-8] [批評者 0-6]                  [匯出]

客戶/車款           評分    服務類型     日期        負責 SA    主要回饋
李宗翰 / Panigale  10 ⭐    Desmo       2026-05-08  許明志   「技師很專業，車況解釋清楚」
林雅雯 / Monster    7      定期保養     2026-05-07  林雅婷   「等待時間久」
王大明 / Multistrada 4     故障維修     2026-05-06  陳建宏   「等了兩週還沒拿到車」  ← detractor 紅標
...
```

每列：客戶+車款 / score 圓 chip（依 promoter/passive/detractor 分色）/ service_type chip / 日期 / SA / 回饋摘要。點列 → 跳 CRM03B 該通話詳情（透過 `call_task_id`）。

⚠️ 注意：spec 「24 筆回答」的列表跟現行 `recentDetractors` 8 筆不一樣 — CRM05B 是**全部回答的表格**，可分頁、可 tab 過濾。

### 1.9 批評者追蹤處理區（CRM05B 特有、回應機制）

```
🚨 批評者追蹤處理  評分 ≤6 分，需主管介入跟進    4 件待處理

┌─────────────────────────────────────────────────┐
│ 王大明 / Multistrada V4    NPS 4 ⚠️             │
│ 服務類型：故障維修 | SA：陳建宏 | 日期：5/6     │
│ 不滿原因：「等了兩週還沒拿到車，沒有主動通知」  │
│ [📞 立即電話關懷] [📝 記錄補救行動] [✅ 標記已處理] │
└─────────────────────────────────────────────────┘
...
```

每張卡：客戶資訊 + score 紅 chip + 不滿原因 + **3 顆操作 pill**（電話關懷 / 記錄補救 / 標記已處理）。

→ 點「電話關懷」應該開 CRM03B 新增電訪任務、預填客戶 + customer + service_type + recommended_call_type='complaint'。
→ 點「標記已處理」要寫狀態到 `nps_responses.metadata.follow_up_status`（目前 schema 內無此欄、屬 metadata 升級題、見 §5 Q3）。

---

## 2. 資料缺口 audit（DB 已查 — 2026-05-16）

### 2.1 既有資料現況（indian brand）

| 表 | 欄位 | 現況 | 備註 |
|---|---|---|---|
| `nps_responses` | id/brand_id/kind/customer_id/call_task_id/survey_template_id/score/category/comment/store_id/sales_person/responded_at/metadata | ✅ schema 齊 | 30 筆 indian aftersales、8 筆 detractor |
| `nps_responses.metadata.facet_scores` | （jsonb） | ❌ **0 筆有值** | 6 面向分數 = 全 fixture 缺資料 |
| `nps_responses.call_task_id` | uuid FK | ⚠️ **0 筆有 FK** | 影響「點列跳 CRM03B」、影響統計「D+3 完成率」 |
| `nps_responses.metadata.ro_id` 或類似 | jsonb key | ❌ **0 筆** | 影響取得 service_type |
| `nps_responses.metadata.follow_up_status` | jsonb key | ❌ **0 筆** | 批評者追蹤處理需要 |
| `repair_orders.prefix_p1` | text | ✅ 9 筆 | `MN/AC/RP/OT/WC` 可導出 service_type 粗分 |
| `repair_orders.metadata.service_type` | jsonb key | ❌ **0 筆** | 細分 service_type 需擴 metadata |
| `aftersales_technicians` | id/name | ✅ | 6 筆 indian SA，可 join `repair_orders.sa_id` |
| `call_tasks` kind='aftersales' | | ✅ | 6 筆，CRM03B 提案會擴 |

### 2.2 「service_type 怎麼取得」

Spec 列了 5 種：定期保養 / 大保養 / Desmo Service / 故障維修 / PDI 整備。資料路徑候選：

| 路徑 | 來源 | 優劣 |
|---|---|---|
| (a) `repair_orders.prefix_p1` 對映 | MN→保養 / AC→意外 / RP→維修 / OT→其他 / WC→保固 | ✅ 已有資料、❌ 粒度粗、無法區分大保養 vs 定保、無 Desmo 標記 |
| (b) `repair_orders.metadata.service_type` typed key | spec 列的 5 類 enum | ⚠️ 需擴 metadata + fixture |
| (c) `survey_templates` 對映 service_type | CRM02B 提案：每張問卷對應一種 service_type | ✅ 跟 CRM02B 提案對齊、但問卷模板還在 Phase 1 |
| (d) 新 typed column `repair_orders.service_type text` | enum | ⚠️ schema 變更、不適合 POC |

→ **建議 (b) `repair_orders.metadata.service_type`**（5 類字串 enum）+ join 取得；NPS 撈時透過 `metadata.ro_id` 找回 RO 即可。Phase 1 fixture 補上即可、不開 typed。

### 2.3 「6 面向分數」缺口

Spec 6 面向：
- `sa_service`（SA 服務態度與溝通）
- `repair_quality`（維修品質與效果）
- `wait_time`（等待時間與準時交車）
- `cost_transparency`（費用透明度與說明）
- `pickup_explanation`（取車說明完整度）
- `overall`（整體進廠體驗）

**全部塞 `nps_responses.metadata.facet_scores`**：

```json
{
  "facet_scores": {
    "sa_service": 9,
    "repair_quality": 9,
    "wait_time": 7,
    "cost_transparency": 8,
    "pickup_explanation": 8,
    "overall": 9
  }
}
```

不開 typed column 理由：
1. 6 個 smallint 欄位太散、典型「形狀還在變」的場景
2. POC 階段不確定 Ducati 真實問卷面向最終是哪 6 個（可能跟 spec 略不同）
3. 升級規則符合：等三頁以上要用 facet → 再 promote typed

Phase 1 fixture **必須補滿 24 筆有 facet_scores 的 indian aftersales nps_responses**，否則 §1.6 區塊看不到資料。

### 2.4 「期間切換」5 vs 現行 4 對齊

| Spec | 現行 RangeKey |
|---|---|
| 本月 (this_month) | ❌ 無 |
| 本季 (this_quarter) | ❌ 無 |
| 近半年 (180d) | ❌ 無 |
| 近一年 (365d) | ❌ 無 |
| 全體 (all) | ✅ all |

現行 `RANGE_DAYS` 只有 7d/30d/90d/all。**全部要改**。

→ **新 `AftersalesRangeKey`**：`this_month | this_quarter | 6m | 12m | all`（無 7d/30d/90d）。如選路徑 (A) 共用、要在 `sales-nps.constants.ts` 擴 RangeKey、銷售側要同步顯示新選項或加 prop 過濾。如選 (B) 拆獨立、就有自己的 const file。

### 2.5 「D+3 電訪完成率」KPI 來源

公式：`完成的 aftersales d3 call_tasks / 應建立的 d3 call_tasks * 100%`。

- 分母：本期間內 closed_at 落在 (today - 期間天數)..today 的 RO 數量（每張 RO 預期會觸發一張 d3 call_task）
- 分子：`call_tasks where kind='aftersales' AND metadata->>'call_type'='d3' AND status='completed' AND scheduled_at IN 期間` 數

Phase 1 fixture **應該補滿 6+ 筆 d3 call_tasks + 對應 RO**，否則 KPI 卡顯示「0/0」很醜。

### 2.6 「推薦轉介新客戶」KPI 來源

Spec 寫「本月高分客戶帶來的新進廠」= **推薦者轉介**。需要 `customers.referrer_id` 或類似欄位：

```sql
SELECT count(*) FROM customers
WHERE brand_id='indian'
  AND created_at >= date_trunc('month', current_date)
  AND referrer_id IN (
    SELECT customer_id FROM nps_responses
    WHERE brand_id='indian' AND kind='aftersales' AND score >= 9
  );
```

⚠️ `customers.referrer_id` 不確定存不存在（見 §5 Q5），如果沒有 → Phase 1 hard-code 「2」+ helper 留 placeholder。

### 2.7 結論：Phase 1 fixture 必補清單

```
[1] 24 筆 indian aftersales nps_responses 加 metadata.facet_scores（6 面向）
[2] 24 筆關聯到 9 張 RO（透過 metadata.ro_id）
[3] 9 張 RO 補 metadata.service_type ∈ {定期保養, 大保養, Desmo Service, 故障維修, PDI 整備}
[4] 6+ 筆 call_tasks kind='aftersales' call_type='d3' status 涵蓋 completed/pending
[5] 8 筆 detractor 加 metadata.follow_up_status ∈ {pending, contacted, resolved}
[6] 部份 customers 加 metadata.referrer_customer_id（指向 promoter）
[7] 補近 6 個月趨勢 fixture：每月 4-6 筆 responded_at 分散
```

不開新 typed column。全部走 metadata。

---

## 3. 預設架構（與 CRM02B/03B 相關但獨立決策）

### 3.1 Q1 — 銷售側 board + prop 控制 vs 售後拆出獨立 component（**最關鍵**）

#### 路徑 (A) — `NpsDashboardView` 大幅擴張、`kind='aftersales'` prop 切換

- 在現有 423 行 `NpsDashboardView` 加 9 個 aftersales-only 區塊（Hero、新期間 pill bar、新 KPI 4 顆、月柱圖、SA 表現、6 面向、服務類型 NPS、回訪表格、批評者追蹤）
- 用 `kind === 'aftersales'` 條件渲染散落 9 處
- domain helper `getSalesNpsDashboard` 同樣擴張 → 多回傳 `facetAverages` / `bySA` / `byServiceType` / `detractorFollowUps` / `referralCount` / `d3CompletionRate`

**估算**：board 從 423 → 800-900 行。helper 從 316 → 500-600 行。

**利**：兩側永遠同步。
**弊**：
1. **9 個結構差異**，是 CRM02B/03B 的 ~2 倍 — 條件渲染複雜度爆炸
2. 銷售側根本用不到 6 面向 / 服務類型 / 批評者追蹤回應機制；prop 切換在這層是「半個檔案 dead-on-sales-side」
3. RangeKey 不對齊（this_month/this_quarter/6m/12m vs 7d/30d/90d/all）— 要嘛兩個 enum 共存、要嘛把銷售側也改成 this_month 系列（影響面更大）

#### 路徑 (B) — 售後拆出 `aftersales-nps-dashboard-view.tsx` + `domain/aftersales-nps.ts`

- 新 file：`src/app/(workspace)/crm/aftersales/nps/_components/aftersales-nps-dashboard-view.tsx`
- 新 domain helper：`src/domain/aftersales-nps.ts` + `src/domain/aftersales-nps.constants.ts`
- 銷售側 `NpsDashboardView` / `getSalesNpsDashboard` 不動
- 共用：`NPS_CATEGORY_LABEL` / `classifyScore` 等 base const 可從 `sales-nps.constants.ts` re-export（或抽到 `nps-shared.constants.ts`）

**估算**：新 board ~600-700 行 / 新 helper ~400-500 行。

**利**：
1. 兩個 domain 邏輯獨立演進（售後 facet / SA / service_type 是 SA 工作流產物、不會 retrofit 給銷售側）
2. 結構差異 9 處全部就地處理、不污染銷售側
3. RangeKey 一邊一套乾淨
4. 跟 commit ff45491 拆 sales/aftersales 14 頁的歷史偏好對齊

**弊**：
1. 兩側若未來有共用邏輯（如基本 NPS 公式、推薦者分類）要記得抽 `nps-shared`
2. 銷售側若也想要 Hero 區、面向細分 → 要兩邊各做一遍

### 3.2 Sub-agent 中立分析意見

跟 CRM02B / 03B 的決策題不一樣：

| 維度 | CRM02B | CRM03B | **CRM05B** |
|---|---|---|---|
| 共結構比例 | ~70% | ~90% | **~30%**（只有「分類三段 promoter/passive/detractor」「分數平均」這類底層）|
| 工作流結構差異 | 5 處（欄位 / enum） | 5 處（欄位 / enum / 條件區塊） | **9 處（整段區塊存在/不存在、非欄位）** |
| 拆獨立是否痛？ | 略痛、code 重複 | 略痛、card 視圖要做兩遍 | **不痛、兩側真的不一樣** |
| 銷售側未來會吃這些區塊嗎？ | 高機率（問卷結構共用） | 中機率（卡片視圖共用） | **低機率（6 面向是售後特有、SA 表現不對映業代）** |

→ **Sub-agent 傾向 (B) — 拆獨立 component**，但 CRM02B/03B 若拍板 (A)，需要 Ming 明確決定 CRM05B 是否走不同方向（不一致也 OK，因為差異模式真的不同）。

**Sub-agent 不自選**，等 Ming 拍板。

### 3.3 期間 pill bar — URL `?range=this_month|this_quarter|6m|12m|all`

無論 (A) 還是 (B) 都同套設計：

```tsx
type AftersalesNpsRange = "this_month" | "this_quarter" | "6m" | "12m" | "all";
```

URL state（server-fetch friendly）取代 client useState。重新整理後不會掉。

預設 `this_month`（spec 預設值「本月」）。Sub-bar pill 點擊 → `router.push` 帶 `?range=`。

### 3.4 SA / service_type filter — URL `?sa=<id>&service_type=<key>`

同上、走 URL。後端 query 用 `eq` filter。

### 3.5 月度趨勢 query

```sql
SELECT
  date_trunc('month', responded_at AT TIME ZONE 'Asia/Taipei')::date AS month,
  count(*) FILTER (WHERE score >= 9) AS promoter,
  count(*) FILTER (WHERE score BETWEEN 7 AND 8) AS passive,
  count(*) FILTER (WHERE score <= 6) AS detractor,
  count(*) AS total
FROM nps_responses
WHERE brand_id='indian' AND kind='aftersales'
  AND responded_at >= current_date - interval '6 months'
GROUP BY 1
ORDER BY 1;
```

近 6 / 12 個月切換在 client 做（撈 12 個月一次、display 切）— 省 round-trip。

### 3.6 6 面向平均分 query

```sql
SELECT
  jsonb_object_agg(
    facet_key,
    jsonb_build_object('current', avg_current, 'prev', avg_prev)
  ) AS facets
FROM (
  SELECT
    key AS facet_key,
    AVG(CASE WHEN responded_at >= date_trunc('month', current_date)
             THEN (value::numeric) END) AS avg_current,
    AVG(CASE WHEN responded_at >= date_trunc('month', current_date) - interval '1 month'
             AND responded_at <  date_trunc('month', current_date)
             THEN (value::numeric) END) AS avg_prev
  FROM nps_responses, jsonb_each_text(metadata->'facet_scores')
  WHERE brand_id='indian' AND kind='aftersales'
  GROUP BY key
) t;
```

回傳 helper 統一 enum key（`sa_service` / `repair_quality` / `wait_time` / `cost_transparency` / `pickup_explanation` / `overall`）。label 由 const 對映。

### 3.7 SA 表現 query

```sql
SELECT sales_person AS sa_name,
       count(*) AS total,
       AVG(score)::numeric(3,1) AS avg_score,
       count(*) FILTER (WHERE score >= 9) AS promoter,
       count(*) FILTER (WHERE score <= 6) AS detractor
FROM nps_responses
WHERE brand_id='indian' AND kind='aftersales'
  AND responded_at >= date_trunc('month', current_date)
GROUP BY sales_person
ORDER BY avg_score DESC;
```

⚠️ `sales_person` 是 text、不是 FK。「許明志」「林雅婷」這類字串。Phase 1 沿用、Phase 2 升 `nps_responses.sa_id uuid` typed column（如果 Ming 要做 SA 報表頁、Q4）。

「最高 / 待改善」chip derive：
- `最高` = 該 SA avg_score 是全部 SA 內最高
- `待改善` = detractor_count / total >= 0.3 OR avg_score < 8

### 3.8 服務類型 NPS 拆分 query

```sql
SELECT
  ro.metadata->>'service_type' AS svc_type,
  count(nps.*) AS total,
  ROUND(
    100.0 * count(*) FILTER (WHERE nps.score >= 9) / NULLIF(count(*),0) -
    100.0 * count(*) FILTER (WHERE nps.score <= 6) / NULLIF(count(*),0)
  ) AS nps_score
FROM nps_responses nps
LEFT JOIN repair_orders ro ON ro.id = (nps.metadata->>'ro_id')::uuid
WHERE nps.brand_id='indian' AND nps.kind='aftersales'
GROUP BY 1
ORDER BY nps_score DESC NULLS LAST;
```

⚠️ 需要 `nps.metadata.ro_id` + `ro.metadata.service_type`，**兩個都要 fixture 補**（見 §2.7）。

### 3.9 批評者追蹤處理 — 寫入 `nps_responses.metadata.follow_up_status`

不開新表、不開新 typed column。helper 寫：

```ts
markDetractorFollowUp(npsId, status: 'pending' | 'contacted' | 'resolved')
// → UPDATE nps_responses SET metadata = metadata || jsonb_build_object('follow_up_status', $1, 'follow_up_at', now())
```

新 server action `markDetractorFollowUpAction(npsId, status)` 走 helper、樂觀 UI、banner。

「立即電話關懷」按鈕 → 跳 `/crm/aftersales/call-tasks/new?customer_id=...&type=complaint&from_nps_id=...`（reuse CRM03B 的 modal）。

### 3.10 視覺對齊（design pattern token）

| 區塊 | 顏色 / token |
|---|---|
| Hero 卡片背景 | 深 navy 漸層 `from-[#1A3A5C] to-[#0F2A45]` + `text-white` |
| Hero NPS 大字 | `text-[72px] font-bold`；>0 套 `#4FD17A`（亮綠）、≤0 套 `#FF6B6B`（亮紅）|
| KPI 4 顆 | 沿用 design pattern KPI 卡 `bg-white border border-[#EEECE6] rounded-lg px-3 py-2` |
| 期間 pill bar | 沿用 toggle pill：active = `bg-[#1A3A5C] text-white`、inactive = `bg-white border border-[#D5D3CB] text-[#5A5955]` |
| 趨勢柱狀圖 | navy bar (`bg-[#1A3A5C]`)、hover amber (`bg-[#854F0B]`) |
| 6 面向 trend chip | ▲ 綠 `text-[#3B6D11]` / ▼ 紅 `text-[#CC0000]`|
| 服務類型 NPS bar | 分數區段 4 色（>70 綠 / 50-70 navy / 30-50 amber / <30 紅）|
| 批評者卡 | `bg-[#FDECEA] border border-[#F5AEAD]` |
| Callout banner | amber `bg-[#FDF3E3] text-[#854F0B]` + 💡 / ⚠️ icon |

### 3.11 共用元件抽取

無論選 (A) 或 (B)，建議抽幾個 reusable client component：
- `<NpsHeroCard>`：Hero 區、props = score / promoter/passive/detractor counts / prev / period_label
- `<MonthlyBarChart>`：月柱狀圖、props = data points + 6/12 切換
- `<FacetAverageRow>`：6 面向單列、props = key / score / trend
- `<BreakdownBar>`：服務類型橫條圖、props = key / score / count

放在 `src/components/charts/`（reuse 給其他模組）。

---

## 4. 落地拆分（CRM05B.1 ~ CRM05B.4）

### CRM05B.1 — domain helper + fixture（S-M, 0.5-1 天）

- 新 `@/domain/aftersales-nps.ts`（或擴 `sales-nps.ts` — 看 Q1）
  - `getAftersalesNpsDashboard(filters)`：回 hero / kpi / trend12m / facetAverages / bySA / byServiceType / detractorList / detractorFollowUps / referralCount / d3CompletionRate
  - 子 helper：buildHero / buildFacets / buildBySA / buildByServiceType
- 新 `@/domain/aftersales-nps.constants.ts`（或擴 sales 版）
  - `AftersalesRangeKey` enum + `RANGE_LABEL`
  - `FACET_KEYS` const array + label map
  - `SERVICE_TYPE_KEYS` const array + label map
- **Indian fixture 補資料**（執行 SQL UPDATE 24 筆 nps_responses 加 facet_scores、9 筆 RO 加 service_type、call_tasks d3 6 筆、follow_up_status 8 筆）

### CRM05B.2 — Hero 區 + KPI 4 顆 + 期間 pill bar + SA/service_type filter（M, 1-1.5 天）

- 新 `aftersales-nps-dashboard-view.tsx`（如 Q1 選 B）或擴 `nps-dashboard-view.tsx`（如 Q1 選 A）
- Hero 卡片元件
- KPI 4 顆（D+3 完成率 / 平均滿意度 / 批評者待處理 / 推薦轉介）
- Sub-bar：5 顆期間 pill + SA select + service_type select + 「N 筆回答」label + 匯出 btn
- URL 帶 `?range=&sa=&service_type=`
- page.tsx 改 import 自家 view（如選 B）或保留 thin wrapper 並換 props（如選 A）

### CRM05B.3 — 6 面向 + SA 表現 + 服務類型 NPS + 月柱圖（M, 1-1.5 天）

- 6 面向卡片（6 列 + trend chip + callout）
- SA 個人表現卡（每行 chip + 統計 + 底部 callout）
- 服務類型橫條圖（5 條 + callout）
- 月度趨勢柱狀圖（6/12 切換）
- 共用元件 `<MonthlyBarChart>` / `<BreakdownBar>` 抽到 `src/components/charts/`

### CRM05B.4 — D+3 回訪表格 + 批評者追蹤 + 整合驗收（S-M, 0.5-1 天）

- D+3 進廠後回訪記錄表格（用 `<DataGrid>`、4 tab pill 過濾 promoter/passive/detractor、列點 → 跳 CRM03B）
- 批評者追蹤處理卡（每張 detractor 卡 + 3 顆 pill）
- `markDetractorFollowUpAction` server action + 「標記已處理」按鈕（樂觀 UI + banner）
- 「立即電話關懷」跳 CRM03B 新增 modal、預填 customer + type=complaint + from_nps_id
- 「記錄補救」開 inline textarea modal → 寫到 `metadata.follow_up_note`
- 匯出報表（用 DataGrid 內建 Excel 匯出）
- 手測完整動線；audit `grep -rn "@/lib/supabase" src/app/\(workspace\)/crm/aftersales/nps` → 0 hit

**總計 3-4 天工**（fixture 補資料 0.5 天、view 2-2.5 天、互動 + 驗收 0.5-1 天）。跟 BDN 估算「M, 3-4 天」吻合。

---

## 5. 待 Ming 拍板（Q1 ~ Q6）

### Q1 — 銷售側共用 + prop vs 售後拆獨立 component？（**最關鍵**）

- **(A)** `NpsDashboardView` + `getSalesNpsDashboard` 擴張、`kind='aftersales'` prop 切換
- **(B)** 拆出 `AftersalesNpsDashboardView` + `getAftersalesNpsDashboard` 獨立

Sub-agent 傾向 **(B)**（理由：9 個結構差異 / 工作流不同 / RangeKey 不對齊 / 銷售側不需要 facets 與服務類型 / commit ff45491 拆 14 頁的歷史偏好）。

如 Ming 偏向跟 CRM02B/03B 對齊「都選 A」/「都選 B」，請明示；CRM05B 也可以跟 CRM02B/03B 走不同方向（差異模式不同、不一致是可接受的）。

### Q2 — `service_type` 落點：metadata key vs typed column vs 從 prefix_p1 衍生？

- **(a)** `repair_orders.metadata.service_type` 字串 enum（建議）
- **(b)** 新 typed column `repair_orders.service_type text`
- **(c)** 從 `prefix_p1` 自動衍生（MN→保養 / RP→維修 …）→ 但區分不出大保養/定保/Desmo

Sub-agent 建議 **(a)**，POC 階段先 metadata、Phase 2 三頁以上用到 → promote。

### Q3 — `nps_responses.metadata.follow_up_status` 升 typed？

- **(a)** Phase 1 走 metadata key（建議）
- **(b)** Phase 1 開 typed column `follow_up_status text` + `follow_up_at timestamptz`
- **(c)** 新表 `nps_detractor_followups`（id, nps_id, status, contacted_at, resolved_at, supervisor_id, note）

Sub-agent 建議 **(a)**：Phase 1 metadata、Phase 2 若有「主管 dashboard 跟進進度報表」需求 → 升 (c)。

### Q4 — `nps_responses.sa_id` 升 typed？

現行 `sales_person` 是 text、SA 表現 group by 字串。

- **(a)** Phase 1 沿用 sales_person text（建議）
- **(b)** Phase 1 開 typed column `sa_id uuid REFERENCES aftersales_technicians(id)`

Sub-agent 建議 **(a)** 配 (b) 預留：先沿用 text；如果 CRM03B「saveCall 自動寫 NPS」也帶 sa_id、再一次 promote。

### Q5 — 推薦轉介 KPI 怎麼算？

- **(a)** `customers.metadata.referrer_customer_id` jsonb key（POC 建議）
- **(b)** 新 typed column `customers.referrer_customer_id uuid`
- **(c)** Phase 1 hard-code 「2」、helper 留 placeholder

Sub-agent 建議 **(a)** 配 fixture 補 2-3 筆即可顯示真實 KPI。

### Q6 — 月度趨勢 12 個月真實 query 還是 hard-code？

跟 CRM04B Q4 同類問題。

- **(a)** Phase 1 真實 query（fixture 補近 6 個月各 4-6 筆 → 線條完整）
- **(b)** Phase 1 hard-code spec 數字、helper 留 placeholder

Sub-agent 建議 **(a)**：fixture 補近 6 個月各 ~5 筆並不貴、且農曆年異常標記要靠真資料才有說服力。

---

## 6. 不在 Phase 1 範圍

- 真實「店長報表」匯出（Phase 1 只做 DataGrid 內建 Excel）
- 6 面向分數的問卷填寫 UI（屬 CRM02B 問卷編輯器內、需 facets section 升級）
- 自動 detractor → 主管 LINE 推播（屬 CRM06B / notifications hub）
- SA 個人 NPS 報表頁（drill-down 到單一 SA 的詳情）→ 屬店長報表模組
- 期間自訂 date range（Phase 1 5 個 preset 夠用）
- 競品 / 品牌間 NPS 比較
- 多店比較（目前 indian 1 店、無從比）
- NPS facet 細項 trend（單一面向的 6 個月趨勢線）

---

## 7. 落地前 audit checklist

```bash
# 1) UI 不直連 supabase
grep -rn "@/lib/supabase" \
  "src/app/(workspace)/crm/aftersales/nps" \
  src/components/aftersales-nps 2>/dev/null  # 預期 0 hit

# 2) nps_responses 寫入只走 helper、不亂寫
grep -rn "from(.nps_responses.)" "src/app/(workspace)/crm/aftersales/nps" 2>/dev/null  # 預期 0 hit

# 3) fixture audit
psql -c "
SELECT
  (SELECT count(*) FROM nps_responses WHERE brand_id='indian' AND kind='aftersales' AND metadata ? 'facet_scores') AS with_facets,
  (SELECT count(*) FROM nps_responses WHERE brand_id='indian' AND kind='aftersales' AND metadata ? 'ro_id') AS with_ro_link,
  (SELECT count(*) FROM repair_orders WHERE brand_id='indian' AND metadata ? 'service_type') AS ro_with_svc_type,
  (SELECT count(*) FROM call_tasks WHERE brand_id='indian' AND kind='aftersales' AND metadata->>'call_type'='d3') AS d3_call_tasks
"
# 預期：with_facets ≥ 24、with_ro_link ≥ 24、ro_with_svc_type ≥ 9、d3_call_tasks ≥ 6
```

---

## 8. Ming review 點

- [ ] **Q1 架構選邊**（共用銷售側 prop 控制 vs 售後拆獨立 component）→ sub-agent 傾向 (B) 拆獨立
- [ ] **Q2 service_type 落點**（metadata / typed / 從 prefix 衍生）→ 建議 metadata
- [ ] **Q3 follow_up_status 落點**（metadata / typed / 新表）→ 建議 metadata
- [ ] **Q4 sa_id 升 typed**（沿用 text / 升 uuid FK）→ 建議沿用 text
- [ ] **Q5 推薦轉介 KPI 來源**（metadata referrer / typed / hard-code）→ 建議 metadata
- [ ] **Q6 月度趨勢來源**（真實 query / hard-code）→ 建議真實 query
- [ ] CRM05B.1 ~ CRM05B.4 拆題顆粒度 OK 不 OK
- [ ] 確認 fixture 補資料清單（§2.7 七項）
- [ ] 共用元件抽到 `src/components/charts/` 是否同意

拍板後 Phase 2 落地，預估 3-4 天工。
