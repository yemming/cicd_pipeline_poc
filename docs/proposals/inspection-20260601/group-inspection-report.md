# ⑤ 集團管理模組 — 巡檢報告（Phase 0 路徑巡檢 + Phase 1 版本差異分析）

**日期：2026-06-01　｜　巡檢對象：老闆 6/1 設計稿異動（GRP 6 支）+ 測試清單 18 場景（GRP01–GRP20 整模組）**
**巡檢方法：對齊背景文件 §4.2 三要素 — 修改過程 / 版本差異分析 / 整路徑巡檢**

> 結論先講：集團模組是**「架構大致到位、真實數據幾乎全空」**的狀態。
> 路由、board 元件、domain helper、權限守門、下鑽互動大多已實作；
> 但 10 支報表頁共用的 `kpi_snapshots` 快照表**沒建表也沒 seed**，所以畫面全是空/假；
> GRP14 定價核准的下游同步鏈、GRP20 的 org_mode/RLS 組織隔離、GRP02 BSC 整頁，三項是真正的缺口。

---

## 一、修改過程（設計稿這輪改了什麼）

來源：`10_集團功能模組_HTML異動檔案包/異動說明_v1.md`，6 支頁面、無新增頁。

| # | 設計稿頁 | 異動本質 |
|---|---|---|
| 1 | GRP01 集團總覽 | 下鑽 Toast→真實跳轉(→GRP09/10) + API 橫幅 |
| 2 | GRP04 集團儀表板 | 下鑽 Toast→真實跳轉 + API 注解 |
| 3 | GRP06 手機版 | 下鑽 Toast→真實跳轉 + API 注解 |
| 4 | GRP03 銷售目標 | **新增 Pace 配速預測計算器**（手動輸入版） |
| 5 | GRP13 促銷活動 | alert()→Toast + API 串接橫幅 |
| 6 | GRP14 定價折扣 | alert()→Toast + **定價核准同步至 04B/07B** 說明 |
| 7 | GRP20 組織架構 | saveNode API 說明 + ⚠️ Supabase RLS 上線前必須完成橫幅 |

註：設計稿異動只碰 7 點，但測試清單 18 場景涵蓋整個 GRP01–GRP20，故巡檢範圍 = 整模組。

---

## 二、路徑巡檢 + GRP↔repo 對映表（Phase 0）

repo 集團模組落在 `src/app/(workspace)/group/*`。逐路由實況：

