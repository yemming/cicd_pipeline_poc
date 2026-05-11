# 提案：售後工單模組 — 流程關係圖（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/00_售後工單模組_流程關係圖.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組目前只在 Ducati nav 樹下，Indian 視業務決定再補）

---

## 0. 頁面定位（最重要）

**這頁不是業務 CRUD 頁、不是 list / detail / setting**。它是整個「售後工單模組」14 支頁面的**導覽圖 / pipeline 視覺化儀表板**：

- 用 6 個橫向 Phase（預約 → SA 預檢 → RO 工單 → 車間管理 → 竣工複檢 → 結帳關單）+ 3 個側功能群（增項閉環 / 人車檔案 / 系統設定）排出流程脈絡
- 每個節點是一張小卡：顯示「節點編號 / 中文名 / 開發狀態（✅ 已完成 / 🔵 待開發 / 🔴 核心關鍵）/ 對應 HTML 檔名」
- 頂部 4 張 KPI scorecard：「已完成頁面 9 支」「待開發頁面 5 支」「剩餘 Sessions 2~3」「與庫存模組串接點 4 個」
- 點節點現階段是 `alert(<檔名>)` placeholder — 將來應該是「跳轉到實際頁面」

**性質歸類**：landing page / module overview / progress dashboard — 介於「文件型導覽」與「迷你 KPI 儀表板」之間。**不該用標準 List View / Page View 範本**，也**不需要建新 DB 表**。

**在 5 階段 SOP 的位置**：這是個典型「Phase 1 分析後就該打住、不要硬塞 design pattern」的案例。提出來給用戶拍板要不要做、做成哪種形式，比直接落地更重要。

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

這頁本身沒有自己的 entity（沒有 CRUD 寫入）。它「引用」的是其他頁面已經存在 / 將要存在的實體：

- `work_orders / repair_orders (RO)` — Phase 3、Phase 6 引用
- `appointments` — Phase 1 引用
- `pre_inspections` — Phase 2 引用（5 個 tab）
- `service_bay_assignments / technician_clock` — Phase 4 引用
- `final_inspections` — Phase 5 引用
- `payments / invoices` — Phase 6 引用
- `incremental_followups (增項閉環)` — 側功能群引用
- `customers / vehicles` — 人車檔案引用
- `employees / work_order_prefix_rules / customer_tag_supervisor_rules` — 系統設定引用

⚠️ 上述全部 entity **不屬於本頁負責落地** — 它們屬於各自對應的 14 支兄弟頁面。本頁只「展示」這些頁面的存在與關係。

### actions

唯一互動：

- `navigate(node) → 對應 detail / list 頁面` — 目前是 `alert(filename)`，未來應為 `router.push(href)`
- `clickHeaderButton('導覽總覽') → /parts/aftersales` 或上一層 — 目前是 alert

**沒有寫入動作、沒有 DB 副作用**。

### kpis

頁面頂部 4 張 scorecard（**目前是寫死的數字**，不是動態計算）：

| KPI | 目前值 | 應該怎麼算（如果要動態化） |
|---|---|---|
| 已完成頁面 | 9 支 | `count(nav_nodes WHERE page_kind='react_route' AND parent under 售後工單)` |
| 待開發頁面 | 5 支 | `count(nav_nodes WHERE page_kind='static_html' AND parent under 售後工單)` |
| 剩餘 Sessions | 2~3 | **不可動態化**（這是 PM 估算，非 DB 值），改成「規劃中 sprint 數」 |
| 與庫存模組串接點 | 4 個 | hardcode 或從 module registry 算（短期 hardcode 即可） |

**結論**：4 張卡裡 3 張可從 `nav_nodes` 動態算、1 張保留 hardcode。Phase 2 提案時要決定要不要動態化（取決於使用者期望這頁是「靜態 README 圖」還是「真的 dashboard」）。

### implied_schema

**不需要新表**。所有展示資料都能從現有 `nav_nodes` 推出：

- `nav_nodes.name` → 節點顯示名
- `nav_nodes.page_kind` → 推導開發狀態（`react_route` = ✅ / `static_html` = 🔵 / `placeholder` = 灰）
- `nav_nodes.href` → 點擊跳轉
- `nav_nodes.parent_id` → 推導 Phase 分群
- `nav_nodes.sort_order` → Phase 內排序

「核心關鍵 🔴」/「跨頁共用 🟣」這類視覺標籤目前不在 `nav_nodes` schema 裡 — 如果要忠實還原，可以：
- 方案 A：靜態 HTML 直接 inline 渲染（最便宜，這頁本來就是 docs）
- 方案 B：給 `nav_nodes` 加 `metadata.flow_diagram_tag: 'core' | 'cross_page' | 'sub_flow'`（污染主 schema，不推薦）
- 方案 C：用 `business_rules` 存「售後流程圖節點 metadata」（殺雞用牛刀）

**推薦：方案 A**（保持靜態，避免為了一個 landing page 把核心 nav schema 拉複雜化）。

### implied_pages

| 候選路由 | 類型 | 適不適合 |
|---|---|---|
| `/parts/aftersales` | landing page（模組首頁，列出 6 個 Phase + 進度條） | ✅ **推薦** |
| `/parts/aftersales/overview` | 同上的子路徑 | 可接受 |
| `/parts/aftersales/flow-diagram` | 專門展示這張流程圖 | 過度設計（無人會專門打開） |
| 列表頁 list view | — | ❌ 不適用（沒 CRUD） |
| 詳情頁 page view | — | ❌ 不適用（無單一 entity） |

