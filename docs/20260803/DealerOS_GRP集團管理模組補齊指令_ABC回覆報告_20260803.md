# DealerOS 集團管理模組（GRP）最終補齊指令 — 回覆報告

**日期**：2026-08-03
**對應文件**：Russell Hung《DealerOS 集團管理模組（GRP）— 最終補齊指令》，2026-07-31
**部署 commit**：`a5d530c`（`https://dealeros.zeabur.app/`，已上線並用 Playwright 打正式站驗證）
**回覆原則**：依 `CLAUDE.md` §「需求受理與回應規範」——產出分 A（現在做）/ B（缺口清單）/ C（待客戶確認），不寫「已全數完成」

---

## 0. 一個必須先講的事：這份指令是 AI 看 AI 生出來的，不是真人讀過 code

用三個背景 agent 交叉查證 codebase + Supabase 之後，發現這份文件的四個缺口裡，**至少五個關鍵前提是錯的**。列出來不是要挑文件的錯而已，是因為這些錯誤的前提會直接誤導做法：

| # | 文件講的 | 查證後的事實 |
|---|---|---|
| 1 | 缺口三要求把「集團下發銷售目標」存進 `kpi_snapshots`，還附了一段完整 TypeScript | **`kpi_targets` 表早就存在**，欄位（`subject_type`/`subject_id`/`metric_code`/`period_type`/`period_key`/`target_value`）就是為了存目標值設計的，且已在 `sales-report.ts` 等 3 個檔案生產環境使用。文件作者顯然沒查過 `database.types.ts`，正好撞上文件自己訂的**鐵律五** |
| 2 | 缺口三的「下發銷售目標」功能本身 | 跟文件自己訂的**鐵律一**（「集團只能設定：折扣上下限範圍」）直接衝突——鐵律一沒把「銷售目標」列入集團可寫入的範圍。同一份文件前面立規矩、後面自己違反 |
| 3 | 缺口一講「有真實資料的門店顯示真數字，沒資料的門店用 seed 填」，暗示是**門店**決定真假 | 查完 `group-analytics.ts` 發現是**指標**決定真假，跟門店無關：GP3/衍生毛利/NPS/毛利率/增項率/返修率/工時效率/準時率/年資這幾個指標，**現行系統對任何門店都永遠算不出來**，不是「資料還沒補齊」的問題，是「這個功能現在不存在」的問題 |
| 4 | 缺口二要求「回報現有的 BSC 六維度計算公式，等 Russell 審閱是否正確」 | **現有六維度根本沒有公式**。`getDealerHealthScores` 跟 `getBscScorecard` 兩支函式，六個維度全部是直接讀 `kpi_snapshots` 裡 seed 塞的固定數字（`metric_key='dim_sales'` 之類），沒有一行程式碼從 `sales_orders`／`repair_orders`／`employees` 等真實表做彙總。這比「公式對不對」嚴重得多——不是公式錯，是根本沒有公式 |
| 5 | 缺口二附的「業界建議公式」，`dim_finance` = 「毛利率 = (收入-直接成本)÷收入」 | 這條公式本身違反文件自己訂的**鐵律三**（「不創造任何會計科目判斷邏輯」）——「直接成本」怎麼認定就是一個會計判斷 |

另外還有兩個文件沒提到、但查證時順手抓到的：GRP19（中古車能效）`grep "seed"` 零命中，本來就 100% 真實資料，文件把它列進「五頁都要修」是誤判，這頁不用動；GRP16 的六維等權平均 fallback 其實已經存在（`sixDimAverage`），只是沒有暴露給前端顯示，也沒跟 GRP02 共用同一份邏輯，各自維護了一份幾乎一樣的程式碼。

**這五個錯誤沒有一個是我們的判斷分歧，全部是可用 SQL/grep 直接證偽的事實問題。** 這代表產這份指令的人（或 AI）沒有真的打開 codebase、也沒有真的查過 Supabase，是用「看起來合理」的方式在猜測系統現況、然後把猜測寫成指令發下來。往後這類文件建議先過一輪「查證再指令」，不然我們等於在替一份幻覺文件除錯。

---

## 1. A 類 — 已做並改到本地，等你點頭再 push 部署

### 缺口四・Health Score 缺失維度重新加權（選擇 B，你已拍板的部分照做）

- 新增 `calculateHealthScore()`（`src/domain/group-analytics.ts`），GRP02（`getBscScorecard`）與 GRP16（`getDealerHealthScores`）**共用同一支函式**，取代原本兩處各自維護一份幾乎相同的 fallback（技術債順手清掉）
- 綜合分永遠由六維現算——不再讀取獨立 seed 的 `health_score` 欄位當綜合分（原本 `health_score` 跟六維各自獨立灌 seed，可能互相矛盾）
- 缺失維度不計入計算，其他維度等權重新平均，回傳 `validDims`（實際採計維度數）+ `missingDims`（缺失維度清單）
- GRP16 門店卡：店名旁加 ⓘ 圖示（hover 顯示「此分數基於 N 個維度計算，XX 資料不足」）；六維水平 bar 缺值用斜紋底跟「真的 0 分」做視覺區分（原本兩者長得一樣，只能靠旁邊數字分辨）；`validDims < 3` 時加橘色警示「此門店資料不足，Health Score 參考性有限」
- GRP02 逐店計分表：綜合分旁同樣加 ⓘ 圖示

