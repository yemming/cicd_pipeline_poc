# -*- coding: utf-8 -*-
"""
DealerOS 三方對照報告生成器（零依賴，純標準庫產 .docx）
三欄：① 老闆給的文件（黃金版 HTML 規格）② 我們已完成 ③ 未來準備要做
資料來源：docs/20260529/ 對照表 v1 + 建議書 v3 + 背景文件 v5 × 本 repo 實際 route / nav_nodes
"""
import os, zipfile, html

OUT = os.path.join(os.path.dirname(__file__), "DealerOS_三方對照報告_v1.docx")

# ---------------------------------------------------------------------------
# 內容資料：每個 section = (標題, 說明, [ (col1, col2, col3) ... ])
# col1 老闆給的文件 / col2 我們已完成 / col3 未來準備做
# 慣例：col2 開頭 ✅ 已完成 / ⚠️ 部分 / ❌ 尚未；route 用等寬風格的純文字
# ---------------------------------------------------------------------------

SECTIONS = []

SECTIONS.append((
    "大模組 A‧① 銷售接待（最終版本 01_銷售接待）",
    "對照表標 22 項，含 6 支整車供應鏈新頁（🆕）。實作幾乎全覆蓋；文件標『無獨立頁』的訂單中心、員工九宮格，我們其實都有獨立 route。",
    [
        ("銷售漏斗看板\nRS_M1_銷售漏斗看板_v5", "✅ /sales/funnel ＋ /sales/manager/funnel", "—"),
        ("業績報表\nRS_M2_業績報表_v1", "✅ /sales/manager/sales-report", "—"),
        ("KPI目標/HABC・主管設定\nRS_M3_主管設定_v2", "✅ /sales/manager/kpi-targets ＋ card-config", "—"),
        ("員工九宮格\n（文件標 ❌ 無頁面）", "✅ /sales/manager/staff-grid（文件誤標為無，實作已有）", "可再對齊『能效九宮格』散佈圖視覺（與 GRP07 共用資料源）"),
        ("手卡參數設定\nRS_SET_參數設定頁_v1", "✅ /sales/settings/handcard-params", "—"),
        ("客群標籤設定\nRS_SET2_v2", "✅ /sales/settings/customer-tags ＋ /sales/customers/tags", "—"),
        ("新車庫存看板\nRS03A_新車庫存看板_v1 🔄", "✅ /sales/showroom/new-cars ＋ /sales/showroom/stock", "—"),
        ("中古車庫存看板\nRS03B_中古車庫存看板_v1 🔄", "✅ /sales/showroom/used-cars", "—"),
        ("接待電子手卡\nRS01_電子手卡_v8", "✅ /sales/reception/handcard", "—"),
        ("試乘試駕\nRS02_試乘試駕_v1", "✅ /sales/reception/test-rides ＋ /sales/test-drives", "—"),
        ("置換評估鑑價\nRS06_中古車評估鑑價_v2 🔄", "✅ /usedcar/evaluations（含 wizard）", "—"),
        ("報價與成交訂單\nRS04_賞車報價與成交訂單_v1", "✅ /sales/quote ＋ /sales/orders", "—"),
        ("訂單中心\n（文件標 ⚠️ 含於 RS04）", "✅ /sales/orders 已是獨立 list+detail（文件以為無獨立頁）", "—"),
        ("潛客跟進\n（文件標 ⚠️ 含於 CRM01A）", "✅ /sales/leads ＋ /sales/crm/*", "—"),
        ("交車管理\nRS05_交車管理_v1 🔄", "✅ /sales/delivery ＋ /delivery/*（pdi/ceremony/confirm/warranty-sign）", "—"),
        ("保險招攬\nRS_EX1_保險招攬工作台_v1", "✅ /sales/insurance", "—"),
        ("整車採購訂單\nRS_INV01 🆕", "✅ /sales/inventory/purchase-orders", "—"),
        ("到港確認\nRS_INV02 🆕（最關鍵節點）", "✅ /sales/inventory/arrival-confirmation", "確認批次掃 VIN→自動建 PDI 工單的後端串接到位"),
        ("整車採購財務結算\nRS_INV03 🆕", "✅ /sales/inventory/cost-settlement", "—"),
        ("車輛調撥\nRS_INV04 🆕", "✅ /sales/inventory/transfers", "—"),
        ("出庫管理\nRS_INV06 🆕", "✅ /sales/inventory/outbound", "—"),
        ("中古車收購申請\nRS_INV05 🆕", "✅ /sales/inventory/used-purchase", "—"),
    ],
))

