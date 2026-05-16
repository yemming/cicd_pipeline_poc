# DUCATI v2 規格 ↔ DealerOS 現有實作　逐頁對照表

> **產出時間**：2026-05-15
> **目的**：對照 `docs/DUCATI_v2_output/` 88+ 張 v2 HTML 設計稿與目前 Indian/Ducati brand 已有的 route，作為 Phase 1 nav_nodes 重組依據。
> **資料來源**：
> - `docs/DUCATI_全系統功能選單架構對照表_v1.docx`（v2 spec 權威表）
> - `docs/DUCATI_v2_output/`（v2 HTML 設計稿）
> - `src/lib/modules.ts`（現有 module registry）
> - Indian brand `nav_nodes` 現況（242 active rows）

## 圖例

| 動作 | 說明 |
|---|---|
| ✅ **沿用** | route 已存在、功能可用、v2 設計與現有畫面相近，**不動 code、只調 nav 名稱** |
| 🎨 **升級畫面** | route 已存在但 v2 設計變動大，需用 spec-to-feature 5 階段重做 UI（保留 DB / domain helper） |
| 🆕 **新建** | route 不存在，用 spec-to-feature 5 階段從 v2 HTML 落地 |
| 🔀 **合併** | 多處有實作要整併到 `/crm/*`（Phase 2 處理） |
| ⚠️ **待確認** | route 似乎存在但需要 Ming 親自確認對應正確 |

## ★ 跨模組串接點（v2 spec §六）

對應的頁面在最右欄會標 ★，總共 6 個串接點，是 phase 4 e2e 驗證的核心：
1. 工單零件 ↔ 庫存出庫
2. 追加項目 ↔ 備件預留 / 工單增項閉環
3. 增項閉環 ↔ 調撥入庫
4. 竣工複檢 ↔ 保固舊件管理
5. 人車檔案 ↔ CRM 售後客戶基盤
6. 銷售看板（新車/中古車）↔ 庫存商品查詢

---

## A. 銷售接待（RS）— 一階模組

v2 二階分組：① DUCATI 銷售與客服模組導覽 ② 主管工作台 ③ 展廳接待
適用角色：RS 銷售顧問 + 銷售主管

| # | v2 HTML | v2 三階 | 現有 route | stitchScreenId 已知 | 角色 | 串接 | 動作 |
|---|---|---|---|---|---|---|---|
| A1 | `RS00_銷售模組_導覽總覽_v4.html` | 銷售模組導覽 | `/sales`（home → `/sales/showroom`） | — | RS, 銷售主管 | — | 🆕 新建（v2 圖卡式導覽） |
| A2 | `CRM00_客服管理模組_導覽總覽_v2.html` | 客服功能導覽 | `/crm`（待建） | — | RS, 銷售主管, CRM主管 | — | 🆕 新建（Phase 2 合 CRM 時做） |
| A3 | `RS_M1_銷售漏斗看板_v5.html` | 銷售漏斗 | `/sales/funnel` | ✅ ec054eb1... | 銷售主管 | — | 🎨 升級（漏斗看板 v5 設計變動） |
| A4 | `RS_M2_業績報表_v1.html` | 業績報表 | `/sales/manager/reports` ✅Q1(a) | — | 銷售主管 | — | 🆕 新建 |
| A5 | `RS_M3_主管設定_v2.html` | 手卡參數設定 | `/sales/manager/card-config` ✅Q2(a) | — | 銷售主管 | — | 🆕 新建 |
| A6 | `RS_SET2_v2.html` | 客群標籤設定 | `/sales/customers/tags` | ✅ 89f1d788... | 銷售主管 | — | 🎨 升級 |
| A7 | `RS_SET_參數設定頁_UI規範示範_v1.html` | （UI 規範示範） | — | — | — | — | 📋 reference only，不上線 |
| A8 | `RS03A_新車庫存看板_v1.html` | 新車庫存 ★ | `/sales/showroom/stock` (RS 視角，新建) + `/inventory/vehicles` (經銷商視角，沿用) ✅Q17(a) | ✅ 91bdac2c... | RS, 銷售主管, 庫管(read) | ★6 | 🆕 RS 視角新建 ＋ 🎨 經銷商視角升級 |
| A9 | `RS03B_中古車庫存看板_v1.html` | 中古車庫存 ★ | `/usedcar/stock` | ✅ 6f6ddad5... | RS, 銷售主管, 庫管(read) | ★6 | 🎨 升級 |
| A10 | `RS01_電子手卡_v8.html` | 接待手卡 | `/sales/card/counter` + `/sales/card/consultant` + `/sales/card/closing`（拆 3 階段） | ✅ 48b9a52c / a31b7baf / 83860fd7 | RS | — | 🎨 升級到 v8（合 3 階段為單頁 tabs？需 Ming 拍板） |
| A11 | `RS02_試乘試駕_v1.html` | 試乘試駕 | `/sales/testdrive` | ✅ a2d1439f... | RS, 銷售主管 | — | 🎨 升級（v2 v1 vs 現有設計） |
| A12 | `RS06_中古車評估鑑價_v2.html` | 置換評估 | `/usedcar/evaluation` | ✅ e8c1015b... | RS, 銷售主管 | — | 🎨 升級 |
| A13 | `RS04_賞車報價與成交訂單_v1.html` | 報價簽訂 | `/sales/quote` + `/sales/orders` | ✅ f2f2139c / 3fc682ca | RS, 銷售主管 | — | 🎨 升級（v2 合報價+成交於同頁） |
| A14 | `RS05_交車管理_v1.html` | 交車流程 | `/delivery/ceremony` + `/delivery/confirm-1/2` + `/delivery/warranty-sign` | ✅ 多支 | RS, 銷售主管 | — | 🎨 升級（v2 簡化為單頁 vs 現有 6 頁拆分） |
| A15 | `RS_EX1_保險招攬工作台_v1.html` | 保險業務 | `/sales/insurance` | ✅ 8df86375... | RS | — | 🎨 升級 |