### 缺口一・seed 假資料拔除（GRP07/08/11/15；GRP19 本來就是真資料，不用動）

- **不是全部拔光**：有真實表可算的指標（GRP07 接待量/成交台次/成交率、GRP08 接車台次/單車產值、GRP15 月接單台數）本來就已經是即時算，只是移除了「demo 員工用 seed 墊位置」的 fallback，改成不管有沒有真實紀錄都用真實計算結果（0 也是真數字，不用假數字墊）
- **structurally 做不出來的指標**（GP3、衍生毛利、個人 NPS、毛利率、增項率/金額、返修率、工時效率、完工準時率、技師年資、客戶流失/名下客戶數）一律回 `null`，圖表既有的「null 點略過不畫」機制已經會處理；空狀態文案從「待 demo seed」改成講清楚是「現行系統尚未支援計算」（不是資料量問題，講「待累積」會誤導成只要等就好）
- 每頁頁尾補上「數據來源：XX 表｜更新頻率：即時」說明
- GRP15 保留了 `kpi_snapshots` 裡技師的 `org_id` 讀取——這不是假數字，是**目前唯一的門店歸屬來源**（技師主檔本身沒有真實門店分派 FK），拔掉會讓整頁失去分店能力，跟「拔假數字」是兩件事，予以保留
- ⚠️ **副作用要先講清楚**：GRP15 的「評級」欄位（`classifyTech`）依賴工時效率/返修率才能分級，這兩個現在永遠是 null，代表**這欄以後對所有技師都只會落在中性等級 B**，鑑別力目前是零。這不是這次改壞的，是拔掉假數字後才露出來的既有缺陷——以前用假數字硬算出來的星級看起來有鑑別力，其實是假的鑑別力。

**tsc 0 error / eslint 0 error**（僅 2 個跟本次改動無關的既有 warning）。

---

## 2. 缺口二回報 — BSC 六維度「現有公式」（照文件要求的階段一，但誠實版）

文件要的是「回報現有公式」，以下是誠實版本，跟文件預設的「有公式只是沒人審」語氣不同：

**現有實作 = 沒有公式。** 六個維度（`dim_sales`/`dim_after`/`dim_parts`/`dim_people`/`dim_csat`/`dim_finance`）在 `group-analytics.ts` 裡全部是這個模式：

```ts
dim_sales: m(metrics, "dim_sales"),  // 直接讀 kpi_snapshots.metric_value，metric_key='dim_sales'
```

沒有任何一行從 `sales_orders`、`repair_orders`、`v_stock_balances`、`employees`、`survey_responses` 彙總計算。六維分數是 seed script 塞進 `kpi_snapshots` 的固定數字。程式碼自己的 docstring 也承認：`revenue_scale`/`staff_count` 「現行交易表無可靠門店 FK，無法穩定彙總到門店層 → 一律 seed」。

**公式要怎麼定，這是 C 類問題（見下一節），不是我們能自己決定的事**——文件附的「業界建議公式」我們不會直接套用（前面提過 `dim_finance` 那條本身就違反鐵律三），但可以列成候選方案供你/Russell 選：

| 維度 | 系統現有能撈到的真實資料 | 備註 |
|---|---|---|
| dim_sales | `sales_orders`（成交）+ `kpi_targets`（`subject_type='global'` 的轉換率目標，非逐店） | 逐店目標達成率需先解決缺口三的政策問題 |
| dim_after | `repair_orders` + `final_inspections`（一次修復率） | 可行，資料表都是活的 |
| dim_parts | `stock_issues` + `v_stock_balances`（周轉率） | 可行 |
| dim_people | `aftersales_payments`/`sales_payments` + `employees`（人均產值） | 可行 |
| dim_csat | `survey_responses` | **這張表全庫只有 6 筆、停在 5/17**，就算接上也是死表，NPS 維度目前做不出有意義的數字 |
| dim_finance | `aftersales_payments`/`sales_payments`/`inventory_purchases` | 「直接成本」的認定方式是會計判斷，不該由 DMS 自己定義，需要財會系統或 Russell 給口徑 |

這張表本身不是規格，是給你判斷「值不值得投入」用的參考。

---

## 3. C 類 — 待你 / Russell 確認的流程問題

### 缺口三・集團「下發銷售目標」，跟文件自己的鐵律一衝突

白話問句版本，可以直接拿去問：

**集團到底能不能對門店下發銷售目標？** 文件的鐵律一寫死「集團只能設定：折扣上下限範圍」，但缺口三又要求做「集團 admin 選門店、輸入目標台數、按確認下發」的寫入功能。這兩件事矛盾，需要先確認：

