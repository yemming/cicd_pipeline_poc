# DealerOS — 印第安（Indian）導航目錄樹

> 資料來源：`nav_nodes` 表（`brand_id='indian'`、`is_active=true`），即印第安使用者目前在 sidebar 真正看得到的目錄。
> 產出日期：2026-05-28（Asia/Taipei）
> 層級定義：**0 級 = 主目錄（模組）** · **1 級 = 子目錄（區段）** · **2 級 = 功能（頁面）**
> 🚧 = 規劃中（coming soon，尚無路由）

**總覽**：9 個主目錄 · 34 個子目錄 · 130+ 個功能頁

點各區塊三角形可展開／收合。

---

<details open>
<summary><b>① 銷售接待</b>（3 子目錄）</summary>

<details>
<summary>　└ DUCATI 銷售與客服模組導覽</summary>

| 功能 | 路徑 |
|---|---|
| 銷售模組導覽 | `/sales/overview` |
| 客服功能導覽 | `/customer-service/overview` |

</details>

<details>
<summary>　└ 主管工作台</summary>

| 功能 | 路徑 |
|---|---|
| 工作台首頁 | `/sales/manager` |
| 銷售漏斗 | `/sales/manager/funnel` |
| 業績報表 | `/sales/manager/sales-report` |
| KPI 目標 / HABC | `/sales/manager/kpi-targets` |
| RS 人員管理 | `/sales/manager/staff` |
| 員工九宮格 | `/sales/manager/staff-grid` |
| 手卡參數設定 | `/sales/manager/card-config` |
| 客群標籤設定 | `/sales/settings/customer-tags` |

</details>

<details>
<summary>　└ 展廳接待</summary>

| 功能 | 路徑 |
|---|---|
| 新車庫存 | `/sales/showroom/new-cars` |
| 中古車庫存 | `/sales/showroom/used-cars` |
| 接待手卡 | `/sales/reception/handcard` |
| 試乘試駕 | `/sales/reception/test-rides` |
| 置換評估 | `/usedcar/evaluations` |
| 報價簽訂 | `/sales/quote` |
| 訂單中心 | `/sales/orders` |
| 潛客跟進 | `/usedcar/prospects` |
| 交車流程 | `/sales/delivery` |
| 保險業務 | `/sales/insurance` |
| 新車庫存（RS 視角） | `/sales/showroom/stock` |
| 整車採購訂單 | `/sales/inventory/purchase-orders` |
| 到港確認 | `/sales/inventory/arrival-confirmation` |
| 採購財務結算 | `/sales/inventory/cost-settlement` |
| 車輛調撥 | `/sales/inventory/transfers` |
| 出庫管理 | `/sales/inventory/outbound` |
| 中古車收購申請 | `/sales/inventory/used-purchase` |

</details>
</details>

---

<details open>
<summary><b>② 客服管理</b>（3 子目錄）</summary>

<details>
<summary>　└ 銷售 CRM</summary>

| 功能 | 路徑 |
|---|---|
| 銷售客戶基盤 | `/crm/sales/customer-base` |
| 銷售電訪問卷 | `/crm/sales/survey-templates?kind=sales` |
| 銷售電訪工作檯 | `/crm/sales/call-tasks?kind=sales` |
| 休眠戰敗管理 | `/crm/sales/dormant-leads` |
| 銷售 NPS 看板 | `/crm/sales/nps?kind=sales` |
| 推播通知管理 | `/crm/sales/push-notifications` |

</details>

<details>
<summary>　└ 售後 CRM</summary>

| 功能 | 路徑 |
|---|---|
| 售後客戶基盤 | `/crm/aftersales/customer-base` |
| 售後電訪問卷 | `/crm/aftersales/survey-templates` |
| 售後電訪工作檯 | `/crm/aftersales/call-tasks` |
| 休眠流失管理 | `/crm/aftersales/dormant-customers` |
| 售後 NPS 看板 | `/crm/aftersales/nps` |
| 推播通知設定 | `/crm/aftersales/push-notifications` |

</details>

<details>
<summary>　└ 店長綜合報表</summary>

| 功能 | 路徑 |
|---|---|
| 門店綜合概覽 | `/dashboard/store-overview` |
| CRM07 跨部門綜合報表 | `/crm/store-report` |

