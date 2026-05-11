# 提案：售後工單模組 — 導覽總覽（Phase 1 結構分析）

> 來源：`docs/DUCATI_售後工單模組_完整且含串接庫存版_20260510_最新版/00_售後工單模組_導覽總覽.html`
> 日期：2026-05-11
> 階段：Phase 1（結構分析）— **僅做結構分析，不進 Phase 2-5**
> 適用 brand：Ducati（本模組目前只在 Ducati nav 樹下，Indian 視業務決定再補）
> 姊妹頁：`docs/proposals/feature-aftersales-flow-diagram-phase1.md`（00_流程關係圖）

---

## 0. 頁面定位（最重要）

**這頁不是業務 CRUD 頁、不是 list / detail / setting**。它是售後工單模組的**「模組首頁 / 章節 README + 進度儀表板」**，跟姊妹頁 `00_流程關係圖` 是同一類東西（meta landing），但**呈現重點不同**：

| 維度 | 00_導覽總覽（本頁） | 00_流程關係圖（姊妹頁） |
|---|---|---|
| 主視覺 | **9 張功能群組卡（scard grid 3×N）** 強調「按職能分組」 | **6 個 Phase 橫向 step boxes** 強調「按流程順序」 |
| Hero 區 | 漸層 banner + 4 張 KPI（9 / 5 / 14 / 2~3） | 模組標題 + 4 張類似 KPI |
| 端對端流程 | 有，但只佔上半部（簡化版 step 圖） | 有，**這是它的主體** |
| 章節卡 | **主體**（預約進廠 / SA 預檢 / RO / 車間 / 竣工 / 結帳 / 增項 / 人車 / 設定 9 群） | 簡化版側邊功能群（3 群） |
| Session 計畫卡 | **獨有**（Day 2 / Day 3 / Day 4 sprint 安排） | 無 |
| 待開發頁面清單 | **獨有**（5 支獨立 list） | 無 |

**核心差異**：流程關係圖在賣「流程脈絡」、導覽總覽在賣「模組目錄 + sprint 進度」。**內容 70% 重疊、20% 互補、10% 完全相同（KPI scorecard）**。

**性質歸類**：landing page / module home / sprint progress dashboard。**不該套標準 List View / Page View 範本**、**不需要新 DB 表**。

---

## 1. 結構分析（記憶體結構，照 SKILL §階段 1 第 4 步格式）

### entities

本頁**沒有自己的 entity**（沒有 CRUD 寫入、沒有資料形狀）。所有顯示資料都「引用」14 支兄弟頁面負責的實體：

- `appointments`（預約管理 — 01）
- `pre_inspections / pre_inspection_tabs`（SA 預檢五關 — 04 v3，5 個 Tab）
- `customer_tags`（來意詢問 + 客戶標籤 — Tab2，餵自 12）
- `repair_orders (RO) / repair_order_items / parts_lines`（RO 主檔 + 維修項目 — 02 / 03）
- `incremental_followups`（增項閉環 D+3/D+10 追蹤 — 05）
- `service_bay_assignments / technician_clock / handover_records`（車間管理 — 07 v2）
- `addon_records`（追加項目記錄 — 04 追加項目）
- `final_inspections`（竣工複檢五步驟簽核 — 06）
- `payments / invoices / ro_closures`（結帳收款 + RO 關單 — 08，待開發）
- `customers / vehicles / warranty_status`（人車檔案 — 09，待開發）
- `work_order_queries`（工單查詢 — 10，待開發）
- `pickup_notification_settings`（取車通知設定 — 11，待開發）
- `customer_tag_supervisor_rules`（客戶標籤主管設定 — 12，待開發）
- `employees / work_order_prefix_rules / position_discount_rules`（系統設定 — 已 v2 完成）

⚠️ **這些 entity 都不歸本頁落地**，它們是 14 支兄弟頁的責任。本頁只「展示這些頁面的存在 + 進度狀態 + sprint 安排」。

### actions

唯一互動：

- `clickHeaderButton('功能流程關係圖 →') → /parts/aftersales/flow-diagram` 或 anchor 跳轉 — 目前是 `alert('功能流程關係圖')`
- 各章節卡的 sitem 列：目前是純展示、沒有 onclick；**潛在升級**：點 sitem → `router.push(對應頁面 href)`
- 「待開發頁面 5 支」列：目前是純展示；**潛在升級**：點檔名 → 跳到該頁的 placeholder

**沒有寫入動作、沒有 server action、沒有 DB 副作用**。

### kpis

頁面頂部 4 張 hero scorecard（**目前是寫死的數字**）：

| KPI | 目前值 | 應該怎麼算（如果要動態化） |
|---|---|---|
| 已完成頁面 | 9 支 | `count(nav_nodes WHERE parent_id 在售後工單樹下 AND page_kind='react_route')` |
| 待開發頁面 | 5 支 | `count(nav_nodes WHERE parent_id 在售後工單樹下 AND page_kind IN ('static_html','placeholder'))` |
| 模組總頁面 | 14 支 | `count(nav_nodes WHERE parent_id 在售後工單樹下)` |
| 剩餘 Sessions | 2~3 | **不可動態化**（PM 估算值，非 DB 值）— 改成「規劃 sprint 數」hardcode |

