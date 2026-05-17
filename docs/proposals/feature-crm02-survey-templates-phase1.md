# CRM02 — 銷售電訪問卷設定（卡片化 + 同頁編輯器）Phase 1 提案

> 規格：`docs/DUCATI_v2_output/02_客服管理/01_銷售CRM/CRM02A_銷售電訪問卷設定_v1.html`
> 現行：`src/app/(workspace)/crm/sales/survey-templates/_components/survey-templates-board.tsx`（DataGrid + Detail Page）
> 階段：**Phase 1（僅提案、不落地、不寫 code）**
> 日期：2026-05-16
> 對應 BDN 第三輪卡片：CRM02

---

## 1. Spec 實際內容（逐 section）

### 1.1 Header（深藍 52px sticky）

- 左：`DUCATI` logo + 模組麵包屑「客服管理 › **CRM02A 銷售電訪問卷設定**」+ `v1` ver-badge
- 右：3 顆 hbtn —「← CRM 總覽」「電訪工作台 →」「**＋ 新增問卷（hbtn-primary）**」
- 共用 shell 已提供，CRM02 不重做 header；右側 3 顆改放在 `useSetPageHeader` 的 actions 或頁面 Toolbar。

### 1.2 Sidenav（220px 白底，左欄）

**Spec 是一個獨立的左側 panel，但本專案 shell 已有 PagesPanel（240px）**。Stitch 上這個 220px sidenav 是頁面內快篩、不是模組導覽 — 對應 §Workspace Shell Architecture 的「Stitch sidebar 不照抄」原則，需要重新定位（見 §4.3）。

三段內容：

| 區段 | 項目（spec 寫死的範例） | 點擊行為 |
|------|-----------------------|---------|
| 問卷管理 | 全部問卷 (3) ・ 啟用中 (1) ・ 草稿 (1) ・ 已封存 (1) | 切換右側列表 filter |
| 適用時機 | 到店後追蹤 ・ 成交後回訪 ・ 未成交分析 ・ 休眠激活 | 切換右側列表 filter（單選） |
| 快速工具 | 電訪工作台 (CRM03A) ・ 休眠戰敗管理 (CRM04A) | 跳頁 |

每個 item 含 `nav-dot` 顏色 + 文字 + `nav-count` chip（純計數）。active 態 `bg #EAF4FB` `text #185FA5` 粗體。

### 1.3 Main — 問卷清單 Panel（卡片化）

```
panel-hdr：📋 電訪問卷清單 / 副標「問卷版本控制 · 啟用中的版本自動套用至 CRM03A 電訪工作台」
         右側 b-teal chip「啟用中版本套用至 CRM03A」
panel-body：survey-list（flex column gap 8px）
```

**每張 survey-card**：

| 區塊 | 內容 |
|------|------|
| sc-icon (20px) | emoji 圖示：啟用 `📋`、草稿 `✏️`、封存 `📦` |
| sc-info | `sc-name`（13px bold）+ `sc-meta`（三行 11.5px 灰）：「適用：xxx」「題數：N 題」「上次修改：YYYY-MM-DD」 |
| sc-actions | 狀態 badge + 操作按鈕 2~3 顆 |

**狀態色票**：
- 啟用中 (`active-ver`)：border `#0F6E56` + bg `#F5FDF9` + badge `b-teal ✅ 啟用中`
- 草稿 (`draft`)：border `#F0C97E` + bg `#FFFAF0` + badge `b-amber 草稿`
- 封存：opacity 0.7 + badge `b-gray 已封存`，唯讀

**按鈕**：
- 啟用中：[編輯題目 scb-blue]、[版本記錄 scb-gray]
- 草稿：[編輯題目 scb-blue]、[設為啟用 scb-teal]
- 封存：[查看 scb-gray]（read-only）

點卡片本體 → `openSurveyEditor(id)` 展開下方 §1.4 編輯器 panel；點 sc-btn 用 `event.stopPropagation()` 走專屬動作。

### 1.4 Main — 問卷題目編輯器 Panel（同頁展開）

預設 `display:none`，點某張卡片才 `display:block` 並 `scrollIntoView`。