</details>
</details>

---

<details open>
<summary><b>③ 售後修護</b>（6 子目錄）</summary>

<details>
<summary>　└ DUCATI 售後與庫管模組導覽</summary>

| 功能 | 路徑 |
|---|---|
| 模組導覽 | `/parts/aftersales` |
| 預約管理看板 | `/parts/aftersales/appointments` |
| 預檢單 SA 環檢 | `/parts/aftersales/pre-inspections` |
| 預檢單轉 RO | `/parts/aftersales/pre-inspections/transfer` |
| 正式工單 RO | `/parts/aftersales/repair-orders/new` |
| 維修項目零件 | `/parts/aftersales/repair-orders/lines` |
| 追加項目記錄 | `/parts/aftersales/addons` |
| 增項閉環 | `/parts/aftersales/followups` |
| 竣工複檢 | `/parts/aftersales/final-inspections` |
| 結帳收款 | `/parts/aftersales/checkout` |

</details>

<details>
<summary>　└ 主管工作檯</summary>

| 功能 | 路徑 |
|---|---|
| 職級權限對照 | `/parts/aftersales/management/permissions` |
| 客群標籤 | `/parts/aftersales/management/customer-tags` |

</details>

<details>
<summary>　└ 售後工單</summary>

| 功能 | 路徑 |
|---|---|
| 接待預檢 | `/parts/aftersales/pre-inspections` |
| 串接工單 | `/parts/aftersales/ro-handoff` |
| 開立工單 | `/parts/aftersales/repair-orders/new` |
| 核對明細 | `/parts/aftersales/repair-orders/lines` |
| 追加項目記錄 | `/parts/aftersales/addons` |
| 增項閉環 | `/parts/aftersales/followups` |
| 竣工複檢 | `/parts/aftersales/final-inspections` |
| 結帳收款 | `/parts/aftersales/checkout` |
| 取車通知 | `/parts/aftersales/pickup-notifications` |
| 工單查詢 | `/parts/aftersales/repair-orders` |
| 人車檔案 | `/crm/aftersales/customer-base` |

</details>

<details>
<summary>　└ 車間管理</summary>

| 功能 | 路徑 |
|---|---|
| 技師工作台 | `/tech` |
| 工位看板 | `/parts/aftersales/management/bays` |
| 派工看板 | `/parts/aftersales/management/dispatch` |
| 員工名冊 | `/parts/aftersales/management/staff` |
| 工單編號規則 | `/parts/aftersales/management/ro-numbering` |
| 崗位折扣審批 | `/parts/aftersales/management/discounts` |
| 環檢項目設定 | `/parts/aftersales/management/env-check-items` |

</details>

<details>
<summary>　└ 查詢與檔案</summary>

| 功能 | 路徑 |
|---|---|
| 工單查詢 | `/parts/aftersales/repair-orders` |
| 人車檔案 | `/crm/aftersales/customer-base` |
| 工單查詢（v2） | `/parts/aftersales/ro-search` |

</details>

<details>
<summary>　└ 設定</summary>

| 功能 | 路徑 |
|---|---|
| 取車通知設定 | `/parts/aftersales/settings/pickup-notify` |
| 客戶標籤設定 | `/parts/aftersales/management/customer-tags` |

</details>
</details>

---

<details open>
<summary><b>④ 庫存管理</b>（14 子目錄）</summary>

<details>
<summary>　└ 組織與權限</summary>

| 功能 | 路徑 |
|---|---|
| 組織三層架構 | `/parts/setup/org` |
| 採購權限規則 | `/parts/setup/purchase-permissions` |
| 商品管理權限 | `/parts/setup/item-permissions` |
| 盤點回傳規則 | `/parts/setup/count-rules` |
| 管控類型定義 | `/parts/setup/control-types` |
| 通知儀表板 | `/admin/notifications` |
| 訂閱管理 | `/admin/notifications/subscriptions` |
| 通路與目標 | `/admin/notifications/targets` |
| 模板檢視 | `/admin/notifications/templates` |
| 送達記錄 | `/admin/notifications/deliveries` |

</details>

<details>
<summary>　└ 倉庫管理</summary>