SECTIONS.append((
    "大模組 A‧② 客服管理（最終版本 02_客服管理）",
    "13 支 CRM 頁（銷售 CRM 6 + 售後 CRM 6 + 店長報表 1），對照表全標 ✅。我們同時有 /crm 與舊 /sales/crm、/aftersales/crm 兩套入口（功能等價）。",
    [
        ("銷售客戶基盤\nCRM01A_v2", "✅ /crm/sales/customer-base", "—"),
        ("銷售電訪問卷設定\nCRM02A_v1", "✅ /crm/sales/survey-templates", "—"),
        ("銷售電訪工作台\nCRM03A_v1", "✅ /crm/sales/call-tasks", "—"),
        ("銷售休眠戰敗管理\nCRM04A_v1", "✅ /crm/sales/dormant-leads", "—"),
        ("銷售 NPS 看板\nCRM05A_v1", "✅ /crm/sales/nps ＋ /sales/crm/nps-dashboard", "—"),
        ("銷售推播通知管理\nCRM06A_v1", "✅ /crm/sales/push-notifications", "—"),
        ("售後客戶基盤\nCRM01B_v1", "✅ /crm/aftersales/customer-base", "—"),
        ("售後電訪問卷設定\nCRM02B_v1", "✅ /crm/aftersales/survey-templates", "—"),
        ("售後電訪工作台\nCRM03B_v1", "✅ /crm/aftersales/call-tasks", "—"),
        ("售後休眠流失管理\nCRM04B_v1", "✅ /crm/aftersales/dormant-customers", "—"),
        ("售後 NPS 看板\nCRM05B_v1", "✅ /crm/aftersales/nps", "—"),
        ("售後推播通知管理\nCRM06B_v1", "✅ /crm/aftersales/push-notifications", "—"),
        ("店長綜合報表\nCRM07_v2", "✅ /crm/store-report", "—"),
    ],
))

SECTIONS.append((
    "大模組 B‧③ 售後修護（最終版本 03_售後修護）",
    "工單主流程全綠。文件最大缺口『車間管理 7 支（工位/派工看板等，全標 ❌）』——我們其實都已實作於 /parts/aftersales/management/*。",
    [
        ("預約管理看板\n01_預約管理看板", "✅ /service/appointments ＋ /parts/aftersales/appointments", "—"),
        ("接待預檢 SA 環檢\n04_預檢單_SA環檢_v3", "✅ /parts/aftersales/pre-inspections ＋ /service/inspection", "—"),
        ("串接工單 預檢→RO\n04_預檢單_RO串接_v3", "✅ /parts/aftersales/pre-inspections/transfer", "—"),
        ("開立工單 RO\n02_正式工單RO 🔄（新增 PD 類型）", "✅ /parts/aftersales/repair-orders ＋ /service/workorders", "確認 PD 業務類型付款性質鎖 IN、計入整車成本"),
        ("核對維修項目零件明細\n03_維修項目零件明細", "✅ /parts/aftersales/repair-orders/[id]/lines", "—"),
        ("追加項目記錄\n04_追加項目記錄", "✅ /parts/aftersales/addons", "—"),
        ("增項閉環\n05_增項閉環_完整子模組", "✅ /parts/alerts/work-order-loop", "—"),
        ("竣工複檢\n06_竣工複檢_v1", "✅ /parts/aftersales/final-inspections", "—"),
        ("結帳收款\n08_結帳收款", "✅ /parts/aftersales/checkout", "—"),
        ("取車通知\n11_取車通知設定", "✅ /parts/aftersales/pickup-notifications ＋ settings/pickup-notify", "—"),
        ("工單查詢\n10_工單查詢 🔄", "✅ /parts/aftersales/ro-search", "—"),
        ("人車檔案\n09_人車檔案 🔄", "✅ /parts/aftersales/customers", "—"),
        ("PDI 工單執行（新車）\n02_PDI工單執行 🆕", "✅ /parts/aftersales/workorders/pdi/[id] ＋ /service/pdi", "確認完工→重算 total_cost→車輛 AVAILABLE 後端串接"),
        ("中古車整備工單\n02_中古車整備工單 🆕", "✅ /parts/aftersales/workorders/recon/[id]", "—"),
        ("技師工作台\n07_售後管理模組_v2（⚠️含部分）", "✅ /tech ＋ /service/workshop", "—"),
        ("工位看板（文件標 ❌）", "✅ /parts/aftersales/management/bays", "—"),
        ("派工看板（文件標 ❌）", "✅ /parts/aftersales/management/dispatch", "—"),
        ("員工名冊（文件標 ❌）", "✅ /parts/aftersales/management/staff", "—"),
        ("工單編號規則（文件標 ❌）", "✅ /parts/aftersales/management/ro-numbering ＋ /service/manager/ro-prefix", "—"),
        ("崗位折扣審批（文件標 ❌）", "✅ /parts/aftersales/management/discounts", "—"),
        ("環檢項目設定（文件標 ❌）", "✅ /parts/aftersales/management/env-check-items", "—"),
        ("客戶標籤主管設定\n12_客戶標籤主管設定", "✅ /parts/aftersales/management/customer-tags ＋ /service/manager/customer-tags", "—"),
    ],
))

