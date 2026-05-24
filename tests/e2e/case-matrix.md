# 第十一輪 E2E · Case Matrix（34 條案例對映表）

> 來源：`docs/DealerOS_全系統測試腳本_v1.0.docx`（28 案例 + 6 跨模組串接 = 34）。
> BDN 主卡：`36a66ade-b1d3-8147-a77a-dddfb84330ad`（Batch E-I）。
>
> 每支 spec 用 `import { test, expect, useRole } from "./helpers/role-fixtures"`，
> `useRole(persona)` 鎖 storageState（8 persona 帳號全 Indian brand，由 `scripts/e2e-login-all-roles.mjs` 產出）。
> **CROSS×6 全部 `test.skip`** — 前面 batch 全綠才解。
> 報表金標標 ⭐，骨架註解標明對 `fixtures/report-baselines.json` 的 baseline key 容差 ±2%。

## 8 persona ↔ DB role 對映

| persona key | DB role | 中文 | 主要案例 |
|---|---|---|---|
| `rs_manager` | rs_manager | 銷售主管 / 店長 | RS-01~06（主管視角）、CRM-04（店長） |
| `sales_lead` | sales_lead | RS 銷售顧問（個人視角） | RS-07A/B/C、RS-08/09/10 |
| `crm_agent` | crm_agent | CRM 主管 / 客服專員 | CRM-01/02/03 |
| `sa` | service_advisor | SA 售後接待 | SA-01/02/06/08/09 |
| `tech` | technician | Tech 車間技師（接 T1 陳建明） | SA-03/04（施工標記） |
| `aftersales_lead` | aftersales_lead | 售後主管 / 資深 Tech（複檢） | SA-05/07/10、SA-09 報表 |
| `warehouse` | warehouse | 倉管人員 | INV-02/03/04/08（執行） |
| `stock_lead` | stock_lead | 庫房主管 | INV-01/05/06/07（審核 / 報表） |

---

## RS · 銷售接待模組 ×10（Batch E）

| case | 標題 | spec:describe | persona(role) | 依賴 | route | 報表金標 |
|---|---|---|---|---|---|---|
| RS-01 | 銷售主管每日登入 — 工作台首頁檢視 | `rs.spec.ts` › RS-01 | rs_manager | — | `/sales/overview`（主管工作台，fallback `/sales/manager`） | |
| RS-02 | 銷售漏斗 — 主管視角 ↔ RS 個人視角切換 | `rs.spec.ts` › RS-02 | rs_manager + sales_lead（多 context） | — | `/sales/manager/funnel`（主管）/ `/sales/funnel`（個人） | |
| RS-03 | 業績報表 — 本月新車 / 中古車銷售彙整 | `rs.spec.ts` › RS-03 | rs_manager | RS-10（成交數字）| `/sales/manager/sales-report` | ⭐ `rs_03_sales_report` |
| RS-04 | KPI 目標設定 — 月初主管手動調整標準值 | `rs.spec.ts` › RS-04 | rs_manager | — | `/sales/manager/kpi-targets` | |
| RS-05 | RS 人員管理 / 員工九宮格 / 手卡參數 / 客群標籤 | `rs.spec.ts` › RS-05 | rs_manager | — | `/sales/manager/staff`、`/sales/manager/staff-grid`、`/sales/settings/handcard-params`、`/sales/settings/customer-tags` | |
| RS-06 | 新車 / 中古車庫存查詢 — 權限與庫存串接 | `rs.spec.ts` › RS-06 | sales_lead（唯讀）+ rs_manager（可編輯）| — | `/sales/showroom/new-cars`(RS03A)、`/sales/showroom/used-cars`(RS03B) | |
| RS-07A | 接待手卡 — 陳先生潛客再訪、車型轉換、試乘後考慮 | `rs.spec.ts` › RS-07A | sales_lead | — | `/sales/reception/handcard`、`/sales/reception/new`(RS01) | |
| RS-07B | 接待手卡 — 劉小姐首次來店、增購、有競品考量 | `rs.spec.ts` › RS-07B | sales_lead | — | `/sales/reception/handcard`(RS01)、`/usedcar/evaluation`(RS06) | |
| RS-07C | 接待手卡 — 何先生現有車主回訪、原 RS 離職轉接 | `rs.spec.ts` › RS-07C | sales_lead | — | `/sales/reception/handcard`(RS01)、`/sales/quote`(RS04)、`/usedcar/evaluation`(RS06) | |
| RS-08 | 試乘試駕 — 車輛安排、電子簽名、試乘記錄 | `rs.spec.ts` › RS-08 | sales_lead | RS-07A（手卡）| `/sales/reception/test-rides`(RS02)、`/sales/showroom/new-cars`(RS03A) | |
| RS-09 | 置換評估 — 中古車估價、自動關聯手卡、進中古庫存 | `rs.spec.ts` › RS-09 | sales_lead + rs_manager（審核）| RS-07C（手卡）| `/usedcar/evaluation`(RS06)、`/sales/showroom/used-cars`(RS03B) | |
| RS-10 | 報價簽訂 → 交車流程 → 保險業務 完整成交 | `rs.spec.ts` › RS-10 | sales_lead + rs_manager（折扣審核）| RS-07A、RS-08 | `/sales/quote`(RS04)、`/sales/delivery`(RS05)、`/sales/insurance`(RS_EX1) | |