**A 模組備註**：
- 「電子手卡」現有 3 階段拆分（counter/consultant/closing）vs v2 v8 單頁 tabs，**需 Ming 拍板要不要合**
- 「交車管理」現有 delivery 6 頁拆分 vs v2 1 頁，**同上**
- 「主管工作台」的 4 頁（A3-A6）在 v2 是獨立 sidebar 二階分組，現有 sales registry 是混在 `客戶與分析` section 裡，**需要在 nav_nodes 重組**

---

## B. 客服管理（CRM）— 一階模組

v2 二階分組：① 銷售CRM ② 售後CRM ③ 店長綜合報表
適用角色：CRM 主管 + 銷售主管 + 售後主管 + 店長

| # | v2 HTML | v2 三階 | 現有 route | 動作 |
|---|---|---|---|---|
| B1 | `CRM01A_銷售客戶基盤_v2.html` | 銷售客戶基盤 | `/sales/crm/customer-base` | 🔀 合併 → `/crm/sales/customer-base` |
| B2 | `CRM02A_銷售電訪問卷設定_v1.html` | 銷售電訪問卷 | `/sales/crm/survey-templates` | 🔀 合併 → `/crm/sales/survey-templates` |
| B3 | `CRM03A_銷售電訪工作台_v1.html` | 銷售電訪工作欄 | `/sales/crm/call-tasks` | 🔀 合併 → `/crm/sales/call-tasks` |
| B4 | `CRM04A_銷售休眠戰敗管理_v1.html` | 休眠戰敗管理 | `/sales/crm/dormant-leads` | 🔀 合併 → `/crm/sales/dormant-leads` |
| B5 | `CRM05A_NPS看板_銷售_v1.html` | 銷售 NPS 看板 | `/sales/crm/nps-dashboard` | 🔀 合併 → `/crm/sales/nps` |
| B6 | `CRM06A_銷售推播通知管理_v1.html` | 推播通知設定 | `/sales/crm/push-notifications` | 🔀 合併 → `/crm/sales/push-notifications` |
| B7 | `CRM01B_售後客戶基盤_v1.html` | 售後客戶基盤 ★ | `/aftersales/crm/customer-base` | 🔀 合併 → `/crm/aftersales/customer-base`（★5 cross-link 人車檔案） |
| B8 | `CRM02B_售後電訪問卷設定_v1.html` | 售後電訪問卷 | `/aftersales/crm/survey-templates` | 🔀 合併 → `/crm/aftersales/survey-templates` |
| B9 | `CRM03B_售後電訪工作台_v1.html` | 售後電訪工作欄 | `/aftersales/crm/call-tasks` | 🔀 合併 → `/crm/aftersales/call-tasks` |
| B10 | `CRM04B_售後休眠流失管理_v1.html` | 休眠流失管理 | `/aftersales/crm/dormant-customers` | 🔀 合併 → `/crm/aftersales/dormant-customers` |
| B11 | `CRM05B_NPS看板_售後_v1.html` | 售後 NPS 看板 | `/aftersales/crm/nps-dashboard` | 🔀 合併 → `/crm/aftersales/nps` |
| B12 | `CRM06B_售後推播通知管理_v1.html` | 推播通知設定 | `/aftersales/crm/push-notifications` | 🔀 合併 → `/crm/aftersales/push-notifications` |
| B13 | `CRM07_店長綜合報表_v2.html` | 門店綜合概覽 | `/group/dashboard` + `/customer-service/overview` | 🔀 合併 → `/crm/store-report`（v2 改為 v2.html 設計） |

