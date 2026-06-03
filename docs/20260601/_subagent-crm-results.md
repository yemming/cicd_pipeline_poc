# 客服管理（CRM）模組 — 實測回填結果（subagent）

> 對著現在跑著的真 React app（localhost:3000，admin + indian scope）逐場景重測。
> 19 場景對應 13 路由全部存在、live render 13/13 綠。
> 評級基於「讀 code 找 domain helper 真資料 + 關鍵互動真接 DB/action + live 綠」三重舉證。

## verify 腳本
- `scripts/verify-crm-scenarios.mjs`（照 verify-group-smoke.mjs 登入法）
- **pass：13/13 綠**（全部 HTTP 200、body 充足、無 error overlay / 無權限阻擋）

## Indian brand 真資料（非空殼，已用 SQL 確認）
customers 52・survey_templates 12・call_tasks 138（pending 91/completed 34/in_progress 12）・sales_leads 43（dormant 17/lost 15/active 8/revived 3）・nps_responses 142（sales 38 / aftersales 104）・push_campaigns 17・work_orders 33。
售後客戶 aftersales_dormancy_status 已分布（dormant_60=5/120=4/180=4/lost=11/active=5/null=23）。

## 天條 audit
`grep "@/lib/supabase" src/app/(workspace)/crm` → **0 hit**，全走 @/domain/* helper，合規。

## 場景評級表

| 場景 | 路由 | 評級 | 證據（page+helper、真資料?） | live | 說明 |
|---|---|---|---|---|---|
| CRM01A-01 查詢潛客資料 | /crm/sales/customer-base | ✅ | `sales-customer-base.ts` 真連 customers（52筆）+ filter；非寫死8筆 | 綠 | 真客戶清單+篩選+分頁，DataGrid |
| CRM01A-02 RS01手卡同步至CRM01A | /crm/sales/customer-base ← sales/reception/handcard | ⚠️ | `crm-sync.ts upsertCustomer360` 被 handcard-form onSave 呼叫，真寫 customers.metadata.last_handcard_snapshot；**但只更新已存在客戶，找不到就 demo，不會自動建新客戶讓他出現在清單** | 綠 | 觸發鏈真存在但「同步=新增客戶到基盤」缺一段（只 merge metadata，無 upsert insert） |
| CRM01A-03 RS05交車→自動建售後客戶檔案 | CRM01A→CRM01B | ⚠️ | customers 為 sales/aftersales 共用同一張表，無「交車事件→自動轉移/建檔」觸發鏈（grep 無 after()/server action 串接 deal→customer） | 綠 | 同表共用使資料天生「都看得到」，但沒有真正交車自動建檔的事件鏈 |
| CRM02A-01 問卷啟用→自動套用CRM03A工作台 | /crm/sales/survey-templates | ✅ | `survey-templates-actions.ts` 完整 CRUD+版本管理+SA話術+啟用 toggle 真接 DB；call-task lookups（getCallTaskLookups）撈 active survey_templates 餵工作台 | 綠 | 問卷啟用後建電訪任務時可選用，真資料串通 |
| CRM03A-01 D+3/D+7電訪任務自動排程 | /crm/sales/call-tasks | ⚠️ | call_tasks 表+scheduled_at 真存在、工作台真讀（getCallTaskBoardData）；**但無 cron/after() 自動產生 D+3/D+7 task 的排程器，任務靠人工/seed 建立** | 綠 | 排程欄位與顯示真，但「自動排程產生」缺觸發器 |
| CRM03A-02 電訪記錄與結果儲存（含NPS計入、逾期警示） | /crm/sales/call-tasks | ✅ | `call-tasks-actions.ts recordCallResultAction` 真 update call_tasks + answered 時 insert nps_responses（連 call_task_id）；逾期 runtime 由 scheduled_at 算 | 綠 | 電訪結果與 NPS 真寫 DB、計入看板 |
| CRM04A-01 休眠客戶自動分類30/60/90 | /crm/sales/dormant-leads | ⚠️ | `sales-dormant-leads.ts` 真讀 sales_leads.dormancy_status + bucket30_60/60_90/90plus 統計（runtime 天數計算真）；**但 dormancy_status 是 typed 欄位存靜態值，無 cron 把 active 自動降級成 dormant** | 綠 | 分桶統計與天數 runtime 真算，但「自動分類降級」靠人工標/seed |
| CRM04A-02 戰敗記錄與原因分析（RS01標戰敗→統計） | /crm/sales/dormant-leads | ✅ | `getDormantLeadStats` 真 group lost_reason / competitor（reasonBreakdown/competitorBreakdown）；標戰敗走 sales-dormant-leads-actions 真寫 lost_reason/lost_at | 綠 | 戰敗原因/競品分析真資料統計（lost 15 筆） |
| CRM05A-01 NPS分數即時計算（非寫死） | /crm/sales/nps | ✅ | `sales-nps.ts getSalesNpsDashboard` 真讀 nps_responses（sales 38筆）即時算 promoter-detractor；非 +62 寫死 | 綠 | NPS 真計算+門店分組+趨勢 |
| CRM06A-01 推播通知實際發送（LINE/簡訊） | /crm/sales/push-notifications | ⚠️ | 模板/活動/自動化規則 CRUD 真接 DB（push-templates/campaigns/automation-actions）；**createCampaignAction 只 insert push_campaigns，不真發 LINE/SMS（無 notifications.dispatch）；KPI 部分 demo 近似值（sms:0、audience fallback 200）** | 綠 | 推播設定/活動/成效看板真，但「實際發送」未接通路 |
| CRM01B-01 工單關閉→客戶資料自動同步（回廠日/累計消費） | /crm/aftersales/customer-base | ⚠️ | `aftersales-customer-base.ts` 真 join work_orders 算 last_visit/累計（33工單）；**runtime join 顯示是真，但無「工單關閉事件→寫回客戶欄位」的自動觸發鏈** | 綠 | 回廠日/消費由 runtime join 即時算（效果等同同步），但非事件驅動寫回 |
| CRM01B-02 Desmo/保固/保險到期快篩 | /crm/aftersales/customer-base | ⚠️ | customer_vehicles 真讀；到期快篩屬顯示/篩選層，依 metadata/typed 欄位呈現 | 綠 | 篩選骨架在、真資料來自 vehicles；自動到期推播見 CRM06B-01 |
| CRM03B-01 售後電訪任務自動產生（工單關閉D+3滿意度） | /crm/aftersales/call-tasks | ⚠️ | reuse sales CallTasksBoard（kind 鎖 aftersales）真讀 call_tasks（aftersales NPS 104筆）；recordCallResult 真寫 nps；**但「工單關閉 D+3 自動產生 task」無觸發器** | 綠 | 工作台與記錄真，自動產生缺事件鏈 |
| CRM02B-01 售後問卷與銷售問卷獨立 | /crm/aftersales/survey-templates | ✅ | reuse SurveyTemplatesBoard 但 kind 鎖死 'aftersales'，survey_templates 同表不同 kind 真隔離（12筆含兩 kind） | 綠 | 售後問卷獨立維護，真資料隔離 |
| CRM04B-01 售後流失客戶自動分類30/60/120 | /crm/aftersales/dormant-customers | ⚠️ | `crm-aftersales-dormant.ts` 真讀 customers.aftersales_dormancy_status（dormant_60/120/180/lost 真分布）+ work_orders 算 days_overdue（runtime 真）；**但 dormancy_status 為 typed 欄位靜態值，無 cron 自動降級** | 綠 | 逾期天數 runtime 真算，自動分類降級靠人工/seed |
| CRM05B-01 售後NPS獨立計算+CRM07對比 | /crm/aftersales/nps | ✅ | `crm-aftersales-nps.ts getAftersalesNpsDashboard` 真讀 nps_responses kind=aftersales（104筆）獨立計算；store-overview 同源做對比 | 綠 | 售後 NPS 獨立真算 |
| CRM06B-01 Desmo/保固到期自動推播 | /crm/aftersales/push-notifications | ⚠️ | reuse push 看板真讀 push_campaigns + automation rules（toggleAutomationRuleAction 真寫 is_active）；**自動推播規則可開關但不真發送（無 cron 掃到期→dispatch）** | 綠 | 自動化規則骨架在、可啟停，實際到期推播未接通路 |
| CRM07-01 店長一頁掌握三大模組KPI | /crm/store-report | ⚠️ | `store-overview.ts getStoreOverview` 真彙整 nps/sales_leads/call_tasks/work_orders/customers/push_campaigns（多表真 query）；**但 view 內部分寫死（試駕轉化率62%、RS人員業績排行標「demo·設計稿示意」、試駕KPI demo）** | 綠 | 大部分 KPI/NPS對比/SA排行/客戶標籤真彙整，少數銷售側 KPI 仍 demo |
| CRM07-02 智能異常偵測提示 | /crm/store-report | ⚠️ | getStoreOverview 真產生 alerts[]（依 NPS批評者/逾期等規則 push，含 runtime 接最近批評者客戶名）；**但有一條「店長注意：王建宏…28%」alert 為硬寫死 JSX，非規則產生** | 綠 | 異常偵測規則引擎真存在（真資料觸發），混入 1 條寫死示意 alert |

## 評級分佈
- ✅ = 8（CRM01A-01、02A-01、03A-02、04A-02、05A-01、02B-01、05B-01）→ 實為 7 個 ✅ 場景；
  正確計：✅ 7（CRM01A-01 / CRM02A-01 / CRM03A-02 / CRM04A-02 / CRM05A-01 / CRM02B-01 / CRM05B-01）
- ⚠️ = 12（CRM01A-02 / CRM01A-03 / CRM03A-01 / CRM06A-01 / CRM01B-01 / CRM01B-02 / CRM03B-01 / CRM04A-01 / CRM04B-01 / CRM06B-01 / CRM07-01 / CRM07-02）
- ❌ = 0（無路由不存在、無頁面壞掉、無完全未實作）

**合計 19 場景：✅ 7 / ⚠️ 12 / ❌ 0**

## 本輪修了哪些 bug
- **無**。13 路由 live render 全綠、無 crash、無 TS 型別錯、無天條違規（CRM 頁 0 hit `@/lib/supabase`），不需修改任何 code。僅新增 `scripts/verify-crm-scenarios.mjs`。
- tsc --noEmit：0 error。

## 跨模組自動觸發缺口（⚠️ 的根因，回填 Word 重點）
舊 Word 全標 ❌ 是因對著靜態 Stitch HTML 評。實況是頁面已全部 React 化 + 真資料，**單頁讀寫場景多半 ✅**。剩下的 ⚠️ 全卡在「跨模組自動觸發鏈」尚未接通，逐一列明缺哪段：

1. **手卡同步（CRM01A-02）**：upsertCustomer360 只 merge 已存在客戶的 metadata，缺「找不到客戶就 insert 新客戶」這段 → 新潛客手卡存了不會出現在基盤清單。
2. **交車自動建售後檔（CRM01A-03）**：靠 customers 同表共用「看得到」，缺真正的「交車 deal 完成 → 事件 → 建/標記售後客戶」鏈。
3. **D+3/D+7 自動排程（CRM03A-01 / CRM03B-01）**：call_tasks 表與 scheduled_at 都在，缺 cron / after() 在「交車後 / 工單關閉後」自動 insert 排程任務。現靠人工或 seed 建。
4. **休眠自動分類降級（CRM04A-01 / CRM04B-01）**：dormancy_status 是 typed 靜態欄位，逾期天數 runtime 真算，但缺定時 job 把 active 客戶自動降級成 dormant_60/120/180。
5. **推播實際發送（CRM06A-01 / CRM06B-01）**：活動/模板/自動化規則 CRUD 全真接 DB，缺最後一哩「建立活動 / 規則命中 → notifications.dispatch 真發 LINE/SMS」。專案已有 Notification Hub（feedback_ticket.created 已串），接 CRM 推播是現成路。
6. **工單關閉同步（CRM01B-01）**：回廠日/累計消費由 runtime join work_orders 即時算（顯示效果等同同步），但非事件驅動寫回客戶欄位。
7. **店長報表（CRM07-01/02）**：getStoreOverview 多表真彙整 + alerts 規則引擎真跑，但混入幾處 demo 寫死（試駕轉化率62%、RS業績排行示意、1 條王建宏 alert），需替換成真 query 才能升 ✅。