```
panel-hdr：✏️ {editor-title 動態替換} / 副標「拖曳調整題序 · 點擊題目編輯內容」
         右側 3 顆 btn-sm：[收起 btn-ghost] [＋ 新增題目 btn-ghost] [💾 儲存問卷 btn-primary]
panel-body：
  ┌── 問卷設定列（two-col 2 欄）
  │   - 問卷名稱 input
  │   - 適用時機 select（4 個固定選項）
  ├── 適用 HABC 對象（target-grid 3×2，可多選 chip）
  │   - 🔴 H 熱潛客 / 🟡 A 積極跟進 / 🔵 B 培養中 / ⬜ C 長期維護 / ❌ 未成交 / 💤 休眠客戶
  ├── divider
  └── question-list（拖曳排序 + inline 編輯 + 刪除）
      - 每題 ⠿ drag handle ・ Q1/Q2... 序號 ・ 題目文字 + `*` ・ q-type-badge ・ q-options chip 列 ・ [✎ 編輯] [✕ 刪除]
      - 題型：單選 (qt-single 藍) ・ 複選 (qt-multi 紫) ・ 評分 1–10 (qt-scale 綠) ・ 開放式文字 (qt-text 琥珀)
```

**目前 spec 沒做的事**（明顯空缺）：
- 點「✎ 編輯」spec 只 toast 提示「Modal 展開」— 等於只有空殼，沒有題目編輯 Modal 的設計
- HABC chip 多選的儲存欄位、適用時機 select 的 value 對映 — spec 全部 hard-code 4 個字串

### 1.5 Main — 新增問卷 Modal

| 欄位 | 元件 | 必填 |
|------|------|------|
| 問卷名稱 | text input | ✓ |
| 適用時機 | select（4 個固定選項） | — |
| 建立方式 | radio：「從空白建立」/「複製現有問卷」 | — |

按 ✅ 建立 → `closeModal` + toast。spec 沒處理「複製現有問卷」要選哪一份的 dropdown。

### 1.6 Main — 新增題目 Modal（modal-lg 640px）

| 區塊 | 內容 |
|------|------|
| 題型選擇 | type-grid 2×2，4 張 type-card：單選 / 複選 / 評分 1–10 / 開放式文字（單選） |
| 題目內容 | textarea，必填 |
| 選項設定 | options-list：每行 input + ✕；底下「＋ 新增選項」。**評分 / 文字題自動隱藏這段** |
| 必填 | checkbox「此題為必填」，預設勾 |

### 1.7 Main — 版本記錄 Modal

ver-list 純展示：每行 `v3` (DM Mono) + 日期 + 變更說明 + 右側狀態 badge（啟用中 / 封存）。

**spec 沒做**：rollback 按鈕、版本對 diff、snapshot 詳情。

---

## 2. 資料缺口 audit

### 2.1 現有 `survey_templates` 欄位（已驗證）

```
id uuid PK
brand_id text NOT NULL
kind text NOT NULL              -- 'sales' | 'aftersales'（check constraint）
code text NOT NULL              -- (brand_id, kind, code) UNIQUE
name text NOT NULL
description text
target_segment text              -- 單一字串（目前 free text）
questions jsonb NOT NULL DEFAULT '[]'::jsonb
effective_from date
effective_to date
is_active boolean NOT NULL DEFAULT true
metadata jsonb NOT NULL DEFAULT '{}'::jsonb   -- ✅ 已備
created_by uuid
created_at / updated_at timestamptz
```

DB 沒有任何相關的 `survey_versions` / `audit_log` / `survey_drafts` 表（已 `list_tables` 確認）。

### 2.2 Spec 需要 vs 現有

| Spec 概念 | 現有對映 | 處置 |
|----------|---------|------|
| 問卷 icon (📋 / ✏️ / 📦) | **完全缺** | 預設用 `is_active` + version status 推導 emoji，不入 DB；客製化 icon 進 `metadata.icon` |
| 適用時機（4 個固定選項） | `target_segment` 是 free text、語意不對 | **新增** `metadata.timing` 存固定 enum value（`arrive_followup` / `closed_followup` / `lost_analysis` / `dormant_reactivate`），舊 `target_segment` 不動仍可 free text 顯示 |
| HABC 多選對象 | `target_segment` 是 single text | **新增** `metadata.target_habc: string[]` (`['H','A','B','C','LOST','DORMANT']`)；保留 `target_segment` 當人話副標 |
| 狀態：啟用 / 草稿 / 封存 | 只有 `is_active boolean` | **不夠**：需要三態。建議新增 typed column `status text` (`active` / `draft` / `archived`)，並把 `is_active` 改成 `status='active'` 的派生概念（保留欄位向後相容；新表新查詢一律以 `status` 為主） |
| 版本記錄（v1/v2/v3 + 變更說明 + rollback 候選） | **完全缺** | 新建 `survey_template_versions` 表，每次發佈/儲存切版本（見 §3.2） |
| 上次修改日期 | `updated_at` | ✅ 已有 |
| 題目拖曳排序 | `questions` jsonb 陣列順序 | ✅ 直接用陣列順序、不另外存 sort_order |
| 題目題型（single / multi / rating / text） | 已有：`SurveyQuestion.type` (`'single' \| 'multi' \| 'rating' \| 'text'`) | ⚠️ spec 用 `scale`，現行用 `rating` — 對映時統一用現行 `rating`（不改 schema） |
| 啟用中版本套用至 CRM03A | `call_tasks.survey_template_id` FK → `survey_templates.id` | ⚠️ **FK 約束**：版本化策略不能拆 row，否則 call_tasks 引用會斷。見 §3.2 |