SECTIONS.append((
    "大模組 B‧④ 庫存管理（最終版本 04_庫存管理）",
    "進銷存主鏈（基礎設定→採購→入出庫→盤點→保固→ABC）全綠。真缺口只剩 3 項：告警儀表板、即時缺貨率報表、報損報溢審核。",
    [
        ("基礎設定：組織三層架構", "✅ /parts/setup/org", "—"),
        ("基礎設定：採購權限規則", "✅ /parts/setup/purchase-permissions", "—"),
        ("基礎設定：商品管理權限", "✅ /parts/setup/item-permissions", "—"),
        ("基礎設定：盤點回傳規則", "✅ /parts/setup/count-rules", "—"),
        ("基礎設定：管控類型定義", "✅ /parts/setup/control-types", "—"),
        ("倉儲四層架構 / 倉庫庫區庫位", "✅ /parts/setup/warehouse-arch ＋ warehouse-bins", "—"),
        ("供應商資訊 / 採購合約", "✅ /parts/setup/suppliers ＋ contracts", "—"),
        ("商品基礎資料 / 多維度 / 定價 / 適配 / 序列號", "✅ /parts/setup/{items,items-info,pricing,compatibility,serial}", "—"),
        ("下拉選單 Mapping（文件標 ❌）", "✅ /parts/setup/dictionaries ＋ /settings/dictionary", "—"),
        ("採購管理：需求/補貨/採購/退貨/流程", "✅ /parts/purchase/{requisitions,replenishment,orders,returns,flow}", "—"),
        ("入庫管理：採購/調撥/內售/領料退貨入庫", "✅ /parts/receipt/{po-grn,transfer-in,internal-sale,return-in}", "—"),
        ("出庫管理：維修領料/調撥/內售出庫", "✅ /parts/issue/{repair-pick,transfer-out,internal-sale}", "—"),
        ("庫存查詢 / 例外 / 寄存 / 在途 / 入庫查詢", "✅ /parts/operations/{balance,exceptions,consignment,transfers-in-transit,receipts-history}", "—"),
        ("盤點管理：計畫/處理/報損報溢", "✅ /parts/count/{plans,sessions,loss-overflow} ＋ operations/count-ops", "—"),
        ("報損報溢審核（文件標 ❌）", "⚠️ /parts/count/loss-overflow 有頁，審核步驟待確認", "補雙簽/審核流程（文件建議可合入現有頁 Tab）"),
        ("預警告警：水位/規則/階層/工單增項閉環", "✅ /parts/alerts/{thresholds,rules,escalation,work-order-loop}", "—"),
        ("告警儀表板（文件標 ❌，🟡 預警視覺核心）", "❌ 尚未；現有 4 支皆設定頁，缺彙整看板", "【真缺口】補一支料號破安全庫存/採購逾期/批號到期的 rollup 看板"),
        ("保固索賠系列\n11_保固索賠_*", "✅ /parts/warranty/{flow,ro-link,cost-recovery,staging-warehouse,used-parts}", "—"),
        ("ABC 分類設定 / 周轉率 / 呆滯 / 結構圖", "✅ /parts/analytics/{abc-settings,turnover,stale,abc-structure,abc}", "—"),
        ("即時缺貨率報表（文件標 ❌，🟡）", "❌ 尚未", "【真缺口】補一支缺貨率報表（套 DataGrid + analytics helper）"),
    ],
))