**B 模組備註**：
- **整路徑搬到 `/crm` + 舊路徑 redirect**（Ming 已答覆方案）
- 元件 re-export 既有 board / detail view，**不重寫**
- 唯一畫面要升級的是 B13 店長綜合報表（v2.html 是新設計，目前 `group/dashboard` 是 S6-2 版本）

---

## C. 售後修護（SA）— 一階模組

v2 二階分組：① 售後接待（SA 日常）② 售後主管設定（主管限定）
適用角色：SA 售後接待 + 售後主管

| # | v2 HTML | v2 三階 | 現有 route | 動作 |
|---|---|---|---|---|
| C0a | `00_售後工單模組_導覽總覽.html` | 模組導覽 | `/service` + `/parts/aftersales`（共用元件）✅Q11(c) | 🆕 新建（雙入口共用同一元件） |
| C0b | `00_售後工單模組_流程關係圖.html` | 流程關係圖 | `/parts/overview/flow` | ✅ 沿用（已有 `/parts/overview/flow`）|
| C1 | `01_預約管理看板.html` | 預約管理看板 | `/service/appointments` + `/parts/aftersales/appointments` | 🎨 升級（v2 看板設計） |
| C2 | `04_預檢單_SA環檢_v3.html` | 預檢單（SA 環檢） | `/service/pi` + `/parts/aftersales/pre-inspections` + `/dev/preflight-sa-v2`（dev 預覽） | 🎨 升級到 v3 |
| C3 | `04_預檢單_RO串接_v3.html` | 預檢單（RO 串接） | `/dev/preflight-ro-v1`（dev 預覽）+ 既有 PI | 🎨 升級 / 落地到正式 route |
| C4 | `02_正式工單RO.html` | 正式工單 RO ★ | `/service/workorders` + `/parts/aftersales/repair-orders` | 🎨 升級（v2 一鍵開立流程） |
| C5 | `03_維修項目零件明細.html` | 維修項目零件明細 ★ | `/parts/issue/repair-pick` + repair_order_lines | 🎨 升級（★1 工單零件 ↔ 庫存出庫） |
| C6 | `04_追加項目記錄.html` | 追加項目記錄 ★ | `/service/dropoff` + `/parts/aftersales/addons` | 🎨 升級（★2 追加 ↔ 備件預留） |
| C7 | `05_增項閉環_完整子模組.html` | 增項閉環管理 ★ | `/parts/alerts/work-order-loop` + `/parts/aftersales/addon-loop` | 🎨 升級（★3 D+3/D+10 追蹤） |
| C8 | `06_竣工複檢_v1.html` | 竣工複檢 ★ | `/service/inspection` + `/parts/aftersales/final-inspection` | 🎨 升級（★4 通過 → 舊件登錄） |
| C9 | `08_結帳收款.html` | 結帳收款 | `/parts/aftersales/checkout` + `/pos` | 🎨 升級（v2 設計 + 二次簽名） |
| C10 | `11_取車通知設定.html` | 取車通知設定 | `/parts/aftersales/pickup-notifications` | ✅ 沿用 / 微調 nav 命名 |
| C11 | `10_工單查詢.html` | 工單查詢 | `/parts/aftersales/ro-search` + `/admin/master-data/work-orders` | 🎨 升級 |
| C12 | `09_人車檔案.html` | 人車檔案 ★ | `/parts/aftersales/customers` + `/admin/master-data/customers` + `/admin/master-data/vehicles` | 🎨 升級（★5 ↔ CRM01B 同步） |
| C13a | `07_售後管理模組_v2.html`（Tab:車間） | 車間管理／工位看板 | `/service/manager/workshop` ✅Q15(a) | 🆕 拆獨立 route |
| C13b | 同上（Tab:人效） | 人效統計 | 合到 `/group/dashboard` KPI 區 ✅Q10(c) | 🔀 KPI 卡片，不另開 route |
| C13c | 同上（Tab:人員） | 員工人員名冊 | `/service/manager/employees` ✅Q15(a) | 🆕 拆獨立 route |
| C13d | 同上（Tab:前綴） | 工單前綴碼設定 | `/service/manager/ro-prefix` ✅Q15(a) | 🆕 拆獨立 route |
| C14 | `12_客戶標籤主管設定.html` | 客戶標籤主管設定 | `/service/manager/customer-tags` ✅Q12(b) | 🆕 新建 |