### 2.3 既有 FK 引用（要保留）

```
call_tasks.survey_template_id     → survey_templates.id   (CRM03A 電訪工作台)
nps_responses.survey_template_id  → survey_templates.id   (NPS 看板)
```

---

## 3. 預設架構策略

### 3.1 typed core + metadata jsonb 分配

按 §資料存取架構（POC 階段慣例）— 變動中 / 單頁專用 → jsonb；報表 / RLS / 會升級 → typed column。

**新增 typed column（建議）**：

```sql
ALTER TABLE survey_templates
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','archived')),
  ADD COLUMN current_version_no integer NOT NULL DEFAULT 1;
```

**進 `metadata` jsonb（變動中）**：

```jsonc
{
  "icon": "📋",                                    // 卡片 icon（可選，否則依 status 推導）
  "timing": "arrive_followup",                     // enum, 對應 §1.4 sidenav 適用時機快篩
  "target_habc": ["H","A","B"],                    // 多選 HABC
  "copied_from": "<survey_id>"                     // 「複製現有問卷」溯源（可選）
}
```

**為什麼這樣切**：
- `status` 形狀穩、會被列表 filter / sidenav count / 報表用 → typed
- `timing` 是 enum 但 spec 只列 4 個、實際業務還會調 → 先放 metadata；用滿三頁再 promote 成 typed column（依架構文 §升降級規則）
- `target_habc` 是陣列 + 業務還在收斂 → metadata
- `icon` 純顯示 → metadata
- `current_version_no` 跟版本表互鎖（不存 typed 就要 N+1 query 取最新版號）→ typed

### 3.2 版本記錄表（建議新增）

```sql
CREATE TABLE survey_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES survey_templates(id) ON DELETE CASCADE,
  version_no integer NOT NULL,                    -- v1, v2, v3 ...
  change_note text,                                -- 「新增「意向強度」評分題，調整選項順序」
  snapshot jsonb NOT NULL,                         -- full snapshot of {name, description, target_segment, questions, metadata}
  is_published boolean NOT NULL DEFAULT false,     -- 是否為「已發佈」版本（草稿存檔 = false）
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_no)
);

CREATE INDEX survey_template_versions_template_idx
  ON survey_template_versions (template_id, version_no DESC);
```

**版本化規則**（待 Ming 拍板，見 Q3）：

- **方案 A（snapshot-only，建議）**：`survey_templates` 永遠是當前最新版（call_tasks 引用穩定）；`survey_template_versions` 純做歷史快照 + 變更說明。Rollback = 把選定的 snapshot 寫回 `survey_templates`，並產生新版本號（不允許「跳回 v2 用」這種需求，避免 FK 引用拿到舊內容）。
- **方案 B（immutable versions + 啟用指標）**：每版獨立 row、`survey_templates` 多一個 `published_version_id` 指向當前啟用版；call_tasks FK 改指 `survey_template_versions.id`（重大遷移）。POC 不建議。

> **預設走方案 A**，因為 call_tasks 已經有 FK 過去、改 FK 風險高、業務上「歷史填答」其實是看 `call_tasks.answers` 而不是 template 本身。

**何時切版**：
- 「儲存問卷」按鈕 → 寫入 `survey_templates` + 新增 `versions` row (`is_published=true`, `version_no = current + 1`)，並更新 `current_version_no`
- 「儲存草稿」（如未來加）→ `is_published=false`、不動 `current_version_no`

### 3.3 業務規則 → 全走 `business_rules`？

**不適用**。版本記錄是資料的時序維度、不是業務規則（架構文 §三件套 §3 講的 `business_rules` 是採購權限 / 盤點規則 / ABC 分類那類）。版本表獨立建。

### 3.4 Domain Helper 變更

`src/domain/sales-survey-templates.ts` 補：

