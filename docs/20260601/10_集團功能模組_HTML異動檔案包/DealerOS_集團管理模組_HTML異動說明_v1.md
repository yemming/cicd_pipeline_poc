# DealerOS 集團管理模組 — HTML 異動說明文件
**版本：v1.0　｜　日期：2026-06-01　｜　Indian Motorcycle Taiwan × DealerOS**

> **給 Partner & AI Agent：**
> 本文件說明集團管理模組（GRP系列）的所有 HTML 異動，共修改 6 支頁面，無新增頁面。
> 整體說明：GRP系列21支頁面設計層次相當完整（D3圖表、BSC計分卡、散佈圖、四象限等均已實作），
> 本次異動聚焦於：下鑽互動邏輯、配速計算工具、審核流程API標示、系統安全基礎說明。

---

## 圖例

| 符號 | 說明 |
|------|------|
| 🔄 **替換** | 以新版本完整替換原有檔案 |
| ➕ **新增插入** | 在現有頁面特定位置插入新功能區塊 |
| 🔗 **後端串接點** | 需 Partner 實作的 API 端點 |
| ⚠️ **上線前必須** | 上線前必須完成，否則影響正常運作 |

---

## 一、修改現有頁面（6支）

---

### 1. `GRP01_集團總覽_v1.html` 🔄 替換

**目錄位置：** `05_集團管理 / 01_集團總覽 / GRP01_集團總覽_v1.html`
**操作類型：** 🔄 完整替換

**修改原因：**
集團總覽是集團主管每日必看的首頁，drillDown（下鑽到門店）只顯示Toast無任何跳轉，主管無法從集團視角快速進入問題門店的詳細診斷頁。

**新增功能：**

#### 1-1. 後端串接說明橫幅（➕插入）
```
插入位置：page header（.ph）之後
說明：所有KPI數字為假資料，串接後呼叫 GET /api/group/summary?period=YYYYMM
```

#### 1-2. 下鑽跳轉改為真實連結（🔄替換drillDown函式）
```
台北旗艦店 / 台中直營店 / 台南授權商 → GRP09_門店銷售Tab_v1.html
高雄直營店 → GRP10_門店售後Tab_v1.html
跳轉前先顯示Toast提示，700ms後跳轉
```
🔗 後端：`GET /api/group/summary?period=YYYYMM`；`GET /api/stores/{id}/summary`

---

### 2. `GRP04_集團儀表板_v1.html` & `GRP06_集團儀表板手機版_v1.html` 🔄 替換

**目錄位置：**
- `05_集團管理 / 01_集團總覽 / GRP04_集團儀表板_v1.html`
- `05_集團管理 / 01_集團總覽 / GRP06_集團儀表板手機版_v1.html`

**操作類型：** 🔄 完整替換

**修改原因：**
GRP04桌機版和GRP06手機版的門店卡片下鑽均為Toast，與GRP01同樣問題。手機版是集團總經理在外出時使用的版本，下鑽功能更為重要。

**新增功能：**

#### 2-1. 門店下鑽跳轉（🔄替換所有下鑽Toast）
```
所有「showToast('下鑽至XX門店')」改為：先Toast提示 → 700ms後跳轉GRP09
```

#### 2-2. API串接說明注解（➕插入）
```
在showToast函式定義前加入：
// GET /api/group/summary → 集團KPI彙總
// GET /api/stores/{id}/summary → 門店下鑽數據
// GET /api/group/alerts → 告警清單
```
🔗 後端：同GRP01

---

### 3. `GRP03_銷售目標監看_v1.html` 🔄 替換

**目錄位置：** `05_集團管理 / 01_集團總覽 / GRP03_銷售目標監看_v1.html`
**操作類型：** 🔄 完整替換

**修改原因：**
GRP03已有「本期已達成進度」欄位，但缺少「Pace配速預測」功能。業界（DealerClick 2026 Report）稱之為「velocity metrics（速度指標）」，比靜態快照更能預測月底達成結果，是店長/集團主管最需要的即時決策工具。

**新增功能：**

