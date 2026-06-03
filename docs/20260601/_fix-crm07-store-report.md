# CRM07 店長綜合報表 — demo 假資料替換為真 query（2026-06-02）

## 目標
把 `src/app/(workspace)/crm/store-report/_components/store-report-view.tsx` 裡 RS（銷售）區塊
寫死的 demo 假資料，換成走 domain helper（`src/domain/store-overview.ts`）的真實 query；
算不出的誠實顯示「—」，不留假數字。Scope = `brand_id='indian'`。

## 改了哪些（誠實第一）

### A. Domain helper `src/domain/store-overview.ts`（read-only 新增 query，未動 schema）
1. 新增兩支型別 + 計算：
   - `TestDriveConversionKpi { completed, converted, rate|null }`
   - `SalesStaffRanking[] { rank, name(rs_name), newCarCount, usedCarCount, totalDeals, testDriveCount, topShareRate }`
2. `Promise.all` 多撈兩張既有表（皆 `.eq('brand_id', brand)`）：
   - `sales_orders`（rs_name / contract_type / status / customer_id / lead_id / created_at，限期間 cutoff）
   - `sales_test_drives`（status / completed_at / customer_id / lead_id）
3. **試駕轉化率**：期間內 `status='completed'` 試駕，其 lead_id/customer_id 是否命中有效
   （非 cancelled/draft）sales_orders → `converted/completed`。Indian 實測 = 5 完成 → 3 成交 = **60%**。
   `completed=0` 時 `rate=null`（UI 顯「—」）。
4. **RS 業績排行**：依 `sales_orders.rs_name` 聚合每位 RS 的 新車/中古/合計 成交台數；
   試駕次數以「試駕客戶 → 最早一張 order 的 rs_name」歸戶（資料稀疏，多為 0/「—」屬正常）。
   實測 top：黃淑芬 16 台、王志強/魏呈宇/陳曉芸 15 台…

### B. View `store-report-view.tsx`
| 行（原） | 原本（demo） | 改成 |
|---|---|---|
| ~348 rightTag | 「參考數據（demo lead 估算）」 | 「✅ 真實數據（sales_orders）」 |
| ~352 試駕轉化率 | 寫死 `value="62%"`、sub「(demo)」 | `testDriveConversion.rate` 真值，null→「—」、sub 顯實際分子分母 |
| ~351 新車成交 | `kpi.newCarCount`（leads converted=0）+ 假目標 10 台 | `salesStaffRanking` 新車合計（真）；移除假目標 |
| ~357 SectionTitle | 「RS 人員業績排行（demo · 設計稿示意）」 | 「RS 人員業績排行（本期）✅ 真實數據來源：sales_orders」 |
| ~360-365 排行表 | 寫死 陳志明/林雅婷/王建宏 三列 | `salesStaffRanking` 真資料；空時顯「（期間內無成交資料）」 |
| 排行表欄位 | NPS均分/D+3完成率/本月達成進度（個人，無真值） | 改為 成交合計 + 「相對第一名」占比（排行視覺化，附說明：系統無個人銷售目標欄位故不顯達成率） |
| ~367 Alert | 寫死「王建宏本月達成率僅 28%…」 | 改由真資料動態生成（末位 RS 成交台數 < 第一名一半時才示警，帶真實姓名與台數） |
| NpsBox 銷售NPS tag | 「參考值/static」 | 「真實數據/live」（nps_responses kind=sales 實測 24 筆，確為真） |
| 頂部 legend chip | 「RS 參考數據」(amber) | 「RS 真實數據」(綠) |
| v2 升版說明 banner | 僅提 SA 真實 | 補上 RS 亦真（sales_orders / sales_test_drives） |

### 仍顯「—」/相對指標的誠實理由
- **RS 個人達成率**：DB 無「個別 RS 銷售目標」欄位 → 不造假目標，改用「相對第一名占比」做排行條，並在表下加註說明。
- **RS 個人 NPS / D+3 完成率**：nps_responses 未可靠掛 RS、D+3 call_tasks 歸戶不穩 → 不放個人欄位（避免假數字），整欄移除而非塞「—」。
- **RS 試駕次數**：試駕資料稀疏且多無銷售顧問/未成交 → 部分顯「—」，已加註說明。

## 驗證結果
- `npx tsc --noEmit` → **0 error**（全專案）。
- `npx eslint "src/app/(workspace)/crm/store-report" src/domain/store-overview.ts` → **0 error**。
- 天條 `grep -rn "@/lib/supabase" "src/app/(workspace)/crm/store-report"` → **0 hit**（UI 全走 domain helper）。
- Live render（Playwright 登入 indian scope 打 localhost:3000）：
  - CRM07-01 近30天：HTTP 200、2878 chars、無 error overlay、banned=[]（無 demo/設計稿示意/王建宏/陳志明/林雅婷）
  - CRM07-02 近90天：HTTP 200、3144 chars、同上
  - 渲染佐證：「試駕轉化率 60% 完成試駕 5 → 成交 3」、「RS 人員業績排行（本期）✅ 真實數據來源：sales_orders」

## 結論
- **CRM07-01 / CRM07-02 → ✅**：兩場景頁面正常渲染、RS 區塊全為真實 query 結果、無任何 demo 假數字殘留。
- 一句話：CRM07 RS 區塊已從寫死 demo 全面換成 sales_orders / sales_test_drives 真實聚合，
  算不出的（個人目標/個人NPS）誠實移除或顯「—」並加註，tsc/eslint/天條/render 全綠。