- `SurveyStatus = 'draft' | 'active' | 'archived'`
- `SurveyTiming` enum + label map
- `SurveyTargetHabc = 'H' | 'A' | 'B' | 'C' | 'LOST' | 'DORMANT'`
- `SurveyTemplateRow` 加 `status`、`current_version_no`、`icon`、`timing`、`target_habc`（後三者從 metadata 拆出）
- `SurveyTemplateVersion` 型別 + `listVersions(templateId)` / `restoreVersion(...)` helpers

Server actions `src/lib/sales/survey-templates-actions.ts` 補：
- `saveSurveyTemplateAction(id, input, changeNote)` — 一次 update + 切版本（transaction via RPC 或 dual-write）
- `setSurveyStatusAction(id, status)` — 替代既有 `setSurveyTemplateActiveAction`，三態切換
- `restoreSurveyVersionAction(id, versionNo)` — 走方案 A：把 snapshot 寫回主表並切新版

---

## 4. 互動細節

### 4.1 卡片清單 — icon 來源

**規則**：
1. metadata.icon 有值 → 用 metadata.icon
2. 否則按 status 推導：`active`→`📋`、`draft`→`✏️`、`archived`→`📦`
3. **暫不做 icon picker UI**（Phase 1 範疇外）；待後續 BDN 增量

### 4.2 同頁編輯器 panel — 展開方式（待拍板，Q4）

| 方案 | 體驗 | 實作成本 |
|------|------|---------|
| **A. Spec 原版：上下展開 + scrollIntoView** | 點卡片，下方 panel 展開、頁面捲到編輯器 | ★（最低，符合 spec） |
| B. Accordion in-place | 點卡片，該卡片下方就地展開 panel | ★★ |
| C. Slide-in 右側 drawer | 點卡片，從右側滑入全高 panel | ★★★ |

**預設方案 A**（spec 原版）。Phase 1 維持 spec 規格不擴張。

### 4.3 Sidenav（220px）跟 PagesPanel（240px）衝突 — 處置（待拍板，Q5）

Spec 的 sidenav 屬於頁面內快篩、PagesPanel 是模組導覽。三選一：

| 方案 | 結果 |
|------|------|
| A. 完全照 spec 加 220px sidenav | 雙重 sidebar 套娃，違反 §Stitch 與共用 shell 的分工 |
| **B. 把 sidenav 內容轉成 FilterBar + chip 列**（建議） | 「狀態 / 適用時機」變成最上面的 chip 切換列；計數變成 chip 上的 superscript |
| C. 在 Toolbar 區用 segmented control + dropdown | 折衷，但失去「快速工具」入口 |

**預設方案 B**：
- 狀態 segmented control：[全部 (3) | 啟用中 (1) | 草稿 (1) | 已封存 (1)]
- 適用時機 chip 列（多選 OR）：[到店後追蹤 | 成交後回訪 | 未成交分析 | 休眠激活]
- 「快速工具」直接刪（已在模組 PagesPanel 裡），spec 那兩個 link CRM03A/CRM04A 是模組內導覽

### 4.4 題目編輯 Modal（spec 沒做、必補）

spec 點「✎ 編輯」只 toast。Phase 1 補 design：
- 復用「新增題目 Modal」結構，標題改「✎ 編輯題目」
- 預載入原題目資料（題目內容 / 選項 / 必填）
- 題型不可改（避免 question.id 對應的 answers 結構斷裂）— 或要改就要警告「會清空已收到的此題答案」（spec 沒明示，待 Q6）

### 4.5 題目拖曳排序

採 **HTML5 drag-and-drop**（同 BDN #4 staff-grid 模式，不引套件）。
- 觸發點：`.q-drag` (⠿) handle，整列 `draggable=true`
- `dragstart` / `dragover` / `drop` / `dragend` 四個 handler
- drop 後 reorder local state；按「💾 儲存問卷」一次寫 DB（不每次 drop 就打 server action）
- 拖曳中 `.dragging` class（spec 已備 `opacity:.5`）

### 4.6 版本記錄 Modal — rollback 行為（待拍板，Q3）

按方案 A，restore = clone snapshot 寫回主表 + 新版本號（不允許「停在舊版」）。

Phase 1 預設：
- Modal 純顯示版本歷史
- 每行加「還原此版」按鈕（紅底警告）
- 點下去 confirm：「將以 v2 內容覆蓋當前版本並產生 v4。call_tasks 仍引用同一份問卷模板，新版生效後新建電訪將套用新內容。確定？」

### 4.7 「複製現有問卷」radio — UI 補件

spec 只放 radio、沒給「複製哪份」的 dropdown。Phase 1 補：
- radio 選「複製現有問卷」時，下方展開一個 `<select>` 列出當前 kind + 非封存的問卷
- 建立時：clone questions / target_segment / metadata，name 後加「（副本）」，status='draft'
- `metadata.copied_from = <source_id>` 留溯源