| 功能 | 路徑 |
|---|---|
| 倉儲四層架構 | `/parts/setup/warehouse-arch` |
| 倉庫/庫區/庫位/擺放 | `/parts/setup/warehouse-bins` |
| 供應商資訊 | `/parts/setup/suppliers` |
| 採購合約 | `/parts/setup/contracts` |

</details>

<details>
<summary>　└ 商品管理</summary>

| 功能 | 路徑 |
|---|---|
| 商品基礎資料 | `/parts/setup/items` |
| 商品多維度資訊（跨倉/跨供應商） | `/parts/setup/items-info` |
| 門市定價 | `/parts/setup/pricing` |
| 適配設定（料-車/年份） | `/parts/setup/compatibility` |
| 序列號/批號追蹤 | `/parts/setup/serial` |
| 下拉選單對應 (Mapping) | `/parts/setup/dictionaries` |
| 序列號追蹤 | `/parts/setup/serial-tracking` |

</details>

<details>
<summary>　└ 採購管理</summary>

| 功能 | 路徑 |
|---|---|
| 採購流程鏈路 | `/parts/purchase/flow` |
| 需求處理 | `/parts/purchase/requisitions` |
| 日常補貨計畫 | `/parts/purchase/replenishment` |
| 商品採購 | `/parts/purchase/orders` |
| 採購退貨 | `/parts/purchase/returns` |

</details>

<details>
<summary>　└ 入庫管理</summary>

| 功能 | 路徑 |
|---|---|
| 採購入庫 | `/parts/receipt/po-grn` |
| 調撥入庫 | `/parts/receipt/transfer-in` |
| 內售入庫 | `/parts/receipt/internal-sale` |
| 領料退貨入庫 | `/parts/receipt/return-in` |

</details>

<details>
<summary>　└ 出庫管理</summary>

| 功能 | 路徑 |
|---|---|
| 維修領料（RO工單串接） | `/parts/issue/repair-pick` |
| 調撥出庫 | `/parts/issue/transfer-out` |
| 內售出庫 | `/parts/issue/internal-sale` |

</details>

<details>
<summary>　└ 庫存查詢（直接連結）</summary>

| 功能 | 路徑 |
|---|---|
| 庫存查詢 | `/parts/operations/balance` |

</details>

<details>
<summary>　└ 庫存作業</summary>

| 功能 | 路徑 |
|---|---|
| 例外出入庫 | `/parts/operations/exceptions` |
| 寄存管理 | `/parts/operations/consignment` |
| 庫存盤點作業 | `/parts/operations/count-ops` |
| 備件庫存調整 | `/parts/operations/adjust` |
| 入庫查詢 | `/parts/operations/receipts-history` |
| 調撥在途查詢 | `/parts/operations/transfers-in-transit` |

</details>

<details>
<summary>　└ 盤點管理</summary>

| 功能 | 路徑 |
|---|---|
| 盤點計畫 | `/parts/count/plans` |
| 盤點處理（條碼掃描） | `/parts/count/sessions` |
| 報損報溢 | `/parts/count/adjustments` |
| 報損報溢審核 | `/parts/count/loss-overflow` |

</details>

<details>
<summary>　└ 預警告警</summary>

| 功能 | 路徑 |
|---|---|
| 庫存水位設定 | `/parts/alerts/thresholds` |
| 告警類型與規則 | `/parts/alerts/rules` |
| 告警儀表板 | `/parts/operations/balance` |
| 工單增項閉環 | `/parts/alerts/work-order-loop` |
| 告警階層設定 | `/parts/alerts/escalation` |

</details>

<details>
<summary>　└ 保固索賠舊件</summary>

| 功能 | 路徑 |
|---|---|
| 索賠流程說明 | `/parts/warranty/flow` |
| 舊件出入庫邏輯設定 | `/parts/warranty/used-parts-flow` |
| 暫存倉設定 | `/parts/warranty/staging-warehouse` |
| 舊件管理介面 | `/parts/warranty/used-parts` |
| 與RO工單串接設定 | `/parts/warranty/ro-link` |
| 索賠費用回收追蹤 | `/parts/warranty/cost-recovery` |

</details>

<details>
<summary>　└ ABC 分類 / 分析報表</summary>

