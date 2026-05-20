# T2 spec ↔ impl mapping inventory（粗對映，給 sub-agent 精修）

評等定義：
- **A 完全對齊**：UI 結構 + 主要功能 + 列欄位/操作按鈕齊備，視覺風格符合「華麗版」（圖表、卡片設計、漸層、chip、互動細節）
- **B 功能對齊但 UI 簡化**：核心 CRUD/查詢/流程在，但視覺是陽春版（純表格、無圖表、缺卡片設計、缺互動回饋）
- **C 殘缺實作**：只有 stub / 部分功能 / placeholder
- **D 完全缺**：route 不存在或 404

T2 spec 根目錄：`docs/DUCATI_v2_output/`
impl 根目錄：`src/app/(workspace)/`

---

## 01 銷售接待（15 spec → 12 實作頁，扣 3 導覽/規範）

| # | T2 spec 檔 | 候選 impl route | 備註 |
|---|---|---|---|
| 1 | `01_銷售接待/00_模組導覽/CRM00_客服管理模組_導覽總覽_v2.html` | `/crm` | 模組總覽（可能不算實作頁，標 D 或排除） |
| 2 | `01_銷售接待/00_模組導覽/RS00_銷售模組_導覽總覽_v4.html` | `/sales` or `/sales/overview` | 模組總覽 |
| 3 | `01_銷售接待/01_主管工作台/RS_M1_銷售漏斗看板_v5.html` | `/sales/funnel` or `/sales/manager/funnel` | |
| 4 | `01_銷售接待/01_主管工作台/RS_M2_業績報表_v1.html` | `/sales/manager/sales-report` | |
| 5 | `01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html` | `/sales/manager/*`（kpi-targets / staff / staff-grid / card-config） | 主管設定總覽 |
| 6 | `01_銷售接待/01_主管工作台/RS_SET2_v2.html` | `/sales/settings/handcard-params` or `/sales/manager/card-config` | 第二版參數設定 |
| 7 | `01_銷售接待/01_主管工作台/RS_SET_參數設定頁_UI規範示範_v1.html` | — | UI 規範示範（非實作頁） |
| 8 | `01_銷售接待/02_展廳接待/RS01_電子手卡_v8.html` | `/sales/reception/handcard` + `/sales/card/{counter,consultant,closing}` | 電子手卡 v8 wizard |
| 9 | `01_銷售接待/02_展廳接待/RS02_試乘試駕_v1.html` | `/sales/testdrive` or `/sales/test-drives` | |
| 10 | `01_銷售接待/02_展廳接待/RS03A_新車庫存看板_v1.html` | `/sales/showroom/new-cars` or `/sales/showroom/stock` or `/inventory/vehicles` | |
| 11 | `01_銷售接待/02_展廳接待/RS03B_中古車庫存看板_v1.html` | `/sales/showroom/used-cars` or `/usedcar/stock` | |
| 12 | `01_銷售接待/02_展廳接待/RS04_賞車報價與成交訂單_v1.html` | `/sales/quote` + `/sales/orders` | |
| 13 | `01_銷售接待/02_展廳接待/RS05_交車管理_v1.html` | `/sales/delivery` or `/delivery/*` | |
| 14 | `01_銷售接待/02_展廳接待/RS06_中古車評估鑑價_v2.html` | `/usedcar/evaluation` or `/usedcar/evaluations` | |
| 15 | `01_銷售接待/02_展廳接待/RS_EX1_保險招攬工作台_v1.html` | `/sales/insurance` | |

---

## 02 客服管理（13 spec → 13 實作頁）