另有 9 張章節卡內每個 sitem 末尾的 badge（✅ / Day 2 / Day 3 / ✅ v2 / ✅ v3 / Day 2 ⭐ 等）：

- 目前 badge 文案 hardcode 在 HTML 裡
- 動態化做法：在 `nav_nodes.metadata` 加 `dev_status: 'done' | 'in_progress' | 'planned'` + `sprint_label: 'Day 2'` 兩個 key（**這是少數可考慮污染 jsonb 的合理場景**，因為 dev status 跟 sprint label 本質是專案管理 metadata，不污染業務語義）

**結論**：4 張 hero KPI 裡 3 張可從 `nav_nodes` 動態算、1 張保留 hardcode。9 張章節卡的 badge 若要動態化，需在 `nav_nodes.metadata` 加兩個 jsonb key。Phase 2 提案時要決定要不要動態化。

### implied_schema

**不需要新表**。可能的 metadata 擴充（**全部選用**，Phase 3 用戶拍板）：

```sql
-- 選用 A：給 nav_nodes 加 sprint metadata（最便宜的動態化）
-- 不改 schema，只在 INSERT/UPDATE 時往 metadata jsonb 塞兩個 key
UPDATE nav_nodes
   SET metadata = metadata || jsonb_build_object(
     'dev_status', 'done',      -- 'done' | 'in_progress' | 'planned' | 'core_critical'
     'sprint_label', 'Day 2',   -- 'Day 2' | 'Day 3' | 'Day 4' 自由文字
     'is_cross_page', false     -- 跨頁共用（紫色 🟣）
   )
 WHERE id IN (...);
```

- 形狀穩、用 jsonb 而不是 typed column → 因為這是「PM / 內部進度追蹤」metadata，不會被 RLS / FK / 報表用
- 升級到 typed 的條件：如果 dev_status 變成跨多模組共用的 SSOT（如「全站開發進度儀表板」） → 那時 promote 一條 ALTER TABLE

### implied_pages

| 候選路由 | 類型 | 適不適合 |
|---|---|---|
| `/parts/aftersales` | landing page（模組首頁，9 章節卡 + 進度條 + sprint 計畫） | ✅ **最推薦**（模組 root，rail 點 icon 進來） |
| `/parts/aftersales/overview` | 同上的子路徑 | 可接受（但跟 `/parts/aftersales` 重複） |
| `/parts/aftersales/flow-diagram` | 流程關係圖獨立路徑 | 若選**不合併**，這頁專屬路徑 |
| 列表頁 list view | — | ❌ 不適用（沒 CRUD） |
| 詳情頁 page view | — | ❌ 不適用（無單一 entity） |

---

## 2. 與姊妹頁 `00_流程關係圖` 的關係（**核心建議**）

兩支 00_ 開頭的 meta 頁**內容嚴重重疊**：

| 重疊區塊 | 在本頁 | 在流程關係圖 |
|---|---|---|
| Hero KPI 4 張 | ✅ 9 / 5 / 14 / 2~3 | ✅ 9 / 5 / 2~3 / 4（庫存串接） |
| 端對端流程 step 圖 | ✅（簡化版） | ✅（**主體**，更詳細） |
| 章節分群 | ✅（9 群 scard） | ✅（3 群側邊功能） |
| sprint 計畫 | ✅（Day 2 / 3 / 4） | ❌ |
| 待開發頁面 5 支獨立 list | ✅ | ❌ |

### 合併建議（強烈推薦）

**Phase 2 拍板選項 A：合併成一支 `/parts/aftersales` landing page**，內容融合：

```
/parts/aftersales （模組首頁）
├─ Hero：模組標題 + 4 張 KPI（從 nav_nodes 動態算 3 張 + 1 張 hardcode）
├─ Section 1: 端對端流程圖（採流程關係圖那版較完整的 6 Phase + 支線 + 步驟編號）
├─ Section 2: 9 張功能群組卡（採本頁的 3×N grid + sitem badge）
└─ Section 3（可選）: sprint 計畫卡（Day 2 / 3 / 4）
```

理由：
1. 兩頁服務的對象相同（PM / 開發者 / 主管 want overview）
2. 14 支頁面的模組首頁不該有兩個入口（會混淆）
3. 維護成本：合併後只改一個地方、不會出現「導覽總覽顯示 5 支待開發、流程關係圖顯示 4 支待開發」這種漂移

### 不合併（弱推薦）

**Phase 2 拍板選項 B：兩頁各自獨立**

- `/parts/aftersales` → 本頁（章節導覽 + sprint dashboard，**面向 PM/開發者**）
- `/parts/aftersales/flow-diagram` → 流程關係圖（**面向業務 / 訓練新員工**）
- header 互跳按鈕（HTML 已有 `功能流程關係圖 →` button）