> RS 是 11 條 test（RS-07 拆 A/B/C），主卡列為 10「案例」。matrix/spec 以 11 個 test 計（RS-07A/B/C 各一）。

---

## CRM · 客服管理模組 ×4（Batch F）

| case | 標題 | spec:describe | persona(role) | 依賴 | route | 報表金標 |
|---|---|---|---|---|---|---|
| CRM-01 | 銷售 CRM — 客戶基盤查詢與電訪工作排程 | `crm.spec.ts` › CRM-01 | crm_agent | RS-10（陳先生成交客戶）| `/crm/sales/customer-base`(CRM01A)、`/crm/sales/survey-templates`(CRM02A)、`/crm/sales/call-tasks`(CRM03A) | |
| CRM-02 | 銷售 CRM — 休眠戰敗管理與推播通知 | `crm.spec.ts` › CRM-02 | crm_agent | — | `/crm/sales/dormant-leads`(CRM04A)、`/crm/sales/nps`(CRM05A)、`/crm/sales/push-notifications`(CRM06A) | |
| CRM-03 | 售後 CRM — 客戶基盤、電訪、休眠流失 | `crm.spec.ts` › CRM-03 | crm_agent | SA-06（何先生回廠 / 同步）| `/crm/aftersales/customer-base`(CRM01B)、`/crm/aftersales/call-tasks`(CRM03B)、`/crm/aftersales/dormant-customers`(CRM04B) | |
| CRM-04 | 店長綜合報表 — 三大模組 KPI 一頁總覽 | `crm.spec.ts` › CRM-04 | rs_manager（店長）| RS-03 數字、SA 工單、INV 庫存 | `/crm/store-report`(CRM07) | ⭐ `crm_04_store_report` |

> **CRM-05 NPS 看板**（報表金標）不是獨立案例，而是 CRM-02 內嵌 CRM05A（`/crm/sales/nps`）+ CRM-03 內嵌 CRM05B（`/crm/aftersales/nps`）的驗證點。
> spec 在 `crm.spec.ts` 另開 describe `CRM-05` 專測 NPS 看板數字，baseline key `crm_05_nps_dashboard`（銷售）+ `crm_05_nps_aftersales`（售後），容差 ±2%。

---

## SA · 售後修護模組 ×10（Batch G — 強制 serial 同一張工單）

> SA-01 → **SA-02** → SA-03 → SA-04 → SA-05 → SA-06 是一條工單（何先生 Multistrada V4S / IMC-003）生命週期，**不能跳順序**。