#### 3-1. Pace 配速預測計算器（➕插入到頁面標題後）
```
插入位置：page header 之後

功能：
  - 輸入：月目標（台）/ 今日累計達成 / 已過工作天數 / 本月總工作天數
  - 公式：月底預測達成率 = （今日累計 ÷ 已過工作天）× 本月總工作天 ÷ 月目標 × 100%
  - 輸出：月底預測達成率（百分比）+ 顏色區分（綠/橙/紅）
  - 建議文字：
    ≥100%  → ✅ 優秀，維持節奏
    90-99% → 🟡 良好，保持衝勁
    80-89% → ⚠️ 需注意，建議啟動促銷或加強跟進
    <80%   → 🔴 警示，建議集團立即介入
  - 附集團介入標準說明（預測<85%時系統標示需輔導）
```

📌 **行業背景：** Pace配速是汽車/重機業界最常用的即時管理工具，讓店長不需等月底才知道是否達標，可以在月中及時調整策略（加強推廣、電訪跟進、舉辦試乘活動等）。

---

### 4. `GRP13_促銷活動管理_v1.html` 🔄 替換

**目錄位置：** `05_集團管理 / 04_商務管理 / GRP13_促銷活動管理_v1.html`
**操作類型：** 🔄 完整替換

**修改原因：**
`saveActivity()`和`submitActivity()`使用`alert()`，雖然原設計者有標注「Partner接手後寫入資料庫」，但`alert()`在實際操作時阻擋頁面、體驗差，且Partner AI Agent讀取時可能誤認為功能已實作。統一改為標準Toast並加入精確API串接點。

**修改內容：**

#### 4-1. alert()→Toast（🔄替換6處）
```
saveActivity() → showToast('✅ 草稿已儲存\n（後端串接點：POST /api/campaigns，status=draft）')
submitActivity() → showToast + API說明
圖片上傳 → showToast + API說明
LINE推播 → showToast + Phase 1說明（人工複製後台發送）
緊急下架 → showToast + API說明
```

#### 4-2. API串接說明橫幅（➕插入）
```
插入位置：page header 之後
完整說明促銷活動生命週期的所有API端點
```
🔗 後端：`POST /api/campaigns`；`PATCH /api/campaigns/{id}/status`；`GET /api/campaigns`；`POST /api/campaigns/{id}/push-line`（Phase 2）

---

### 5. `GRP14_定價折扣設定_v1.html` 🔄 替換

**目錄位置：** `05_集團管理 / 04_商務管理 / GRP14_定價折扣設定_v1.html`
**操作類型：** 🔄 完整替換

**修改原因：**
同GRP13。`saveDraft()`和`submitReview()`使用`alert()`。此外，定價調整核准後會影響04B快速報價查詢的顯示價格，這個下游影響必須在說明橫幅中明確標注，Partner才知道需要同步更新。

**修改內容：**

#### 5-1. alert()→Toast（🔄替換2處）
```
saveDraft() → showToast + API說明
submitReview() → showToast + API說明 + 主管通知說明
```

#### 5-2. API串接說明橫幅（➕插入）
```
特別標注：定價核准後自動同步至07B服務套餐與費率設定及04B快速報價查詢
必須確保原子性操作（pricing更新→服務套餐同步→04B即時生效）
```
🔗 後端：`POST /api/pricing`；`PATCH /api/pricing/{id}/status`；`GET /api/pricing/audit-logs`

---

### 6. `GRP20_組織架構設定_v1.html` 🔄 替換

**目錄位置：** `05_集團管理 / 05_系統設定 / GRP20_組織架構設定_v1.html`
**操作類型：** 🔄 完整替換

**修改原因：**
`saveNode()`只顯示Toast，但組織架構設定是**整個系統的安全基礎**。org_mode值影響全系統組織樹，角色權限矩陣是Supabase RLS的設定依據。若未串接後端，所有角色管控形同虛設——任何人都能看到其他門店的機密數據。

**修改內容：**

#### 6-1. ⚠️上線前必須完成說明橫幅（➕插入）
```
插入位置：page header 之後
紅色警示橫幅，明確說明：
  1. 組織架構設定必須先完成，才能進行其他任何設定
  2. Supabase RLS必須依角色權限矩陣配置（否則數據安全形同虛設）
  3. 各角色與頁面存取對應關係（集團總經理/通路管理經理/店長/SA）
  4. org_mode值（3=三層/4=四層）影響全系統
```