| GRP | 設計稿頁 | repo 路由 | route | 資料來源 | 互動 | 評級 |
|---|---|---|---|---|---|---|
| GRP01 | 集團總覽 | `group-overview` | ✅ | **Stitch 設計稿**（loadStitchBody，假資料） | 下鑽走 Stitch go()→router.push | ❌ 未落地（純設計稿）|
| GRP02 | BSC 計分卡 | **無** | ❌ | 無路由/helper/表 | — | ➕ 需新建（整頁）|
| GRP03 | 銷售目標/Pace | `sales-target` | ✅ | **Stitch 設計稿** | 無 Pace 計算器 | ❌ 未落地（Pace 完全缺）|
| GRP04 | 集團儀表板 | `dashboard` | ✅ | Stitch + **售後人效區真實**(`getTechnicianEfficiencySummary`) | 無下鑽 | 🟡 部分（僅人效真實）|
| GRP05 | 季度績效報告 | `reports` | ✅ | **Stitch 設計稿** | 無 PDF 匯出 | ❌ 未落地 |
| GRP06 | 手機版 | `dashboard-mobile` | ✅ | **Stitch 設計稿** | 下鑽走 Stitch go() | ❌ 未落地 |
| GRP07 | 銷售顧問能效 | `sales-efficiency` | ✅ | `getSalesEfficiencyScatter`：交易軸真實+KPI 軸缺 seed | 門店下拉前端過濾 | 🟡 部分 |
| GRP08 | SA 能效 | `sa-efficiency` | ✅ | `getSAEfficiencyScatter`：接車/產值真實+毛利/返修缺 seed | 同上 | 🟡 部分 |
| GRP09 | 門店銷售 | `store-sales` | ✅ | `getStoreSalesDiagnostics`→`kpi_snapshots`（**表空**）| ✅ ?store= 真下鑽 | ❌ 未落地（結構真、數據空）|
| GRP10 | 門店售後 | `store-service` | ✅ | `getStoreServiceDiagnostics`→`kpi_snapshots`（**表空**）| ✅ ?store= 真下鑽 | ❌ 未落地（結構真、數據空）|
| GRP12 | 集團零件財務 | `parts-financials` | ✅ | `getGroupPartsFinancials`（business_rules+kpi_snapshots seed）| 單店深鑽前端切 | 🟡 部分（讀取邏輯完成、SKU 篩選缺）|
| GRP13 | 促銷活動 | `promotions` | ✅ | **真實 CRUD**：`@/domain/group-promotions`(business_rules rule_kind='promo_campaign') | banner OK、狀態機完整 | ✅ 已落地 |
| GRP14 | 定價折扣 | `pricing` | ✅ | **真實 CRUD**：`@/domain/group-pricing`(business_rules='pricing_policy') | banner OK、狀態機完整 | 🟡 部分（下游同步缺）|
| GRP15 | 技師效率 | `tech-efficiency` | ✅ | `getTechEfficiencyScatter`：接單真實+工時效率/返修/準時全缺 seed | 門店下拉前端過濾 | 🟡 部分 |
| GRP16 | Dealer Health | `health-score` | ✅ | `getDealerHealthScores`→`kpi_snapshots`（**表空**）| 期間前端 label | ❌ 未落地（六維全缺 seed）|
| GRP17 | 門店四象限 | `store-quadrant` | ✅ | 同 GRP16 + 歷史軌跡`quarterly_snapshots`（**無表**）| X/Y 軸前端 useState | ❌ 未落地 |
| GRP18 | 集團客戶動態 | `customer-dynamics` | ✅ | `getGroupCustomerDynamics`→kpi_snapshots(metadata seed)（**空**）| switchStore 前端切視圖 | ❌ 未落地 |
| GRP19 | 認證中古車能效 | `usedcar-efficiency` | ✅ | `getUsedCarEfficiency`→**`used_car_inventory` 真實表** | 門店 Tab | ✅ 已落地 |
| GRP20 | 組織架構 | `org-structure` | ✅ | `getOrgStructure` 唯讀樹（真實 groups/subsidiaries/orgs/depts）+ RBAC 矩陣在 `admin/navigation` | 唯讀+深連結編輯 | 🟡 部分（無 org_mode/寫入/RLS 隔離）|

**對映修正**：GRP09=`store-sales`、GRP10=`store-service`（非設計稿暗示的同頁 Tab）；BSC(GRP02) repo 無對應；GRP04 售後人效已抽成 `technician-efficiency-section.tsx` 真實區塊。

---

## 三、版本差異分析（Phase 1）— 18 測試場景重新評級

老闆 docx 原評（看自己 HTML）：10❌ / 8⚠️。repo 重新評級後：