| case | 標題 | spec:describe | persona(role) | 依賴 | route | 報表金標 |
|---|---|---|---|---|---|---|
| SA-01 | 預約管理 — 新增預約、當日看板、技師工作負載 | `sa.spec.ts` › SA-01 | sa | — | `/parts/aftersales/appointments`（01 預約看板）、`/parts/aftersales/appointments/new` | |
| SA-02 | ⭐核心交接 預檢 → RO 串接 → 派工（SA→Tech）| `sa.spec.ts` › SA-02 | sa（預檢/派工）+ tech（接單，多 context）| SA-01 + C4(Tech 工作台) + C1(防重) | `/parts/aftersales/pre-inspections/new`(04)、`/parts/aftersales/repair-orders`(02)、`/parts/aftersales/management/dispatch`(07 派工)、`/tech`(Tech 接單) | |
| SA-03 | 維修項目零件明細 — Tech 施工、零件領料、庫存串接 | `sa.spec.ts` › SA-03 | tech（主）+ warehouse（配合）| SA-02 + C2(領料守門) | `/tech`(03 Tech 版)、`/parts/issue/repair-pick`(06 維修領料) | |
| SA-04 | 追加項目記錄 — Tech 標記、SA 協商、備件預留 | `sa.spec.ts` › SA-04 | tech（標記）+ sa（協商）| SA-03 + B3(reservations)| `/tech`(04 追加)、`/parts/aftersales/addons`(04 追加項記錄) | |
| SA-05 | 竣工複檢 — 資深 Tech / 主管五步驟複檢、授權簽名 | `sa.spec.ts` › SA-05 | aftersales_lead（複檢，非施工 tech）| SA-04 | `/parts/aftersales/final-inspections/new`(06 竣工複檢) | |
| SA-06 | 結帳收款 / 取車通知 / 工單查詢 / 人車檔案 | `sa.spec.ts` › SA-06 | sa | SA-05 | `/parts/aftersales/checkout`(08)、`/parts/aftersales/pickup-notifications`(11)、`/parts/aftersales/ro-search`(10)、`/parts/aftersales/customers`(09) | |
| SA-07 | 車間看板 — 工位管理、技師派工、工時追蹤 | `sa.spec.ts` › SA-07 | aftersales_lead | SA-02（RO 派工至工位）| `/parts/aftersales/management/bays`(07 車間 Tab) | |
| SA-08 | 售後主管設定 — 人員名冊、前綴碼、客戶標籤 | `sa.spec.ts` › SA-08 | aftersales_lead | — | `/parts/aftersales/management/staff`(07 人員)、`/parts/aftersales/management/ro-numbering`(前綴碼)、`/parts/aftersales/management/customer-tags`(12 標籤) | |
| SA-09 | 人效統計 / 工單查詢 / 人車檔案 資料完整性 | `sa.spec.ts` › SA-09 | aftersales_lead | SA-02~05（蔡 OO 工單計入）| `/parts/aftersales/management/bays`(07 人效 / 工位效率統計)、`/parts/aftersales/ro-search`(10)、`/parts/aftersales/customers`(09) | ⭐ `sa_09_tech_efficiency` |
| SA-10 | 售後主管工作台 — 每日 KPI 確認與異常處理 | `sa.spec.ts` › SA-10 | aftersales_lead | SA-03（待料工單）| `/parts/aftersales`（售後主管工作台 root）、`/parts/aftersales/management/bays`(07 車間 Tab) | |

> SA-09 的「人效統計」讀 `aftersales_technicians` 快照欄（`getTechnicianEfficiencySummary()`，見 BDN B2-B），surfaced 於工位看板的「工位效率統計」區。baseline 抓 6 技師效率梯度（145%→98%）。

---

## INV · 庫存管理模組 ×8（Batch H）