#### 6-2. saveNode API說明（🔄替換）
```
原：showToast('節點已儲存：'+name)
新：showToast + API說明（POST /api/org-nodes）+ Supabase RLS自動更新說明
```
⚠️ 上線前必須：此頁面未完成串接，所有其他頁面的角色控制均無效
🔗 後端：`POST /api/org-nodes`；`PUT /api/role-permissions`；Supabase：`ALTER POLICY`

---

## 二、新增頁面

**無。** GRP系列21支頁面設計已相當完整，本次不新增頁面。

---

## 三、目錄對應總表

| # | 操作 | 目錄路徑 | HTML 檔名 | 動作說明 |
|---|------|---------|-----------|---------|
| 1 | 🔄 替換 | `05_集團管理/01_集團總覽/` | `GRP01_集團總覽_v1.html` | 下鑽Toast改真實跳轉 + API橫幅 |
| 2 | 🔄 替換 | `05_集團管理/01_集團總覽/` | `GRP04_集團儀表板_v1.html` | 下鑽Toast改真實跳轉 + API注解 |
| 3 | 🔄 替換 | `05_集團管理/01_集團總覽/` | `GRP06_集團儀表板手機版_v1.html` | 下鑽Toast改真實跳轉 + API注解 |
| 4 | 🔄 替換 | `05_集團管理/01_集團總覽/` | `GRP03_銷售目標監看_v1.html` | 新增Pace配速預測計算器 |
| 5 | 🔄 替換 | `05_集團管理/04_商務管理/` | `GRP13_促銷活動管理_v1.html` | alert()→Toast + API串接說明橫幅 |
| 6 | 🔄 替換 | `05_集團管理/04_商務管理/` | `GRP14_定價折扣設定_v1.html` | alert()→Toast + API串接說明橫幅 |
| 7 | 🔄 替換 | `05_集團管理/05_系統設定/` | `GRP20_組織架構設定_v1.html` | saveNode API說明 + ⚠️上線前必須完成橫幅 |

---

## 四、後端 API 優先實作順序

| 優先 | API | 說明 | 關聯頁面 |
|------|-----|------|---------|
| 🔴 | `POST/PUT /api/role-permissions` + Supabase RLS | 角色權限矩陣，系統安全基礎 | GRP20 |
| 🔴 | `POST /api/org-nodes` | 組織架構節點設定 | GRP20 |
| 🟡 | `GET /api/group/summary?period=YYYYMM` | 集團KPI彙總（GRP01/04/06的數據來源） | GRP01/04/06 |
| 🟡 | `GET /api/stores/{id}/summary` | 門店診斷數據（下鑽目標頁） | GRP09/10 |
| 🟡 | `POST /api/campaigns` + status流程 | 促銷活動完整生命週期 | GRP13 |
| 🟡 | `POST /api/pricing` + status流程 | 定價折扣審核流程 | GRP14 |
| 🟢 | `GET /api/group/alerts` | 集團告警清單 | GRP01/04/06 |
| 🟢 | `GET /api/pricing/audit-logs` | 定價稽核日誌 | GRP14 |

---

## 五、GRP系列整體串接說明（給Partner AI Agent）

**資料流架構：**
```
門店層作業頁面 → 後端DB → summary tables（集團彙總快取）→ GRP系列報表
```

**重要提醒：**
1. GRP系列全部21支頁面均為報告/分析儀表板，數據來源為後端API，
   不建議直接查詢原始資料表，應建立summary/cache table提升查詢效能
2. GRP01的集團KPI是跨模組彙總（銷售+售後+庫存+CRM），
   建議建立每日cron job更新summary table
3. D3.js圖表（GRP07/08/11/15/16/17/19）的資料結構已在JS中定義，
   Partner替換資料陣列時請保持相同資料格式

---

*文件版本：v1.0　｜　建立日期：2026-06-01*
*Indian Motorcycle Taiwan × DealerOS　｜　機密文件，請勿外傳*