SECTIONS.append((
    "大模組 C‧⑤⑥⑦⑧⑨ 財務 × 核心主檔 × 系統設定",
    "文件稱此為『前端缺口最集中區塊』、整段標 ❌——這是與實作落差最大的一段。會計財務、電子發票、List 主檔我們全部做好且掛上正式站 sidebar，並額外完成試算表/損益表/資產負債表三張財報（超出文件範圍）。",
    [
        ("⑤ 會計科目表（文件 ❌）", "✅ /admin/accounting/coa（COA 五層 + 412 筆 seed 已上線）", "—"),
        ("⑤ 統計科目表 GL Dimensions（文件 ❌，後台已建 29）", "✅ /admin/accounting/dimensions（29 維度 + 管理 UI，文件以為只有後台無頁）", "—"),
        ("⑤ Mapping 表（文件 ❌）", "✅ /admin/accounting/netsuite-mapping", "—"),
        ("⑤ 會計分錄（文件 ❌）", "✅ /admin/accounting/journal-entries（含 new/detail）", "—"),
        ("⑤ 財務報表（文件未列）", "✅ 試算表 + 損益表 + 資產負債表 /admin/accounting/reports/*（三視圖平衡，正式站服務中）", "下一張：現金流量表 CF；AP/AR 帳齡表；財報列印 PDF"),
        ("⑥ 電子發票全模組 6 支（文件全 ❌）", "✅ /einvoice + issue + allowances + voids + number-pools + settings", "對接財政部 turnkey/加值中心實際 API（目前為流程骨架）"),
        ("⑦ List 主檔：員工/員工角色/客戶/客戶聯絡人/客戶車輛/車型（文件全 ❌，列為 🔴 第三波首要）", "✅ /admin/master-data/{employees,employee-roles,customers,customer-contacts,vehicles,vehicle-models}", "—"),
        ("⑦ List 主檔：部門組織/供應商/供應商定價/料號商品（文件 ⚠️/❌）", "✅ /admin/master-data/{departments,suppliers,supplier-pricing} ＋ /admin/org/* ＋ /parts/setup/items", "—"),
        ("⑦ Transaction：維修預約/工單/PI·PDI/保固索賠", "✅ /admin/master-data/{appointments,work-orders,inspections,warranty-claims}", "—"),
        ("⑦ Report：員工/部門報表、工單統計（文件 ⚠️）", "⚠️ 部分（/sales/manager/sales-report、ro-search 為查詢非統計）", "補統計型報表彙整視角"),
        ("⑦ Report：保養回廠率、車輛保固到期（文件 ❌）", "❌ 尚未", "補回廠率 / 保固到期提醒報表（資料源已具備）"),
        ("⑧ 交車作業看板（文件 ⚠️ 含於 RS05）", "✅ /sales/delivery ＋ /delivery/*", "—"),
        ("⑨ 系統設定：權限管理/組織架構/後台功能設定", "✅ /admin/{rbac,navigation,org,approval-flow} ＋ /settings/{roles,org}", "—"),
        ("⑨ 意見回饋 新增單據 + 單據看板（文件 ❌）", "✅ /feedback/tickets + /feedback/tickets/new（本 repo 招牌 CI/CD pipeline 入口，已接 LINE 通知）", "—"),
    ],
))