| case | 標題 | spec:describe | persona(role) | 依賴 | route | 報表金標 |
|---|---|---|---|---|---|---|
| INV-01 | 基礎設定初始化 — 組織三層、倉庫庫位、商品主檔 | `inv.spec.ts` › INV-01 | stock_lead | — | `/parts/setup/org`(01)、`/parts/setup/warehouse-arch`+`/parts/setup/warehouse-bins`(02)、`/parts/setup/items`(03)、`/parts/setup/suppliers` | |
| INV-02 | 採購入庫 — 需求 → 採購單 → 到貨 → 庫存更新 | `inv.spec.ts` › INV-02 | stock_lead（審核）+ warehouse（執行）| SA-03 待料解除 | `/parts/purchase/requisitions`(04 需求)、`/parts/purchase/orders`(04 採購)、`/parts/receipt/po-grn`(05 採購入庫) | |
| INV-03 | 調撥出入庫 — 門店間零件調撥 | `inv.spec.ts` › INV-03 | stock_lead + warehouse | SA-10 待料 | `/parts/issue/transfer-out`(06 調撥出庫)、`/parts/receipt/transfer-in`(05 調撥入庫)、`/parts/operations/transfers-in-transit`(07 在途查詢) | |
| INV-04 | 庫存盤點 — 盤點計畫、實地盤點、報損報溢審批 | `inv.spec.ts` › INV-04 | stock_lead（審批）+ warehouse（盤點）| — | `/parts/count/plans`(08 計畫)、`/parts/count/sessions`(08 處理)、`/parts/count/loss-overflow`(08 報損報溢) | |
| INV-05 | 預警告警 — 庫存水位告警、工單增項閉環 | `inv.spec.ts` › INV-05 | warehouse → aftersales_lead → stock_lead（三層升級）| SA-04 追加 | `/parts/alerts/thresholds`(10 水位)、`/parts/alerts/rules`(10 規則)、`/parts/alerts/escalation`(10 階層)、`/parts/alerts/work-order-loop`(10 增項閉環) | |
| INV-06 | 保固索賠 — 竣工後舊件登錄、追蹤、費用回收 | `inv.spec.ts` › INV-06 | stock_lead + warehouse | SA-05 保固竣工 | `/parts/warranty/used-parts`(11 舊件)、`/parts/warranty/ro-link`(11 RO 串接)、`/parts/warranty/cost-recovery`(11 費用回收)、`/parts/warranty/staging-warehouse`(暫存倉) | |
| INV-07 | 分析報表 — ABC 分類、庫存周轉率、呆滯庫存 | `inv.spec.ts` › INV-07 | stock_lead | B2 耗料 seed | `/parts/analytics/abc`(12 ABC)+`/parts/analytics/abc-structure`、`/parts/analytics/turnover`(12 周轉率)、`/parts/analytics/stale`(12 呆滯) | ⭐×3 `inv_07_abc` / `inv_07_turnover` / `inv_07_stale` |
| INV-08 | 例外出入庫 / 寄存管理 / 備件庫存調整 | `inv.spec.ts` › INV-08 | stock_lead（審核）+ warehouse | — | `/parts/operations/exceptions`(07 例外)、`/parts/operations/consignment`(07 寄存)、`/parts/operations/adjust`(07 備件調整) | |

---

## CROSS · 跨模組串接點 ×6（Batch I — 全部 `test.skip`，前面 batch 全綠才解）

> `--max-failures=1` serial 跑，失敗即停 → 修 → 重跑。骨架已寫好步驟註解，每步標明操作 persona。

| case | 標題 | spec:describe | persona（每步）| 依賴 | route | skip |
|---|---|---|---|---|---|---|
| CROSS-01 | 工單零件 ↔ 庫存出庫 — 缺料自動待料 | `cross.spec.ts` › CROSS-01 | tech(申請領料) → warehouse(出庫/拒絕) | SA-03、INV-05、Hook #4 | `/tech`(03) ↔ `/parts/issue/repair-pick`(06) ↔ `/parts/alerts/thresholds`(10) | `test.skip` |
| CROSS-02 | 追加項目 ↔ 備件預留 ↔ 預警告警 | `cross.spec.ts` › CROSS-02 | tech(標記) → sa(協商) → 庫存預警系統 | SA-04、B3、Hook #4 | `/parts/aftersales/addons`(04) ↔ `/parts/alerts/work-order-loop`(10) ↔ inventory_reservations | `test.skip` |
| CROSS-03 | 調撥到貨 ↔ 待料工單自動解除 | `cross.spec.ts` › CROSS-03 | warehouse(到貨) → 系統自動 → sa(收通知) | INV-03、SA-03、Hook #5 | `/parts/receipt/transfer-in`(05) ↔ `/parts/aftersales/repair-orders`(02 待料) | `test.skip` |
| CROSS-04 | 竣工複檢 ↔ 保固索賠舊件登錄 | `cross.spec.ts` › CROSS-04 | aftersales_lead(複檢通過) → 系統自動 → stock_lead | SA-05、INV-06、Hook #6 | `/parts/aftersales/final-inspections`(06) ↔ `/parts/warranty/used-parts`(11) ↔ `/parts/warranty/staging-warehouse` | `test.skip` |
| CROSS-05 | 人車檔案 ↔ 售後 CRM 客戶基盤同步 | `cross.spec.ts` › CROSS-05 | 系統自動（後端 Event，sa context 驗證）| SA-06、Hook #7 | `/parts/aftersales/customers`(09) ↔ `/crm/aftersales/customer-base`(CRM01B) | `test.skip` |
| CROSS-06 | 銷售庫存展示 ↔ 庫存管理即時數據 | `cross.spec.ts` › CROSS-06 | sales_lead(唯讀展示) ↔ stock_lead(資料來源) | RS-06、RS-09、INV 即時 | `/sales/showroom/new-cars`(RS03A) ↔ `/sales/showroom/used-cars`(RS03B) ↔ `/parts/operations/balance`(07 商品庫存查詢) | `test.skip` |