| 場景 | 老闆原評 | repo 重評 | 落差核心（要接 API/DB 還缺什麼）|
|---|---|---|---|
| GRP20-01 組織架構/org_mode | ❌ | 🟡 部分 | 唯讀樹+組織表已真實；缺 `system_settings.org_mode`、`POST /api/org-nodes` 寫入、節點變更即時反映下拉 |
| GRP20-02 角色權限+RLS | ❌ | 🟡 部分 | RBAC 矩陣+role_permissions 表+儲存 action 已有；**缺組織層級 RLS**（現用舊 user_has_brand，無 SA只看自己/店長只看本店）|
| GRP01-01 集團總覽 | ❌ | ❌ | 純 Stitch；缺 `group_summary` 彙總表+`GET /api/group/summary`；下鑽目標頁(GRP09/10)數據也空 |
| GRP02-01 BSC 計分卡 | ❌ | ➕ 需新建 | repo 完全無此頁；需路由+22 項 KPI 彙總+`bsc_targets`+趨勢快照 |
| GRP03-01 Pace 配速 | ⚠️ | ❌ | sales-target 還是 Stitch；Pace 計算器**完全沒做**；缺 `GET /api/stores/{id}/mtd-sales`+門市行事曆工作天 |
| GRP05-01 季度績效報告 | ⚠️ | ❌ | 純 Stitch；缺 QoQ/YoY 快照+PDF 匯出（可走既有 `/api/pdf` pattern）|
| GRP06-01 手機版 | ⚠️ | ❌ | 純 Stitch；同 GRP04 數據源；觸控未驗 |
| GRP07-01 銷售顧問能效 | ❌ | 🟡 部分 | 散佈圖交易軸(接待/成交)真實；缺 GP3/衍生毛利/NPS 的 `kpi_snapshots` seed |
| GRP08-01 SA 能效 | ❌ | 🟡 部分 | 接車/產值真實；缺 毛利/增項/NPS/**返修率(RP-FR)** seed |
| GRP15-01 技師效率 | ❌ | 🟡 部分 | 接單真實；工時效率(需 07B 標準 LU)/返修/準時/年資全缺 seed |
| GRP09-01 門店銷售 | ⚠️ | ❌ | 路由+下鑽+集團均值結構真；診斷指標全讀空的 `kpi_snapshots` |
| GRP10-01 門店售後 | ⚠️ | ❌ | 同上（返修/毛利/吸收/產值全缺 seed）|
| GRP12-01 集團零件財務 | ❌ | 🟡 部分 | 聚合邏輯完成（business_rules+kpi_snapshots seed）；缺真實出庫接線+SKU 篩選 UI |
| GRP13-01 促銷活動 | ⚠️ | ✅ 已落地 | 真實 CRUD+狀態機+audit_log（存 business_rules）；唯 REST endpoint 未拆出（走 server action）|
| GRP14-01 定價同步報價 | ⚠️ | 🟡 部分 | 定價 CRUD+審核+audit 完成；**核准後同步 04B/07B 的下游鏈零實作**（最高風險）|
| GRP16-01 Dealer Health | ❌ | ❌ | 路由+雷達+helper 真；六維評分全缺 `kpi_snapshots`+`dealer_health_scores` 歷史表 |
| GRP17-01 門店四象限 | ⚠️ | ❌ | 四象限+軸切換真；軸值全缺 seed+`quarterly_snapshots` 無表 |
| GRP18-01 集團客戶動態 | ❌ | ❌ | 漏斗/Donut/高風險清單 UI 真；數據全缺；高風險>180天需接 CRM |

---

## 四、Phase 2 更新待辦（依「完整接 API/DB」拆解，給 Ming 拍板優先序）

把落差收斂成 **6 個工作包**，標相依與規模：

| 包 | 內容 | 影響場景 | 規模 | 需 schema proposal |
|---|---|---|---|---|
| **A. kpi_snapshots 表 + demo seed** | 建 `kpi_snapshots`（brand/org/staff/role/period/metric_key/value/metadata）+ round16-19 各維度 seed | GRP07/08/09/10/15/16/17/18（8 頁一次救活）| 大 | ✅ 必須 |
| **B. GRP20 安全基礎** | `system_settings.org_mode` + `POST /api/org-nodes` 寫入 + **組織層級 RLS**（SA/店長/集團主管隔離）+ 紅色橫幅 | GRP20-01/02（⚠️上線前必須）| 大 | ✅ 必須 |
| **C. GRP14 定價下游同步** | 核准 transaction：pricing→service_packages→04B 報價即時生效 + 獨立 audit-logs endpoint | GRP14-01 | 中 | 部分（service_packages 表）|
| **D. GRP01/04/06 總覽彙總** | `group_summary` 彙總表+cron + `GET /api/group/summary` + Stitch 頁升級 React + 下鑽真數據 | GRP01/04/06 | 大 | ✅ 必須 |
| **E. GRP03 Pace 配速** | sales-target 升級 React + Pace 計算器 + `mtd-sales` + 門市行事曆工作天 + <85% 寫 group_alerts | GRP03-01 | 中 | 部分（store_calendar）|
| **F. GRP02 BSC + GRP05 報告 + GRP16/17 歷史** | BSC 整頁新建 + `bsc_targets` + `dealer_health_scores`/`quarterly_snapshots` 歷史表 + GRP05 PDF | GRP02/05/16/17 | 大 | ✅ 必須 |

**建議優先序（試點目標：先把畫面變「活」+ 安全基礎）**：
1. **A（kpi_snapshots seed）** — CP 值最高，一包救 8 頁，且是 GRP09/10/16/17/18 的唯一阻塞
2. **B（GRP20 RLS 安全基礎）** — 背景文件 §8.3 明訂「必須最先設定」，不做則所有資料隔離形同虛設
3. **C（GRP14 下游同步）** — 範圍小、商業邏輯關鍵（定價不一致會出大事）
4. D / E / F — 較重，依簽單需求再排

---

---

## 四之二、⚠️ Phase 0.5 實際載入驗證 — ground truth 修正（2026-06-01）

**為什麼加這節**：上面 §三/§四 是巡檢 agent 看 code/migration 推測的，事後用「真庫查詢 + 實際 Playwright 載入 18 頁 + 截圖」三方交叉驗證，發現 agent **嚴重低估**了完成度。記錄如下，避免後續照錯前提施工。

### 證據鏈
1. **真庫**：`kpi_snapshots` 表**存在**、918 筆 indian 真資料、橫跨 2024-12～2026-06；六維健康分/診斷/漏斗/churn/nps 全有 seed（agent 說「沒建表、zero seed」是錯的，因為本專案 schema 走 Cloud apply、無 migration 檔可看）。
2. **helper query 實證**：模擬 GRP16 health helper → 台北直營店 88 / 嘉義 80 / 台南 60 / 高雄 60 / 台中 52，六維俱全。
3. **實際載入**（`scripts/pw-verify-group-pages.mjs`，admin 登入打本機 3000，截圖存 `tmp/group-verify/`）。

### 18 頁實況（截圖佐證）

| 類別 | 頁面 | 修正後狀態 |
|---|---|---|
| ✅ **真 React + 真資料**（已落地，超越或符合設計稿） | GRP07,08,09,10,12,13,14,15,16,17,18,19,20（13 頁）| 渲染真數據；GRP13/14 已是真 CRUD（**已超越設計稿的 alert→Toast 要求**）|
| 🟠 **Stitch 假設計稿**（仍是舊快照、假資料、Ming 新異動未反映） | GRP01,03,05,06 + GRP04（混合：售後人效真實+其餘 Stitch）| 截圖證實：GRP01「庫存數據實時監控/2023-11-15/台北旗艦店(假)」；GRP03 舊版無 Pace 計算器 |
| ➕ **缺頁** | GRP02 BSC（HTTP 404）| repo 無此路由 |

> agent 與真相的差異根因：agent「資料來源」判斷（誰走 loadStitchBody / 誰走 domain helper）**正確**；但對 helper 頁推論「kpi_snapshots 空→未落地」**錯誤**（真庫有資料）。兩邊一對齊即收斂。

### Phase 2 真實工作（大幅縮小，原「全做 A~F」多項已完成/冗餘）

| 原工作包 | 修正後 | 理由 |
|---|---|---|
| A. kpi_snapshots 表+seed | ❌ **不用做** | 已有 918 筆真資料 |
| F. dealer_health_scores / quarterly_snapshots 歷史表 | ❌ **不用做** | kpi_snapshots 已含 health_score + 月度歷史 |
| GRP13 alert→Toast | ❌ **不用做** | 已是真 React CRUD |
| **G1. 升級 GRP01/03/04/05/06 Stitch→React** | ✅ 要做 | 接既有 kpi_snapshots；含 GRP03 Pace 計算器、GRP01/04/06 真下鑽（GRP09/10 目標頁已是真頁）|
| **G2. GRP02 BSC 新建頁** | ✅ 要做 | 接既有 dim_*/kpi_snapshots |
| **G3. GRP20 安全基礎** | ✅ 要做 | `system_settings.org_mode` + 組織層級 RLS（org 表已在）|
| **G4. GRP14→04B 定價同步** | ✅ 要做 | 建 `service_packages`+`labor_rates`+核准 transaction（**跨模組共用**：售後 04B/07B 也要）|

需新建的表（真庫已確認不存在）：`system_settings`、`service_packages`、`labor_rates`。其餘 G1/G2 多為前端升級＋接既有表，DDL 量小。

---

## 五、給 Ming 的拍板點

「完整接 API/DB」整個集團模組 = A~F 全做，工程量大（多個 schema + seed + Stitch→React 升級）。請選範圍：

- **(甲) 試點最小集**：A + B + C（救活 8 報表頁 + 安全基礎 + 定價同步）→ 先讓集團模組「能 demo 真數據」，D/E/F 下輪
- **(乙) 全做**：A~F 一次到位（時間長，多次 schema 簽核）
- **(丙) 你自訂**：勾選想先做的工作包

> 動任何 DDL 前，我會先針對選定工作包出 `schema proposal` 等你簽核（§5 安全邊界 + COA 規則）。