| # | T2 spec 檔 | 候選 impl route |
|---|---|---|
| 1 | `02_客服管理/01_銷售CRM/CRM01A_銷售客戶基盤_v2.html` | `/crm/sales/customer-base` |
| 2 | `02_客服管理/01_銷售CRM/CRM02A_銷售電訪問卷設定_v1.html` | `/crm/sales/survey-templates` |
| 3 | `02_客服管理/01_銷售CRM/CRM03A_銷售電訪工作台_v1.html` | `/crm/sales/call-tasks` |
| 4 | `02_客服管理/01_銷售CRM/CRM04A_銷售休眠戰敗管理_v1.html` | `/crm/sales/dormant-leads` |
| 5 | `02_客服管理/01_銷售CRM/CRM05A_NPS看板_銷售_v1.html` | `/crm/sales/nps` |
| 6 | `02_客服管理/01_銷售CRM/CRM06A_銷售推播通知管理_v1.html` | `/crm/sales/push-notifications` |
| 7 | `02_客服管理/02_售後CRM/CRM01B_售後客戶基盤_v1.html` | `/crm/aftersales/customer-base` |
| 8 | `02_客服管理/02_售後CRM/CRM02B_售後電訪問卷設定_v1.html` | `/crm/aftersales/survey-templates` |
| 9 | `02_客服管理/02_售後CRM/CRM03B_售後電訪工作台_v1.html` | `/crm/aftersales/call-tasks` |
| 10 | `02_客服管理/02_售後CRM/CRM04B_售後休眠流失管理_v1.html` | `/crm/aftersales/dormant-customers` |
| 11 | `02_客服管理/02_售後CRM/CRM05B_NPS看板_售後_v1.html` | `/crm/aftersales/nps` |
| 12 | `02_客服管理/02_售後CRM/CRM06B_售後推播通知管理_v1.html` | `/crm/aftersales/push-notifications` |
| 13 | `02_客服管理/03_店長綜合報表/CRM07_店長綜合報表_v2.html` | `/crm/store-report` |

---

## 03 售後修護（16 spec → 14 實作頁，扣 2 導覽）

| # | T2 spec 檔 | 候選 impl route | 備註 |
|---|---|---|---|
| 1 | `03_售後修護/01_售後接待/00_售後工單模組_導覽總覽.html` | `/parts/aftersales` | 導覽（可標 D 或排除） |
| 2 | `03_售後修護/01_售後接待/00_售後工單模組_流程關係圖.html` | — | 流程圖（非實作頁） |
| 3 | `03_售後修護/01_售後接待/01_預約管理看板.html` | `/parts/aftersales/appointments` | |
| 4 | `03_售後修護/01_售後接待/02_正式工單RO.html` | `/parts/aftersales/repair-orders` | |
| 5 | `03_售後修護/01_售後接待/03_維修項目零件明細.html` | `/parts/aftersales/repair-orders/[id]/lines` | |
| 6 | `03_售後修護/01_售後接待/04_追加項目記錄.html` | `/parts/aftersales/addons` | |
| 7 | `03_售後修護/01_售後接待/04_預檢單_RO串接_v3.html` | `/parts/aftersales/pre-inspections` + `/transfer` | |
| 8 | `03_售後修護/01_售後接待/04_預檢單_SA環檢_v3.html` | `/parts/aftersales/pre-inspections` | |
| 9 | `03_售後修護/01_售後接待/05_增項閉環_完整子模組.html` | `/parts/aftersales/followups` + `/parts/alerts/work-order-loop` | |
| 10 | `03_售後修護/01_售後接待/06_竣工複檢_v1.html` | `/parts/aftersales/final-inspections` | |
| 11 | `03_售後修護/01_售後接待/08_結帳收款.html` | `/parts/aftersales/checkout` | |
| 12 | `03_售後修護/01_售後接待/09_人車檔案.html` | `/parts/aftersales/customers` or `/admin/master-data/{customers,vehicles}` | |
| 13 | `03_售後修護/01_售後接待/10_工單查詢.html` | `/parts/aftersales/ro-search` | |
| 14 | `03_售後修護/01_售後接待/11_取車通知設定.html` | `/parts/aftersales/pickup-notifications` or `/parts/aftersales/settings/pickup-notify` | |
| 15 | `03_售後修護/02_售後主管設定/07_售後管理模組_v2.html` | `/parts/aftersales/management/*` 總覽 | |
| 16 | `03_售後修護/02_售後主管設定/12_客戶標籤主管設定.html` | `/parts/aftersales/management/customer-tags` | |

---

## 04 庫存管理（53 spec → 49 實作頁，扣 4 導覽/流程說明）

### 04.01 基礎設定（14 spec）