---

## 報表金標彙整（Batch J 驗收，對 `fixtures/report-baselines.json` 容差 ±2%）

| baseline key | 報表 | case | route |
|---|---|---|---|
| `rs_03_sales_report` | RS-03 業績報表 | RS-03 | `/sales/manager/sales-report` |
| `crm_04_store_report` | CRM-04 店長綜合報表 | CRM-04 | `/crm/store-report` |
| `crm_05_nps_dashboard` | CRM-05 NPS 看板（銷售）| CRM-02/CRM-05 | `/crm/sales/nps` |
| `crm_05_nps_aftersales` | CRM-05 NPS 看板（售後）| CRM-03/CRM-05 | `/crm/aftersales/nps` |
| `sa_09_tech_efficiency` | SA-09 人效統計 | SA-09 | `/parts/aftersales/management/bays` |
| `inv_07_abc` | INV-07 ABC 分類 | INV-07 | `/parts/analytics/abc` |
| `inv_07_turnover` | INV-07 庫存周轉率 | INV-07 | `/parts/analytics/turnover` |
| `inv_07_stale` | INV-07 呆滯庫存 | INV-07 | `/parts/analytics/stale` |

> 共 8 個 baseline key（7-8 張報表金標）。`report-baselines.json` 由 D3 從 B2 seed 算出，spec 骨架先寫 key 名佔位。

---

## spec 檔清單

| 檔 | describe 數 | test 數 | 涵蓋 |
|---|---|---|---|
| `rs.spec.ts` | 11 | 13 | RS-01~06、RS-07A/B/C、RS-08/09/10（RS-02 多一個 sales_lead 個人視角 skip test）|
| `crm.spec.ts` | 5 | 6 | CRM-01~04 + CRM-05（NPS 金標獨立 describe，銷售+售後 2 test）|
| `sa.spec.ts` | 10 | 11 | SA-01~10（SA-02 多一個 Tech 接單 skip test）|
| `inv.spec.ts` | 8 | 10 | INV-01~08（INV-07 金標拆 ABC/周轉/呆滯 3 test）|
| `cross.spec.ts` | 6 | 6 | CROSS-01~06（全 `test.skip`）|

> **每個 project（chromium-{role}）會列 46 test**（13+6+11+10+6），9 個 project 全跑時 `--list` 顯示 46×9 + parts.spec（既有）。
> 46 test 對應 34 主卡案例的展開：RS-07 拆 A/B/C（+2）、INV-07 金標拆 3 報表（+2）、CRM-05 NPS 拆銷售/售後（+1）、RS-02/SA-02 各拆出 1 個跨角色 skip test（+2）。
> 以「主卡 34 案例」計：RS 10（07 算 1）+ CRM 4 + SA 10 + INV 8 + CROSS 6 = 34 ✓。

## route TODO（查證後仍不確定 / 需 Phase 2 確認）

- **RS-01 主管工作台首頁**：`/sales/overview` 與 `/sales/manager` 皆存在，骨架先 goto `/sales/overview`、註解標 TODO 確認哪個是「登入後預設導向」。
- **SA-10 售後主管工作台 root**：`/parts/aftersales/page.tsx` 存在但內容是否為「主管 KPI 工作台」未驗，骨架 goto root + 標 TODO。
- **SA-09 人效統計**：確認在 `/parts/aftersales/management/bays` 的「工位效率統計」區，或另有獨立 tab；Phase 2 跑時驗。