---

## 5. 落地拆分（後續 BDN 條目）

| 編號 | 名稱 | 內容 | 風險 |
|------|------|------|------|
| CRM02.1 | schema migration | `survey_templates` 加 `status` / `current_version_no`；新建 `survey_template_versions` 表 + index；雙 brand seed 至少各 1 筆草稿 + 1 筆已啟用 + 1 筆封存（**indian 為主**）；`is_active` 不刪、用 trigger 跟 `status` 同步以維持向後相容 | 中（trigger + 既有 6 筆資料補 status 預設值；call_tasks 引用不動） |
| CRM02.2 | 卡片清單 view | board.tsx 從 DataGrid 切到 survey-card 卡片清單；保留 FilterBar；status segmented control + 適用時機 chip 多選；計數 badge | 低 |
| CRM02.3 | 同頁編輯器 panel | 點卡片展開下方編輯器：問卷設定列（name + timing select）+ HABC chip 多選 + 題目列表（含拖曳） + 「儲存問卷」收尾切版本 | 中（拖曳排序 + 樂觀更新 + dirty state 管理） |
| CRM02.4 | 版本記錄 modal | Modal 列出 versions、每行還原按鈕；restore 走方案 A | 中（restore 牽動主表 + 新版本切換） |
| CRM02.5 | 題目拖曳排序 + 題目編輯 Modal | drag-and-drop 完工；補「✎ 編輯題目」Modal（復用新增 Modal）；題型不可改的警告 UX | 低 |

> 既有 detail page `/crm/sales/survey-templates/[id]`：CRM02.3 落地後可保留為「直接編輯模式」（外部連結 deep link）或漸進廢棄 — 待 §Q4 拍板。

> Aftersales 對應頁 `/crm/aftersales/survey-templates` 共用同一份 board.tsx + actions（已 `kind` 參數化），CRM02.2~5 一次升級兩條業務線。

---

## 6. 待 Ming 拍板的決策清單

| # | 問題 | 預設方案 | 為什麼問 |
|---|------|---------|---------|
| **Q1** | 狀態三態用 `status` 新欄位，還是繼續複用 `is_active` + metadata.draft 旗標？ | **新 `status` typed column**（draft/active/archived） | typed 較乾淨、會被 sidenav 計數查；但要動 schema |
| **Q2** | `timing`（適用時機）的 4 個 enum value 由我先寫死 vs Ming 給定？ | 我先寫死 `arrive_followup` / `closed_followup` / `lost_analysis` / `dormant_reactivate`（依 spec 文字翻譯） | 直接照 spec 翻可能不貼業務、Ming 可能想用不同分類 |
| **Q3** | 版本表走方案 A（snapshot-only，主表常新）還是方案 B（immutable + 啟用指標）？ | **方案 A** | call_tasks/nps_responses 已有 FK，方案 B 要動 FK |
| **Q4** | 既有 detail page `/[id]` 保留還是廢除？ | 保留當「外部 deep link」入口，主要工作流以同頁編輯器為主 | 廢除要刪 [id]/_components 兩支檔 |
| **Q5** | 220px sidenav 改 FilterBar chip 列（方案 B）OK 嗎？ | **OK** | 避免雙重 sidebar 套娃、符合 §共用 shell 分工 |
| **Q6** | 編輯題目時可不可以改題型？ | **不可改**（題型只能在新增時定），改題型要走「刪舊題 + 新增題」 | 改題型會讓既有 answers schema 對不上 |
| **Q7** | 「設為啟用」一份草稿時，要不要自動把同 kind 的舊啟用問卷封存？ | **不自動封存**（一個 kind 可多份啟用）；CRM03A 電訪建單時 user 自己挑 | 但若業務上同 kind 同 timing 只能有一份啟用，要加 unique 約束 |
| **Q8** | 「複製現有問卷」要不要連 `metadata.target_habc` / `timing` 一起 clone？ | **全部 clone**，name 加「（副本）」、status=draft | 不 clone 等於只剩 questions copy、體驗差 |

---

## 7. 不在 Phase 1 範疇

- 題目分支邏輯（依答案跳題）
- 題目模板庫 / 題目共享
- 問卷預覽（CRM03A 視角看起來長怎樣）
- 多語系問卷
- 問卷收件率 / 完成率分析

待 CRM02.5 收尾後 BDN 再開新卡。

---

_提案完成。等 Ming 拍板 §6 Q1~Q8 後進 CRM02.1 schema migration。_