| # | T2 spec 檔 | 候選 impl route |
|---|---|---|
| 1 | `04_庫存管理/01_基礎設定/00_庫存管理模組_導覽總覽.html` | `/parts` 或 `/parts/overview/flow`（可排除） |
| 2 | `04_庫存管理/01_基礎設定/00_庫存管理模組_流程關係圖.html` | `/parts/overview/flow`（流程圖） |
| 3 | `04_庫存管理/01_基礎設定/01_基礎設定_商品管理權限.html` | `/parts/setup/item-permissions` |
| 4 | `04_庫存管理/01_基礎設定/01_基礎設定_採購權限規則.html` | `/parts/setup/purchase-permissions` |
| 5 | `04_庫存管理/01_基礎設定/01_基礎設定_盤點回傳規則.html` | `/parts/setup/count-rules` |
| 6 | `04_庫存管理/01_基礎設定/01_基礎設定_管控類型定義.html` | `/parts/setup/control-types` |
| 7 | `04_庫存管理/01_基礎設定/01_基礎設定_組織三層架構.html` | `/parts/setup/org` |
| 8 | `04_庫存管理/01_基礎設定/02_基礎設定_供應商資訊.html` | `/parts/setup/suppliers` |
| 9 | `04_庫存管理/01_基礎設定/02_基礎設定_倉儲四層架構.html` | `/parts/setup/warehouse-arch` |
| 10 | `04_庫存管理/01_基礎設定/02_基礎設定_倉庫庫區庫位設定.html` | `/parts/setup/warehouse-bins` |
| 11 | `04_庫存管理/01_基礎設定/02_基礎設定_採購合約.html` | `/parts/setup/contracts` |
| 12 | `04_庫存管理/01_基礎設定/03_基礎設定_商品基礎資料.html` | `/parts/setup/items` |
| 13 | `04_庫存管理/01_基礎設定/03_基礎設定_商品資訊.html` | `/parts/setup/items-info` |
| 14 | `04_庫存管理/01_基礎設定/03_基礎設定_序列號追蹤.html` | `/parts/setup/serial-tracking` or `/parts/setup/serial` |
| 15 | `04_庫存管理/01_基礎設定/03_基礎設定_適配設定.html` | `/parts/setup/compatibility` |
| 16 | `04_庫存管理/01_基礎設定/03_基礎設定_門市定價.html` | `/parts/setup/pricing` |

### 04.02 採購管理（5 spec, 含 1 流程說明）

| # | T2 spec 檔 | 候選 impl route |
|---|---|---|
| 1 | `04_庫存管理/02_採購管理/04_採購管理_商品採購.html` | `/parts/purchase/orders` |
| 2 | `04_庫存管理/02_採購管理/04_採購管理_採購流程說明.html` | `/parts/purchase/flow`（流程說明） |
| 3 | `04_庫存管理/02_採購管理/04_採購管理_採購退貨.html` | `/parts/purchase/returns` |
| 4 | `04_庫存管理/02_採購管理/04_採購管理_日常補貨計畫.html` | `/parts/purchase/replenishment` |
| 5 | `04_庫存管理/02_採購管理/04_採購管理_需求處理.html` | `/parts/purchase/requisitions` |

### 04.03 入庫管理（4 spec）

| # | T2 spec 檔 | 候選 impl route |
|---|---|---|
| 1 | `04_庫存管理/03_入庫管理/05_入庫管理_內售入庫.html` | `/parts/receipt/internal-sale` |
| 2 | `04_庫存管理/03_入庫管理/05_入庫管理_採購入庫.html` | `/parts/receipt/po-grn` |
| 3 | `04_庫存管理/03_入庫管理/05_入庫管理_調撥入庫.html` | `/parts/receipt/transfer-in` |
| 4 | `04_庫存管理/03_入庫管理/05_入庫管理_領料退貨入庫.html` | `/parts/receipt/return-in` |

### 04.04 出庫管理（3 spec）

| # | T2 spec 檔 | 候選 impl route |
|---|---|---|
| 1 | `04_庫存管理/04_出庫管理/06_出庫管理_內售出庫.html` | `/parts/issue/internal-sale` |
| 2 | `04_庫存管理/04_出庫管理/06_出庫管理_維修領料.html` | `/parts/issue/repair-pick` |
| 3 | `04_庫存管理/04_出庫管理/06_出庫管理_調撥出庫.html` | `/parts/issue/transfer-out` |