**建議路由**：`/parts/aftersales`（模組 root），點 nav rail 上的「售後工單」icon 就進來。

---

## 2. 這頁與兄弟頁面的關係（pipeline view）

```
┌─ 預約進廠 ─────────────────┐
│  01_預約管理看板             │  上游
└────────────────┬────────────┘
                 ↓
┌─ SA 預檢（5 tab 同一頁）─────────────────────────────┐
│  04_預檢單_RO串接_v3 / 04_預檢單_SA環檢_v3            │  上游
└──────────────────────────────┬───────────────────────┘
                               ↓
┌─ RO 工單 ─────────────────────────────────┐
│  02_正式工單RO + 03_維修項目零件明細       │  ⭐ 模組核心
│  10_工單查詢                                │
└──────────────────────────────┬─────────────┘
                               ↓
┌─ 車間管理 ──────────────────────────┐
│  07_售後管理模組_v2（工位 + 派工 + 打卡 + 交棒）│
│  04_追加項目記錄                      │  ←─ 觸發 05 增項閉環
└──────────────────────────────┬───────┘
                               ↓
┌─ 竣工複檢 ─────────────┐
│  06_竣工複檢_v1          │
│  11_取車通知設定          │
└──────────────────────┬──┘
                       ↓
┌─ 結帳關單 ──────────────┐
│  08_結帳收款             │  下游終點
└──────────────────────────┘

側功能（跨多階段共用）：
  05_增項閉環_完整子模組 ── 接 SA 預檢的「拒絕/暫緩項目」+ Phase 4 的「追加項目」
  09_人車檔案           ── 全程都會被讀（每個 RO 都關聯 customer + vehicle）
  12_客戶標籤主管設定    ── 餵 Phase 2 Tab2 的「客戶標籤」下拉
```

**本頁在 pipeline 中的位置**：**整個 pipeline 之上**（meta layer）。它是模組的「目錄 / 進度儀表板」，不是 pipeline 中的某個業務節點。

**最近的兄弟**：`00_售後工單模組_導覽總覽.html`（同樣是 00_ 開頭的 meta 頁，多半也是 landing 性質）。Phase 2 提案時應該把兩支 00_ 頁一起考慮，可能合併成同一個 `/parts/aftersales` landing。

---

## 3. 建議落地型態（給用戶 Phase 2 拍板用）

| 方案 | 描述 | 適合場景 |
|---|---|---|
| **A. 純靜態 inline HTML** | 沿用既有 Stitch Inline 模式（`public/stitch/...body.html` + `dangerouslySetInnerHTML`）。零互動、零 DB。 | 用戶就想要這張「PM 視覺化進度圖」掛在那裡看，半年改一次 |
| **B. 半動態 landing page** | 寫成 React server component，4 張 KPI 卡從 `nav_nodes` 算、節點清單從 `nav_nodes` 動態渲染、視覺化分組（Phase）的對應關係 hardcode 在 page.tsx 裡 | 推薦。隨 nav 樹長大自動同步進度、不用 PM 每次改 HTML |
| **C. 完整 dashboard** | 加 module progress 追蹤表、串實際 RO 統計（本月 RO 數、平均工時）做成真儀表板 | 過度設計、跟 `08_結帳收款` / `07_售後管理模組` 既有看板職責重疊 |

**Phase 1 推薦傾向 B**：成本低、與 SSOT（`nav_nodes`）對齊、避免靜態 HTML 與實際狀態漂移（已開發但圖上還顯示 🔵）。但**最終要 Phase 2 提案 + Phase 3 用戶拍板才能定**。

---

## 4. 已避開的陷阱（紀律檢查）

- ✅ **沒新增 DB 表**（這頁不需要、純展示）
- ✅ **沒走 `business_rules`**（這不是規則設定頁）
- ✅ **沒套標準 List View 範本**（這頁沒有 CRUD，硬套會變形）
- ✅ **沒當作獨立 entity 處理**（它是 module landing，引用其他頁面）
- ✅ **沒 commit、沒動 nav_nodes、沒動 DB**（依任務指示停在 Phase 1）

---

## 5. Phase 2 應該問用戶的問題（給下一階段預留）

> ⚠️ 本任務不執行 Phase 2，僅列出供下次 session 使用。

1. **方案選擇**：A（純靜態 HTML）/ B（半動態 server component）/ C（完整 dashboard）？推薦 B。
2. **路由命名**：`/parts/aftersales`（模組 root）還是 `/parts/aftersales/overview`？
3. **要不要與 `00_售後工單模組_導覽總覽.html` 合併？**（兩支 00_ 頁很可能職責重疊）
4. **雙 brand 處理**：Indian 要不要也做這頁？目前售後工單模組只在 Ducati nav 樹（依 memory「WMS 範圍 — Ducati 不做」反推；售後則反過來，Indian 可能也不需要）。
5. **KPI 動態化邊界**：「剩餘 Sessions」這種 PM 估算值要不要拿掉、或改成「規劃中頁面數」？

---

## 6. 結論

本頁是售後工單模組的**導覽圖 / 進度 dashboard**，不是業務 CRUD 頁面。Phase 1 分析結果：

- **不需新增 DB 表**、**不適合套標準 List/Page View design pattern**
- 建議落地為 `/parts/aftersales` 的 **landing page / module home**
- 推薦方案 B（半動態 server component 從 `nav_nodes` 算進度）— 但**等用戶 Phase 3 拍板**才動工
- Phase 1 到此打住，等用戶決定要不要進 Phase 2 寫完整提案