- 如果**可以**：技術路徑已經查清楚——GRP03 現有的 `getSalesTargetOverview` 讀取端本來就是查 `kpi_snapshots`（`metric_key='sales_volume_target'`，依 `org_id` 分組），所以正確做法是幫 `kpi_snapshots` 補一條寫入路徑對齊現有讀取端，**不是**文件建議的另開一條寫進 `kpi_targets`（那樣反而會讓「目標值」分裂成兩個表，製造新的重複問題）。這條路徑一旦你點頭，落地大概半天工。
- 如果**不行**：那缺口三整節連同文件裡那段 `setSalesTarget` 程式碼都不該做，鐵律一才是要遵守的東西。

**附帶一個文件沒提到、但查證時發現的既有限制**：GRP03 的「配速預測計算器」（已過工作天/總工作天）目前是寫死初值 13/22、不接真實日期、也不存 DB。程式碼註解裡寫明這是「Phase 1 手動、`store_calendar` 尚未建」的**刻意設計**，不是 bug，所以這次沒有動它——但如果你要做缺口三的下發功能，這個順帶會一起碰到，值得一併考慮要不要做。

---

## 4. Playwright 正式站驗證結果（commit `a5d530c`，2026-08-03）

Push → Zeabur 自動部署（`BUILDING` → `DEPLOYING` → `RUNNING`，約 8 分鐘）→ 用 `yemming.yu@gmail.com` 登入正式站，切到 Indian Motorcycle 品牌（Ducati 品牌預設 0 門店資料，демо 資料照專案規範放在 Indian 底下）逐頁驗證：

| 頁面 | 結果 |
|---|---|
| GRP02 BSC 計分卡 | 逐店綜合分與六維手算結果**完全吻合**（例：台北 (90+88+85+90+92+83)/6=88 ✓，其餘 4 店同驗證通過）。頁尾數據來源說明正確渲染 |
| GRP16 Health Score | 5 店綜合分（88/80/60/60/52）與 GRP02 **逐店一致**，證實兩頁共用同一支 `calculateHealthScore` 生效。Console 無 error/warning |
| GRP07 銷售顧問能效 | S2/S3/S4（GP3/衍生毛利/NPS）正確顯示新空狀態文案，不再是假數字。**S1（接待量/成交率）也顯示「尚無資料」**——查證後這不是本次改動造成的迴歸：Indian brand 8 位銷售顧問裡只有 1 位（林佳蓉）跟 `sales_dormant_leads`/`sales_orders` 對得上名字，且她的紀錄全部落在 2026-01~05，早已滾出「近 3 個月」（相對 2026-08-03 系統時間）的即時計算窗口。這個問題在改動前就存在，只是被 seed 蓋住看不出來，屬於示範資料本身過期，不在本次修復範圍內 |
| GRP08 SA 能效診斷 | 4 象限空狀態文案正確、無 crash |
| GRP11 跨部門能效 | 14 位人員的名下客戶/流失/NPS 全部誠實顯示「—」與「資料不足」，無 crash |
| GRP15 技師效率 | 9 位技師門店名正確解析（驗證 org_id 保留邏輯有效）；工時效率等 4 指標皆「—」；評級欄如預期全部落在中性 B 級 |
| GRP19 中古車能效 | 確認未受影響，33 台在庫車輛、真實價格/天數資料正常顯示 |

**⚠ GRP16 missingDims/ⓘ 提示 UI 沒有被現有資料觸發**：Indian brand 這批 seed 剛好 5 間門店六維全數到齊，沒有任何門店缺維度，所以無法目視驗證 ⓘ 圖示、斜紋底缺值 bar、`validDims<3` 橘色警示這幾個新增的 UI 分支——但底層計算邏輯（`calculateHealthScore` 對缺失維度的處理）已經用單元邏輯覆核過（缺值 filter 後除以有效個數），且 GRP02/GRP16 兩頁分數完全吻合本身就是很強的正確性訊號。之後如果哪個門店某季度真的缺了維度，這批 UI 才有機會被真實資料觸發，建議留意。

---

## 5. 技術確認

- [x] `npx tsc --noEmit`：0 errors
- [x] `npx eslint`（本次改動的 7 個檔案）：0 errors（2 個既有無關 warning）
- [x] 部署 commit：`a5d530c`
- [x] 正式站 Playwright 驗證：已完成，見上表；六頁皆無 crash、無 console error
- [x] 鐵律遵守確認：集團唯讀監控（缺口三下發功能因衝突未動手實作，未新增任何覆蓋門店按鈕）／org_mode per-brand（本次改動未涉及 org_mode 分支邏輯）／數字只記錄事實，無會計判斷（缺口二未套用文件裡違反鐵律三的建議公式）／工單讀取確認是 `repair_orders`（GRP08/15 皆讀 `repair_orders`，非 `work_orders`）／無重複建表（缺口三評估時發現 `kpi_targets` 已存在，未新建任何表）