### 04.05 庫存作業（7 spec）

| # | T2 spec 檔 | 候選 impl route |
|---|---|---|
| 1 | `04_庫存管理/05_庫存作業/07_庫存作業_例外出入庫.html` | `/parts/operations/exceptions` |
| 2 | `04_庫存管理/05_庫存作業/07_庫存作業_備件庫存調整.html` | `/parts/operations/adjust` |
| 3 | `04_庫存管理/05_庫存作業/07_庫存作業_入庫查詢.html` | `/parts/operations/receipts-history` |
| 4 | `04_庫存管理/05_庫存作業/07_庫存作業_寄存管理.html` | `/parts/operations/consignment` |
| 5 | `04_庫存管理/05_庫存作業/07_庫存作業_庫存盤點作業.html` | `/parts/operations/count-ops` |
| 6 | `04_庫存管理/05_庫存作業/07_庫存作業_調撥在途查詢.html` | `/parts/operations/transfers-in-transit` |
| 7 | `04_庫存管理/05_庫存作業/07_庫存管理_商品庫存查詢_v2.html` | `/parts/operations/balance` |

### 04.06 盤點管理（3 spec）

| # | T2 spec 檔 | 候選 impl route |
|---|---|---|
| 1 | `04_庫存管理/06_盤點管理/08_盤點管理_報損報溢.html` | `/parts/count/loss-overflow` |
| 2 | `04_庫存管理/06_盤點管理/08_盤點管理_盤點處理.html` | `/parts/count/sessions` |
| 3 | `04_庫存管理/06_盤點管理/08_盤點管理_盤點計畫.html` | `/parts/count/plans` |

### 04.07 預警告警（4 spec）

| # | T2 spec 檔 | 候選 impl route |
|---|---|---|
| 1 | `04_庫存管理/07_預警告警/10_預警告警_告警階層設定.html` | `/parts/alerts/escalation` |
| 2 | `04_庫存管理/07_預警告警/10_預警告警_告警類型與規則.html` | `/parts/alerts/rules` |
| 3 | `04_庫存管理/07_預警告警/10_預警告警_工單增項閉環.html` | `/parts/alerts/work-order-loop` |
| 4 | `04_庫存管理/07_預警告警/10_預警告警_庫存水位設定.html` | `/parts/alerts/thresholds` |

### 04.08 保固索賠（6 spec, 含 1 流程說明）

| # | T2 spec 檔 | 候選 impl route |
|---|---|---|
| 1 | `04_庫存管理/08_保固索賠/11_保固索賠_RO工單串接.html` | `/parts/warranty/ro-link` |
| 2 | `04_庫存管理/08_保固索賠/11_保固索賠_暫存倉設定.html` | `/parts/warranty/staging-warehouse` |
| 3 | `04_庫存管理/08_保固索賠/11_保固索賠_索賠流程說明.html` | `/parts/warranty/flow`（流程說明） |
| 4 | `04_庫存管理/08_保固索賠/11_保固索賠_舊件出入庫邏輯.html` | `/parts/warranty/used-parts-flow` |
| 5 | `04_庫存管理/08_保固索賠/11_保固索賠_舊件管理.html` | `/parts/warranty/used-parts` |
| 6 | `04_庫存管理/08_保固索賠/11_保固索賠_費用回收.html` | `/parts/warranty/cost-recovery` |

### 04.09 分析報表（5 spec）

| # | T2 spec 檔 | 候選 impl route |
|---|---|---|
| 1 | `04_庫存管理/09_分析報表/12_分析報表_ABC分類.html` | `/parts/analytics/abc` |
| 2 | `04_庫存管理/09_分析報表/12_分析報表_ABC分類設定.html` | `/parts/analytics/abc-settings` |
| 3 | `04_庫存管理/09_分析報表/12_分析報表_ABC結構圖.html` | `/parts/analytics/abc-structure` |
| 4 | `04_庫存管理/09_分析報表/12_分析報表_呆滯庫存.html` | `/parts/analytics/stale` |
| 5 | `04_庫存管理/09_分析報表/12_分析報表_庫存周轉率.html` | `/parts/analytics/turnover` |