SECTIONS.append((
    "大模組 D‧集團管理 GRP01–GRP20（最終版本 05_集團管理）",
    "對照表把 21 支黃金版 HTML 全標 ✅，但那是『設計稿完成』；就『接上真實資料庫的 Next.js 實作』而言，這是落差最大、也是未來主戰場的一段——建議書 v3 的 Phase 1-4 里程碑（31-43 週）幾乎都落在這裡，核心是個人能效散佈圖與戰略決策層。",
    [
        ("GRP01 集團總覽_v1", "✅ /group/group-overview（已有基礎看板）", "對齊 Benchmark 四欄 + Health Score + 戰略四象限完整度"),
        ("GRP02 BSC 計分卡_v1（22 項 KPI 五 Tab）", "⚠️ 尚無專屬 BSC route", "建議書第九章：建 kpi_snapshots 快取表 + 22 項 KPI 頁（Phase 4）"),
        ("GRP02R 門店績效報告產生器_v1", "✅ /group/reports（基礎）", "對齊四節 PDF（封面/速覽/對標/趨勢）+ Puppeteer 出 PDF"),
        ("GRP03 銷售目標監看_v1（收集監看唯讀）", "✅ /group/sales-target", "預留『集團目標下發』開關（DUCATI 強管控時切換）"),
        ("GRP04 集團儀表板（桌機）_v1", "✅ /group/dashboard", "—"),
        ("GRP05 季度績效報告_v1", "⚠️ 可能併入 /group/reports", "補 QoQ 環比 + 月度拆解季報"),
        ("GRP06 集團儀表板（手機）_v1", "✅ /group/dashboard-mobile", "—"),
        ("GRP07 銷售顧問能效_v2（D3 四散佈圖 S1-S4）", "❌ 尚未", "【未來核心】個人能效散佈圖；orders+leads GROUP BY staff（Phase 2）"),
        ("GRP08 SA 能效診斷_v1（散佈圖 A1-A4）", "❌ 尚未", "repair_orders GROUP BY sa_id；返修率告警橫幅（Phase 2）"),
        ("GRP09 門店銷售診斷_v1", "❌ 尚未", "雙層導航 + 漏斗圖 + 批售告警（Phase 2）"),
        ("GRP10 門店售後診斷_v1", "❌ 尚未", "車間三率 + 零件庫存健康（Phase 2）"),
        ("GRP11 跨部門能效_v1", "❌ 尚未", "客戶流失歸因 X1 + NPS 散佈 X2（Phase 3）"),
        ("GRP12 集團零件財務總覽_v2", "⚠️ /inventory/* 有零件商務雛形（marketing/rebate/quota）", "零件庫存財務模組 + 供應滿足率×台次雙軸串聯圖（Phase 3）"),
        ("GRP13 促銷活動管理_v1", "⚠️ /inventory/marketing（部分）", "promotions 表 + 折扣授權矩陣（Phase 4）"),
        ("GRP14 定價折扣設定_v1", "⚠️ /inventory/policy（部分）", "MSRP/底線 + 折扣異常告警（Phase 4）"),
        ("GRP15 技師效率診斷_v1（T1-T3）", "❌ 尚未", "technician_timelog；返修率排名（Phase 3，原版最大盲點）"),
        ("GRP16 Dealer Health Score_v1", "❌ 尚未", "22 項 KPI 加權 0-100 分 + 月快照（Phase 4 戰略層）"),
        ("GRP17 門店評估四象限_v1", "❌ 尚未", "整合 BSC+Health Score 的戰略決策介面（Phase 4）"),
        ("GRP18 集團客戶動態_v1", "❌ 尚未", "跨門店客戶流失預警（Phase 3）"),
        ("GRP19 品牌認證中古車能效_v1", "❌ 尚未", "中古車個人能效 U1-U2（Phase 3）"),
        ("GRP20 組織架構設定_v1", "✅ /admin/org ＋ /settings/org（org_mode 三/四層）", "—"),
    ],
))

# 集團管理 Phase 里程碑（建議書 v3 第十二章）— 額外附一張 roadmap 表
ROADMAP = (
    "附錄：集團管理模組開發里程碑（建議書 v3 第十二章，未來主路線）",
    "下表為老闆建議書規劃的四階段；地基層（org_mode 開關、四層組織、kpi_snapshots 批次、org_benchmarks）是所有集團功能的前置依賴，必須最先做。",
    [
        ("Phase 1 地基層（7-10 週）", "org_mode 三/四層切換已具雛形；組織架構 /admin/org 已上線", "kpi_snapshots 批次框架 + org_benchmarks 對標表 + 每 API org_id 強制過濾"),
        ("Phase 2 核心看板層（8-12 週）", "集團總覽/儀表板/目標監看已有基礎頁", "門店三業務 Tab + 個人能效散佈圖（GRP07/08）+ 趨勢對比曲線"),
        ("Phase 3 深度診斷層（6-8 週）", "—", "技師效率圖 GRP15 + 零件財務串聯圖 GRP12 + 流失歸因/NPS 排名 + 中古車能效 GRP19"),
        ("Phase 4 戰略決策層（10-13 週）", "—", "BSC 22 項 KPI 頁 GRP02 + Dealer Health Score GRP16 + 促銷/定價 GRP13/14 + 評估四象限 GRP17"),
    ],
)