理由：
1. 訓練教材場景：新進 SA / 技師看流程關係圖了解業務串接
2. PM dashboard 場景：本頁的 sprint 計畫 + 章節進度
3. 兩個觀眾群不同 → 分頁不衝突

### Phase 1 結論

**建議走選項 A（合併）**，但**最終由 Phase 3 用戶拍板**。合併方案的核心理由：避免 nav_nodes SSOT 漂移、降低維護成本、單一入口。

---

## 3. 建議落地型態（給用戶 Phase 2 拍板用）

承接姊妹頁 Phase 1 結論的方案 A/B/C 框架：

| 方案 | 描述 | 適合場景 |
|---|---|---|
| **A. 純靜態 inline HTML** | 沿用既有 Stitch Inline 模式（`public/stitch/<id>.body.html` + `dangerouslySetInnerHTML`）。零互動、零 DB。 | 用戶就想要這張「PM 視覺化進度圖」掛在那裡看，半年改一次 |
| **B. 半動態 landing page**（推薦） | 寫成 React server component。Hero KPI 3 張從 `nav_nodes` 算；9 章節卡的 sitem badge 從 `nav_nodes.metadata.dev_status` 算；流程圖 hardcode 在 page.tsx 裡（流程不會頻繁變）。 | 推薦。隨 nav 樹長大自動同步進度、不用 PM 每次改 HTML |
| **C. 完整 dashboard** | 加 module progress 追蹤表、串實際 RO 統計（本月 RO 數、平均工時、待結帳張數）做成真儀表板 | 過度設計、跟 `08_結帳收款` / `07_售後管理模組` 既有看板職責重疊 |

**Phase 1 推薦傾向 B + 合併**：成本低、跟 SSOT（`nav_nodes`）對齊、避免靜態 HTML 與實際狀態漂移（已開發但圖上還顯示 🔵）。但**最終要 Phase 2 提案 + Phase 3 用戶拍板才能定**。

### 落地型態的雙 brand 考量

- 售後工單模組目前**只在 Ducati nav 樹**（依 memory「WMS 範圍 — Ducati 不做」反推；售後可能是 Ducati 獨有）
- 若 Indian 將來也要做售後 → 整個模組複製、本頁的「模組首頁」會跟著複製
- 本頁建議**不寫死 `brand_id='ducati'`**，從 RLS / session 取（user 看哪個 brand 就顯示哪個 brand 的 nav_nodes 進度）

---

## 4. 已避開的陷阱（紀律檢查）

- ✅ **沒新增 DB 表**（這頁不需要、純展示）
- ✅ **沒走 `business_rules`**（這不是規則設定頁）
- ✅ **沒套標準 List View 範本**（這頁沒有 CRUD，硬套會變形）
- ✅ **沒當作獨立 entity 處理**（它是 module landing，引用其他頁面）
- ✅ **沒走 RBAC**（這不是 boolean 權限頁、不是設定頁）
- ✅ **沒 commit、沒動 nav_nodes、沒動 DB**（依任務指示停在 Phase 1）
- ✅ **意識到雙 brand**（建議 brand_id 從 session 取、不寫死）

---

## 5. Phase 2 應該問用戶的問題（給下一階段預留）

> ⚠️ 本任務不執行 Phase 2，僅列出供下次 session 使用。

1. **合併 or 不合併**：本頁（導覽總覽）與姊妹頁（流程關係圖）合併成一支 `/parts/aftersales`？還是各自獨立？**推薦合併**。
2. **落地型態**：A（純靜態 HTML）/ B（半動態 server component）/ C（完整 dashboard）？**推薦 B**。
3. **KPI 動態化邊界**：
   - 「已完成 / 待開發 / 模組總頁面」3 張：從 `nav_nodes` 動態算？✅ 推薦
   - 「剩餘 Sessions」這種 PM 估算值要不要拿掉、改成「規劃中頁面數」？
4. **章節卡 sitem badge 動態化**：要不要在 `nav_nodes.metadata` 加 `dev_status` + `sprint_label` 兩個 key？還是 hardcode 在 page.tsx 即可？
5. **路由命名**：`/parts/aftersales`（模組 root）還是 `/parts/aftersales/overview`？
6. **雙 brand 範圍**：Indian 要不要也做售後工單模組？目前只在 Ducati。

---

## 6. 結論

本頁是售後工單模組的**模組首頁 / 章節 README + sprint 進度 dashboard**，與姊妹頁 `00_流程關係圖` **內容 70% 重疊**。Phase 1 分析結果：

- **不需新增 DB 表**、**不適合套標準 List/Page View design pattern**
- **強烈建議與姊妹頁合併**成單一 `/parts/aftersales` landing page
- 推薦方案 B（半動態 server component 從 `nav_nodes` 算進度）
- 短期可考慮在 `nav_nodes.metadata` 加 `dev_status` + `sprint_label` 兩個 key 做章節 badge 動態化
- Phase 1 到此打住，等用戶決定要不要進 Phase 2 寫完整提案