| 功能 | 路徑 |
|---|---|
| ABC分類定義與機制 | `/parts/analytics/abc-settings` |
| 報表：庫存周轉率 | `/parts/analytics/turnover` |
| 報表：呆滯庫存佔比 | `/parts/analytics/stale` |
| 報表：即時缺貨率 | `/parts/analytics/abc` |
| 報表：ABC結構圖 | `/parts/analytics/abc-structure` |

</details>

<details>
<summary>　└ 模組導覽總覽（直接連結）</summary>

| 功能 | 路徑 |
|---|---|
| 模組導覽總覽 | `/parts` |

</details>

<details>
<summary>　└ 流程關係圖（直接連結）</summary>

| 功能 | 路徑 |
|---|---|
| 流程關係圖 | `/parts/overview/flow` |

</details>
</details>

---

<details open>
<summary><b>⑤ 會計財務設定</b>（1 子目錄）</summary>

<details>
<summary>　└ 會計設定</summary>

| 功能 | 路徑 |
|---|---|
| 會計科目表 | `/admin/accounting/coa` |
| 統計科目表 | `/admin/accounting/dimensions` |
| Mapping 表 | `/admin/accounting/netsuite-mapping` |
| 會計分錄 | `/admin/accounting/journal-entries` |

</details>
</details>

---

<details open>
<summary><b>⑥ 電子發票</b>（2 子目錄）</summary>

<details>
<summary>　└ 發票管理</summary>

| 功能 | 路徑 |
|---|---|
| 發票列表 | `/einvoice` |
| 折讓單 | `/einvoice/allowances` |
| 作廢紀錄 | `/einvoice/voids` |
| 手動開立 | `/einvoice/issue` |

</details>

<details>
<summary>　└ 設定</summary>

| 功能 | 路徑 |
|---|---|
| 字軌與號碼 | `/einvoice/number-pools` |
| 發票設定 | `/einvoice/settings` |

</details>
</details>

---

<details open>
<summary><b>⑦ 核心進銷存模組</b>（3 子目錄）</summary>

<details>
<summary>　└ List 主檔</summary>

| 功能 | 路徑 |
|---|---|
| 員工主檔 | `/admin/master-data/employees` |
| 員工角色 | `/admin/master-data/employee-roles` |
| 客戶車輛 | `/admin/master-data/vehicles` |
| 車型主檔 | `/admin/master-data/vehicle-models` |
| 客戶資料 | `/admin/master-data/customers` |
| 客戶聯絡人 | `/admin/master-data/customer-contacts` |
| 部門組織 | `/admin/master-data/departments` |
| 供應商 | `/admin/master-data/suppliers` |
| 供應商定價 | `/admin/master-data/supplier-pricing` |
| 料號商品 🚧 | — |

</details>

<details>
<summary>　└ Transaction 交易</summary>

| 功能 | 路徑 |
|---|---|
| 維修預約 | `/admin/master-data/appointments` |
| 維修工單 | `/admin/master-data/work-orders` |
| PI / PDI 檢驗 | `/admin/master-data/inspections` |
| 保固索賠 | `/admin/master-data/warranty-claims` |

</details>

<details>
<summary>　└ Report 報表</summary>

| 功能 | 路徑 |
|---|---|
| 員工 / 部門報表 🚧 | — |
| 工單統計 🚧 | — |
| 保養回廠率 🚧 | — |
| 車輛保固到期 🚧 | — |

</details>
</details>

---

<details open>
<summary><b>⑧ 交車服務</b>（直接功能）</summary>

| 功能 | 路徑 |
|---|---|
| 交車作業看板 | `/sales/delivery` |

</details>

---

<details open>
<summary><b>⑨ 系統設定</b>（2 子目錄 + 2 直接功能）</summary>

| 直接功能 | 路徑 |
|---|---|
| 權限管理 | `/admin/rbac` |
| 組織架構 | `/admin/org/groups` |

<details>
<summary>　└ 系統設定</summary>

| 功能 | 路徑 |
|---|---|
| 後台權限與功能設定 | `/admin/navigation` |

</details>

<details>
<summary>　└ 意見回饋</summary>

| 功能 | 路徑 |
|---|---|
| 新增單據 | `/feedback/tickets/new` |
| 單據看板 | `/feedback/tickets` |

</details>
</details>