# ---------------------------------------------------------------------------
# OOXML 產生器
# ---------------------------------------------------------------------------
def esc(s):
    return html.escape(str(s), quote=False)

def runs(text, bold=False, color=None, size=None):
    """把含 \n 的文字轉成多段 run（用 <w:br/> 斷行）"""
    parts = esc(text).split("\n")
    rpr = "<w:rPr>"
    if bold: rpr += "<w:b/>"
    if color: rpr += f'<w:color w:val="{color}"/>'
    if size: rpr += f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>'
    rpr += '<w:rFonts w:ascii="Calibri" w:eastAsia="Microsoft JhengHei" w:hAnsi="Calibri"/></w:rPr>'
    out = []
    for i, p in enumerate(parts):
        br = "<w:br/>" if i > 0 else ""
        out.append(f"<w:r>{rpr}{br}<w:t xml:space=\"preserve\">{p}</w:t></w:r>")
    return "".join(out)

def para(text="", bold=False, color=None, size=None, align=None, space_before=0, space_after=80):
    ppr = "<w:pPr>"
    ppr += f'<w:spacing w:before="{space_before}" w:after="{space_after}"/>'
    if align: ppr += f'<w:jc w:val="{align}"/>'
    ppr += "</w:pPr>"
    body = runs(text, bold=bold, color=color, size=size) if text else ""
    return f"<w:p>{ppr}{body}</w:p>"

def cell(text, w, bold=False, color=None, shade=None, size="19"):
    tcpr = f'<w:tcPr><w:tcW w:w="{w}" w:type="dxa"/>'
    if shade: tcpr += f'<w:shd w:val="clear" w:fill="{shade}"/>'
    tcpr += '<w:vAlign w:val="center"/></w:tcPr>'
    p = f'<w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>{runs(text, bold=bold, color=color, size=size)}</w:p>'
    return f"<w:tc>{tcpr}{p}</w:tc>"

# 三欄寬度（A4 橫式 usable ~13958 twips）
W1, W2, W3 = 4500, 5300, 4158

def table(rows, header=("① 老闆給的文件（黃金版 HTML 規格）", "② 我們已完成的部分", "③ 未來準備要做的部分")):
    grid = f'<w:tblGrid><w:gridCol w:w="{W1}"/><w:gridCol w:w="{W2}"/><w:gridCol w:w="{W3}"/></w:tblGrid>'
    tblpr = ('<w:tblPr><w:tblW w:w="13958" w:type="dxa"/>'
             '<w:tblBorders>'
             '<w:top w:val="single" w:sz="4" w:color="BBBBBB"/>'
             '<w:left w:val="single" w:sz="4" w:color="BBBBBB"/>'
             '<w:bottom w:val="single" w:sz="4" w:color="BBBBBB"/>'
             '<w:right w:val="single" w:sz="4" w:color="BBBBBB"/>'
             '<w:insideH w:val="single" w:sz="4" w:color="DDDDDD"/>'
             '<w:insideV w:val="single" w:sz="4" w:color="DDDDDD"/>'
             '</w:tblBorders></w:tblPr>')
    # 表頭列
    hdr = "<w:tr><w:trPr><w:tblHeader/></w:trPr>"
    hdr += cell(header[0], W1, bold=True, color="FFFFFF", shade="1A3A5C")
    hdr += cell(header[1], W2, bold=True, color="FFFFFF", shade="0F6E56")
    hdr += cell(header[2], W3, bold=True, color="FFFFFF", shade="854F0B")
    hdr += "</w:tr>"
    body = ""
    for c1, c2, c3 in rows:
        # col2 依狀態上底色
        sh2 = None
        if c2.startswith("✅"): sh2 = "EAF3DE"
        elif c2.startswith("⚠️"): sh2 = "FDF3E3"
        elif c2.startswith("❌"): sh2 = "FDECEA"
        sh3 = "F8F7F4" if c3 != "—" else None
        body += "<w:tr>"
        body += cell(c1, W1, bold=True)
        body += cell(c2, W2, shade=sh2)
        body += cell(c3, W3, shade=sh3, color=("CC0000" if c3.startswith("【真缺口】") else None))
        body += "</w:tr>"
    return f"<w:tbl>{tblpr}{grid}{hdr}{body}</w:tbl>"