**C 模組備註**：
- **既有 `/service/*` (9 頁) + `/aftersales/*` + `/parts/aftersales/*` (10+ 頁) 三處重疊**，phase 2 要決定主路徑（建議全收到 `/service/*`，aftersales/* 改 redirect）
- C13a-d 在 v2 是「一個 HTML 內 4 tabs」，現有可能拆 4 個 route，**需要 Ming 拍板要不要合**
- 6 個 ★ 串接點集中在這個模組，phase 4 e2e 驗證最重

---

## D. 庫存管理（INV）— 一階模組

v2 二階分組（9 個）：① 基礎設定 ② 採購管理 ③ 入庫管理 ④ 出庫管理 ⑤ 庫存作業 ⑥ 盤點管理 ⑦ 預警告警 ⑧ 保固索賠 ⑨ 分析報表
適用角色：庫房主管（全部）+ 倉管人員（部分）

> Indian 既有 nav_nodes 已經分這 9 個二階，且 `(workspace)/parts/*` 11 子資料夾 + 52 個 DataGrid 頁，**這是現有最完整、最不需要重做的模組**。下表只標需要動的。

### D.1 基礎設定（14 頁）

| # | v2 HTML | 現有 route | 動作 |
|---|---|---|---|
| D1.1 | `00_庫存管理模組_導覽總覽.html` | `/parts`（home） | 🎨 升級為 v2 圖卡式 |
| D1.2 | `00_庫存管理模組_流程關係圖.html` | `/parts/overview/flow` | ✅ 沿用 |
| D1.3 | `01_基礎設定_組織三層架構.html` | `/settings/org` | ✅ 沿用（已有完整實作） |
| D1.4 | `01_基礎設定_採購權限規則.html` | `/parts/setup/?`（business_rules → purchase_authority） | 🆕 新建 admin 頁（business_rules table 已有） |
| D1.5 | `01_基礎設定_商品管理權限.html` | `/admin/master-data/items` 編輯權限分頁 ✅Q3(c) | 🎨 加分頁（合到 items 編輯頁） |
| D1.6 | `01_基礎設定_盤點回傳規則.html` | `/parts/count/rules` | ✅ 沿用 |
| D1.7 | `01_基礎設定_管控類型定義.html` | `/parts/setup/control-types` | ✅ 沿用 |
| D1.8 | `02_基礎設定_倉儲四層架構.html` | 合到 D1.9 同頁 ✅Q4(c) | 🔀 合 nav |
| D1.9 | `02_基礎設定_倉庫庫區庫位設定.html` | `/parts/setup/warehouses`（schema 已有，UI 待 Phase 3 建）✅Q5(c) | 🆕 admin UI 待建 |
| D1.10 | `02_基礎設定_供應商資訊.html` | `/admin/master-data/suppliers` | ✅ 沿用 |
| D1.11 | `02_基礎設定_採購合約.html` | `/parts/setup/contracts` | ✅ 沿用 |
| D1.12 | `03_基礎設定_商品基礎資料.html` | `/admin/master-data/items` | ✅ 沿用 |
| D1.13 | `03_基礎設定_商品資訊.html` | 同上 | ✅ 沿用 |
| D1.14 | `03_基礎設定_門市定價.html` | `/admin/master-data/supplier-pricing` + `/parts/setup/pricing` | ✅ 沿用 |
| D1.15 | `03_基礎設定_適配設定.html` | `/parts/setup/compatibility` | ✅ 沿用 |
| D1.16 | `03_基礎設定_序列號追蹤.html` | `/parts/setup/serial-tracking` ✅Q6(a) | 🆕 新建 |

### D.2 採購管理（5 頁）

| # | v2 HTML | 現有 route | 動作 |
|---|---|---|---|
| D2.1 | `04_採購管理_採購流程說明.html` | — | 🆕 新建（純說明頁） |
| D2.2 | `04_採購管理_日常補貨計畫.html` | `/admin/master-data/replenishment-policies` | ✅ 沿用 |
| D2.3 | `04_採購管理_需求處理.html` | `/parts/purchase/requisitions` | ✅ 沿用 |
| D2.4 | `04_採購管理_商品採購.html` | `/parts/purchase/orders` | ✅ 沿用 |
| D2.5 | `04_採購管理_採購退貨.html` | `/parts/purchase/returns` | ✅ 沿用 |

### D.3 入庫管理（4 頁）

| # | v2 HTML | 現有 route | 動作 |
|---|---|---|---|
| D3.1 | `05_入庫管理_採購入庫.html` | `/parts/receipt/po` | ✅ 沿用 |
| D3.2 | `05_入庫管理_調撥入庫.html` ★ | `/parts/receipt/transfer-in` | ✅ 沿用（★3 解除待料） |
| D3.3 | `05_入庫管理_內售入庫.html` | `/parts/receipt/internal-sale` | ✅ 沿用 |
| D3.4 | `05_入庫管理_領料退貨入庫.html` | `/parts/receipt/return-in` | ✅ 沿用 |

### D.4 出庫管理（3 頁）

| # | v2 HTML | 現有 route | 動作 |
|---|---|---|---|
| D4.1 | `06_出庫管理_維修領料.html` ★ | `/parts/issue/repair-pick` | ✅ 沿用（★1） |
| D4.2 | `06_出庫管理_調撥出庫.html` | `/parts/issue/transfer-out` | ✅ 沿用 |
| D4.3 | `06_出庫管理_內售出庫.html` | `/parts/issue/internal-sale` | ✅ 沿用 |

### D.5 庫存作業（7 頁）

| # | v2 HTML | 現有 route | 動作 |
|---|---|---|---|
| D5.1 | `07_庫存管理_商品庫存查詢_v2.html` ★ | `/parts/operations/balance` | 🎨 升級到 v2（★6 銷售看板來源） |
| D5.2 | `07_庫存作業_例外出入庫.html` | `/parts/operations/exceptions` | ✅ 沿用 |
| D5.3 | `07_庫存作業_寄存管理.html` | `/parts/operations/consignment` | ✅ 沿用 |
| D5.4 | `07_庫存作業_庫存盤點作業.html` | 合到 D6.2 `/parts/count/sessions` 同 route ✅Q7(c) | 🔀 合 nav |
| D5.5 | `07_庫存作業_備件庫存調整.html` | `/parts/count/adjustments` | ✅ 沿用 |
| D5.6 | `07_庫存作業_入庫查詢.html` | `/parts/operations/receipts-history` | ✅ 沿用 |
| D5.7 | `07_庫存作業_調撥在途查詢.html` | `/parts/operations/transfers-in-transit` | ✅ 沿用 |

### D.6 盤點管理（3 頁）

| # | v2 HTML | 現有 route | 動作 |
|---|---|---|---|
| D6.1 | `08_盤點管理_盤點計畫.html` | `/parts/count/plans` | ✅ 沿用 |
| D6.2 | `08_盤點管理_盤點處理.html` | `/parts/count/sessions` | ✅ 沿用 |
| D6.3 | `08_盤點管理_報損報溢.html` | `/parts/count/loss-overflow`（獨立主管審核頁）✅Q8(b) | 🆕 新建 |

### D.7 預警告警（4 頁）

| # | v2 HTML | 現有 route | 動作 |
|---|---|---|---|
| D7.1 | `10_預警告警_庫存水位設定.html` | `/parts/alerts/thresholds` | ✅ 沿用 |
| D7.2 | `10_預警告警_告警類型與規則.html` | `/parts/alerts/rules` | ✅ 沿用 |
| D7.3 | `10_預警告警_告警階層設定.html` | `/parts/alerts/escalation` | ✅ 沿用 |
| D7.4 | `10_預警告警_工單增項閉環.html` ★ | `/parts/alerts/work-order-loop` | ✅ 沿用（★2） |

### D.8 保固索賠（6 頁）

| # | v2 HTML | 現有 route | 動作 |
|---|---|---|---|
| D8.1 | `11_保固索賠_索賠流程說明.html` | `/parts/warranty/flow` | ✅ 沿用 |
| D8.2 | `11_保固索賠_舊件出入庫邏輯.html` | 合到 D8.1 `/parts/warranty/flow` 同頁 ✅Q9(a) | 🔀 合 nav |
| D8.3 | `11_保固索賠_暫存倉設定.html` | `/parts/warranty/staging-warehouse` | ✅ 沿用 |
| D8.4 | `11_保固索賠_舊件管理.html` ★ | `/parts/warranty/used-parts` | ✅ 沿用（★4） |
| D8.5 | `11_保固索賠_RO工單串接.html` ★ | `/parts/warranty/ro-link` | ✅ 沿用 |
| D8.6 | `11_保固索賠_費用回收.html` | `/parts/warranty/cost-recovery` | ✅ 沿用 |

### D.9 分析報表（5 頁）

| # | v2 HTML | 現有 route | 動作 |
|---|---|---|---|
| D9.1 | `12_分析報表_ABC分類設定.html` | `/parts/setup/abc-settings` | ✅ 沿用 |
| D9.2 | `12_分析報表_ABC分類.html` | `/parts/analytics/abc` | ✅ 沿用 |
| D9.3 | `12_分析報表_ABC結構圖.html` | `/parts/analytics/abc-structure` | ✅ 沿用 |
| D9.4 | `12_分析報表_庫存周轉率.html` | `/parts/analytics/turnover` | ✅ 沿用 |
| D9.5 | `12_分析報表_呆滯庫存.html` | `/parts/analytics/stale` | ✅ 沿用 |

---

## E. 統計

| 模組 | 總頁數 | ✅ 沿用 | 🎨 升級 | 🆕 新建 | 🔀 合併 | ⚠️ 待確認 |
|---|---:|---:|---:|---:|---:|---:|
| A 銷售接待 | 15 | 0 | 11 | 3 | 0 | 2 |
| B 客服管理 | 13 | 0 | 1 | 0 | 13 | 0 |
| C 售後修護 | 18 | 1 | 14 | 1 | 1 | 1 |
| D 庫存管理 | 47 | 35 | 3 | 1 | 0 | 9 |
| **合計** | **93** | **36** | **29** | **5** | **14** | **12** |

**結論**：
- **沿用率 39%**（D 模組貢獻大），代表庫存管理基礎已穩
- **升級率 31%**，主要在 A/C 兩個模組（銷售接待 + 售後修護），這是 Phase 3 工程量主力
- **新建率 5%**（5 頁），主要是 RS00 / CRM00 模組導覽 + 採購流程說明 + 主管報表
- **合併 14 頁**全部是 CRM B 模組，Phase 2 集中處理
- **待確認 12 頁**：Ming 需要逐項點頭哪個對應正確

---

## F. 開放議題（Ming 拍板 2026-05-15 結論）

1. **A10 電子手卡** ✅ **Q13(b)**：維持三 route，內部畫面升級到 v8 style
2. **A14 交車管理** ✅ **Q14(b)**：維持 6 頁，畫面逐頁升級到 v2 style
3. **C13 售後管理模組 4 tabs** ✅ **Q15(a)**：拆 4 個獨立 route（人效並 Q10 合到 /group/dashboard，實際 3 routes + 1 KPI 區）
4. **C 模組路徑統一** ✅ **Q16(a)**：全收到 `/service/*`，`/aftersales/*` 與 `/parts/aftersales/*` 改 redirect — Phase 2/3 升級畫面時逐頁 cutover（Phase 1 SQL 不一次性翻）
5. **A8 RS03A 新車庫存看板** ✅ **Q17(a)**：`/sales/showroom/stock` 新開 RS 視角 route，`/inventory/vehicles` 經銷商視角沿用
6. **角色 mapping** ✅ **Q18(a)**：**8 個角色**（含店長）— 現況已對齊（Indian brand 已有店長 role，不需 RBAC migration）

---

## G. 下一步

1. ~~Ming review 本文件~~ ✅ 2026-05-15 18 題答完
2. **產出 `ducati-v2-migration-phase1.md`**：nav_nodes Indian brand 完整 SQL migration ⬅️ doing
3. **Ming 二次點頭 SQL**
4. **Apply SQL**：用 supabase MCP `apply_migration` 一次性 INSERT/UPDATE nav_nodes
5. **驗收 sidebar**：開 dev server 切 Indian 帳號逐模組點開
6. 完整工序追蹤見 **BDN 工序追蹤卡**（Phase 0-4 全部 checkbox）

---

*Created by Claude / 2026-05-15 / 對應 plan `/home/ming/.claude/plans/glistening-toasting-whisper.md`*