# 組裝 document.xml
body_xml = []
body_xml.append(para("DealerOS — 老闆規格 × 已完成 × 未來規劃 三方對照報告", bold=True, color="1A3A5C", size="34", align="center", space_after=40))
body_xml.append(para("v1.0 ｜ 2026-05-29 ｜ 對照基準：對照表 v1 × 建議書 v3 × 背景文件 v5 × 126 支最終版 HTML × 本系統實際 route / nav_nodes", color="5A5955", size="18", align="center", space_after=200))

body_xml.append(para("一、本報告怎麼讀", bold=True, color="1A3A5C", size="26", space_before=120))
for t in [
    "座標系：老闆方（海德生 Indian SA / 產品負責人）負責黃金版 HTML/UI 設計；我們（文件稱「Partner」＝技術開發方）負責接上真實資料庫。本報告把老闆的設計規格逐項對到我們已上線的 Next.js route，再標出未來要補的工。",
    "三欄定義：① 老闆給的文件＝對照表/建議書裡的黃金版 HTML 與規格；② 我們已完成＝目前正式站可用的實際 route（✅ 已完成／⚠️ 部分／❌ 尚未）；③ 未來準備做＝缺口與建議書 Phase 1-4 路線。",
    "關鍵結論：對照表是「老闆畫了幾張設計稿」的視角，不是「我們實作了多少」的視角，兩者不同座標系。實測下，對照表標 ❌/⚠️ 的項目絕大多數我們早已實作上線——尤其「前端缺口最集中」的會計財務、電子發票、List 主檔三段，以及售後「車間管理 7 支」，文件全標缺、實際全有。真正待補集中在『集團管理深度診斷層（GRP07-19 散佈圖/戰略決策）』，以及庫存的告警儀表板、缺貨率報表兩張小報表。",
]:
    body_xml.append(para("• " + t, size="20", space_after=80))

for title, note, rows in SECTIONS:
    body_xml.append(para(title, bold=True, color="1A3A5C", size="24", space_before=240, space_after=40))
    body_xml.append(para(note, color="5A5955", size="18", space_after=80))
    body_xml.append(table(rows))

# roadmap
title, note, rows = ROADMAP
body_xml.append(para(title, bold=True, color="854F0B", size="24", space_before=240, space_after=40))
body_xml.append(para(note, color="5A5955", size="18", space_after=80))
body_xml.append(table(rows, header=("階段（建議書工期）", "我們目前狀態", "未來實作重點")))

body_xml.append(para("三、給雙方的建議", bold=True, color="1A3A5C", size="26", space_before=240))
for t in [
    "對照表應回填：建議把對照表 v1 的狀態欄依本報告校正，否則會誤導雙方以為系統仍停在半成品，重複開「補做 List 主檔/車間管理」的工單浪費溝通。",
    "下一步開發排序建議：(1) 集團管理 Phase 1 地基（kpi_snapshots 批次 + org_benchmarks + org_id 過濾）——所有 GRP 深度功能的前置；(2) GRP07/08 個人能效散佈圖（對外提案核心賣點）；(3) 庫存告警儀表板 + 缺貨率報表（輕量、補預警視覺）;(4) 報損報溢審核流程。",
    "財務模組已超前規格：我們已多做三張財報（TB/IS/BS），下一張可接現金流量表 CF 或 AP/AR 帳齡表，並補財報列印 PDF。",
]:
    body_xml.append(para("• " + t, size="20", space_after=80))

# 橫式 A4 section
sect = ('<w:sectPr>'
        '<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>'
        '<w:pgMar w:top="1100" w:right="1100" w:bottom="1100" w:left="1100" w:header="708" w:footer="708" w:gutter="0"/>'
        '</w:sectPr>')

document = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    '<w:body>' + "".join(body_xml) + sect + '</w:body></w:document>'
)

content_types = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    '</Types>'
)
rels = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    '</Relationships>'
)

with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
    z.writestr("[Content_Types].xml", content_types)
    z.writestr("_rels/.rels", rels)
    z.writestr("word/document.xml", document)

print("OK ->", OUT)
print("sections:", len(SECTIONS), "+ roadmap")
print("total rows:", sum(len(s[2]) for s in SECTIONS) + len(ROADMAP[2]))
