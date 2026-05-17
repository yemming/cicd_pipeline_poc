# CRM02B — 售後電訪問卷設定（同頁編輯器 + 話術欄）Phase 1 提案

> 規格：`docs/DUCATI_v2_output/02_客服管理/02_售後CRM/CRM02B_售後電訪問卷設定_v1.html`
> 現行：`src/app/(workspace)/crm/aftersales/survey-templates/page.tsx`（thin wrapper、重用 sales 版 `survey-templates-board.tsx`）
> 階段：**Phase 1（僅提案、不落地、不寫 code）**
> 對應 BDN 第三輪卡片：CRM02B
> 姊妹提案：`docs/proposals/feature-crm02-survey-templates-phase1.md`（CRM02A 銷售側、共用 schema 基礎）
> 日期：2026-05-16

---

## 0. TL;DR

CRM02B 跟 CRM02A 是同一個業務概念（「問卷模板 + 版本控制 + 同頁編輯器」）在售後 / 銷售兩條業務線各有一份規格。**90% 結構相同**（卡片清單、同頁編輯器、版本記錄 modal），**10% 差異集中在 4 個地方**：

1. **適用時機 enum 不同** — CRM02A 是「到店/成交/未成交/休眠」業務漏斗節點；CRM02B 是「D+3 / 回廠保養 / 保固到期 / Desmo / NPS 深訪 / 自訂」維修時序節點
2. **話術欄（script）** — CRM02B 在編輯器最上面有一個深藍色的 `script-editor` 區，存「SA 電訪話術腳本」；CRM02A 沒有
3. **題目的 SA 說明語（hint）** — CRM02B 每一題下方有額外的 `q.hint` 欄，CRM02A 沒有
4. **問卷預覽 panel** — CRM02B spec 多了一塊 `preview-panel`（點「預覽」展開），秀出 SA 視角的題目樣式 + 話術；CRM02A 沒有

關鍵架構決策題：**(A) 銷售側一起升級、prop 控制 vs (B) 售後拆獨立 board**。Sub-agent **傾向 (A)**，理由見 §3，**但未自選、等 Ming 拍板**。

---

## 1. Spec 實際內容（逐 section，含與 CRM02A 差異）

> 共通結構詳見 `feature-crm02-survey-templates-phase1.md` §1。本節只列 CRM02B 特有 / 不同的地方。

### 1.1 Header / Sidenav

- Header 標題改「售後 CRM › **CRM02B 售後電訪問卷設定**」、多了 `sa-badge` 「SA 售後專用」
- 共用 shell 已提供 → header 不重做（同 CRM02A）
- Sidenav 與 CRM02A 同樣是 220px 頁面內快篩、處置同 §4.3
- Sidenav 「適用時機」項目 **完全不同**：
  - CRM02A：到店後追蹤 / 成交後回訪 / 未成交分析 / 休眠激活（4 個）
  - **CRM02B：D+3 滿意度回訪 / 回廠保養提醒 / 保固到期提醒 / Desmo 到期提醒（4 個）**
  - 編輯器內的 `timing-grid` 還多 2 個：NPS 深度訪談 / 自訂跟進 → 共 **6 個 enum value**
- 「快速工具」：CRM02A 連 CRM03A/CRM04A；CRM02B 連 **CRM03B 電訪工作台 / CRM05B NPS 看板**

### 1.2 Main — 問卷清單 Panel

結構同 CRM02A，但 **survey-card 多了：**

- **sc-timing-tags** — 每張卡片底下有 `sc-tag` 列出該問卷適用的所有 timing（一張卡可掛多個 timing；spec 範例 #2 同時掛 maint/warranty/desmo）→ 對映 `metadata.timings: string[]` 多選
- **回收筆數** in `sc-meta`（「回收：156 筆」）— 從 `nps_responses` count by template_id 推導，不入 DB
- card 上多一顆 **「預覽」** button（scb-gray，三顆按鈕變四顆）
- icon 對映變成：D+3=`⭐`、回廠=`⏰`、草稿=`✏️`、封存=`📦`（依 timing + status 推導，不是固定）

### 1.3 Main — 問卷題目編輯器 Panel（核心差異區）

| 區塊 | CRM02A | CRM02B |
|------|--------|--------|
| 問卷設定列（two-col） | 名稱 + 適用時機 select | **名稱 + 問卷狀態 select**（active / draft）— spec 把「狀態」放在這、跟列表卡片同步 |
| HABC chip 列 | 6 個 chip（H/A/B/C/LOST/DORMANT） | **沒有** — 改成 `timing-grid` 6 chip（D+3 / 回廠 / 保固 / Desmo / NPS / 自訂），可複選 |
| **話術欄（script-editor）** | ❌ 無 | ✅ **新區塊**：深藍 `#1A3A5C` 卡片、白字 textarea、tag 「SA 電訪話術腳本」、hint「＊話術將同步顯示於 CRM03B 電訪工作台的建議話術欄位」 |
| 題目列表 | 拖曳 + inline + 刪除 | 同（但每題下方多 `q.hint` 「SA 電訪說明語」顯示為 `💬 ...` 藍字） |
| 按鈕列 | [收起][+ 新增題目][儲存問卷] | **多一顆 [👁 預覽]** |

**話術欄的業務語意**：每份問卷掛一段「電訪話術腳本」，SA 在 CRM03B 電訪工作台打開該問卷時，這段話術會顯示在工作台的「建議話術」欄位 → 是 CRM02B → CRM03B 的資料流。**是 SA 工作流核心**，不能 phase 1 不做。

### 1.4 Main — 問卷預覽 Panel（CRM02B 新增）

點卡片或編輯器內「👁 預覽」展開：

- 上方綠底卡片：「🎙️ 建議話術：{script}」
- 下方依題型渲染題目（單選=radio、複選=checkbox、評分=11 顆 0-10 按鈕、文字=input）
- 每題上方顯示 `q.hint` 為藍字
- 右上 [關閉預覽] btn

CRM02A 沒有這塊；屬於「SA 視角預覽」是售後特有需求（銷售側不需要，因為銷售電訪不靠話術腳本）。

### 1.5 Main — 新增問卷 Modal

| 欄位 | CRM02A | CRM02B |
|------|--------|--------|
| 問卷名稱 | ✓ | ✓ |
| 適用時機 select | 4 個銷售 enum | **6 個售後 enum** |
| 建立方式 | radio：blank / copy 通用 dropdown | radio：**blank / copy-d3 / copy-maint**（spec 寫死 2 個複製來源，無 dropdown） |
| 提示 section-tip | ❌ | ✅「💡 每種電訪類型建議各維護一份問卷版本，SA 在 CRM03B 電訪工作台填答後自動彙整至 CRM05B NPS 看板。」|

### 1.6 Main — 新增題目 Modal

| 區塊 | CRM02A | CRM02B |
|------|--------|--------|
| 題型 4 grid | 單選/複選/評分1-10/文字 | 單選/複選/**評分 0-10**/文字（spec 文字寫 0–10，CRM02A 寫 1–10；對 DB 都是 `rating` type，UI label 不同） |
| 題目內容 textarea | ✓ | ✓ |
| 選項設定 | ✓ | ✓ |
| **SA 電訪說明語（hint）** | ❌ | ✅ 新欄位 `new-q-hint` text input + form-hint「顯示在 CRM03B 電訪工作台題目旁，幫助 SA 詢問」 |
| 必填 checkbox | ✓ | ✓ |

### 1.7 Main — 版本記錄 Modal

幾乎同 CRM02A，差異：
- 多了「回收 X 筆」副字（v2 156 / v1 43）
- 右下多一顆 [另存新版本] btn（CRM02A 沒有）

---

## 2. 資料缺口 audit

> 共用 §1 reuse CRM02A 的 `survey_templates` audit（已 list_tables 驗證 / 詳見 `feature-crm02-survey-templates-phase1.md` §2.1-2.3）。本節只列 **CRM02B 特有**的缺口。

### 2.1 共用 CRM02A 的所有 schema 需求

| Spec 需要 | CRM02A 已提案 | 對 CRM02B 是否足夠 |
|----------|--------------|-------------------|
| `status` typed column (draft/active/archived) | ✅ | ✅ 完全足夠 |
| `current_version_no` typed column | ✅ | ✅ |
| `survey_template_versions` 表 + snapshot | ✅ | ✅ |
| `metadata.icon` | ✅ | ✅（CRM02B 推導規則不同但欄位共用） |
| `metadata.timings: string[]`（**改成複數**） | CRM02A 提案是單一 `metadata.timing` | ⚠️ **要改成複數**（CRM02B 一張卡掛多個 timing） |
| `metadata.target_habc: string[]` | ✅ | ⚠️ CRM02B 沒用 HABC，但欄位留著無妨（不填即可） |

**衝突點 — `timing` 單數 vs 複數**：

CRM02A 設計成 `metadata.timing: string`（單選 enum）。CRM02B spec 明確支援一張卡掛多個 timing（例：回廠保養問卷同時適用 `maint` + `warranty` + `desmo`）。

**處置建議**：CRM02A 也改成 `metadata.timings: string[]`，跟 CRM02B 對齊；CRM02A 業務上若實際只用單選，前端控制只能勾 1 個即可，schema 統一比較乾淨。**這點需要 Ming 拍板**（見 Q2）。

### 2.2 CRM02B 特有：話術欄 `script`

| 欄位 | 性質 | 處置 |
|------|------|------|
| `script` | 一段純文字、長度 100-500 字、每張問卷一份 | **新增** `metadata.script: string`（jsonb 內）— 變動中、純顯示、單模組用 → 走 metadata 不開 typed column |

**為什麼不開 typed column**：架構文 §升降級規則「形狀還在變 / 單頁專用 / 純顯示 → metadata jsonb」。話術只有 SA 工作流會用、不會被 RLS / FK / 報表查、未來可能會擴成「分段話術 / 多語話術」schema 還會改 → 先放 metadata。等 SA 工作流穩了再 promote。

### 2.3 CRM02B 特有：題目 `hint`

| 欄位 | 性質 | 處置 |
|------|------|------|
| `q.hint` | 每題一段純文字 SA 說明語 | **擴 `questions` jsonb 內每個 question 物件加 `hint?: string`** — 反正 questions 本來就 jsonb，加 optional field 不動 schema |

`SurveyQuestion` TS type（`@/domain/sales-survey-templates`）要加 `hint?: string`。CRM02A 對應的題目沒這欄位、不填即可、不會壞既有資料。

### 2.4 CRM02B 特有：回收筆數（卡片顯示用）

| 需求 | 來源 |
|------|------|
| 「回收：156 筆」、版本表「回收 43 筆」 | 從 `nps_responses` 表 COUNT(*) GROUP BY survey_template_id（已有 FK） |

**處置**：
- 列表頁 server component 跑一次 `select template_id, count(*) from nps_responses group by template_id` 帶進來
- 不需要在 `survey_templates` 上加 cache column（POC 階段 N+1 還能接受）
- 版本表的回收筆數則需要 snapshot 時記下「該版發佈期間的回收數」— 複雜度高，**Phase 1 不做**（暫顯示 `-` 或 hard-code 0），列為 Phase 2 增量

### 2.5 CRM02B 特有：適用 timing enum 值

固定 6 個（spec 寫死）：

```
d3              D+3 滿意度回訪
maintenance     回廠保養提醒
warranty        保固到期提醒
desmo           Desmo 到期提醒
nps             NPS 深度訪談
custom          自訂跟進
```

CRM02A 提案的 4 個 timing（`arrive_followup` / `closed_followup` / `lost_analysis` / `dormant_reactivate`）+ CRM02B 這 6 個 = **共 10 個 enum value**，DB 不 check constraint（jsonb 自由），前端按 `kind` 提供不同的選單。

### 2.6 FK 引用追加確認

```
call_tasks.survey_template_id      → survey_templates.id   ✅
nps_responses.survey_template_id   → survey_templates.id   ✅（CRM02B 回收筆數用）
```

無新增 FK 需求。

---

## 3. 架構選邊（**主要決策題、待 Ming 拍板**）

### 3.1 現況

`src/app/(workspace)/crm/sales/survey-templates/_components/survey-templates-board.tsx`（366 lines）是兩條業務線共用的 board。

- `crm/sales/survey-templates/page.tsx` → 傳 `kind='sales'` + `basePath='/crm/sales/survey-templates'`
- `crm/aftersales/survey-templates/page.tsx`（thin wrapper）→ 傳 `kind='aftersales'` + `basePath='/crm/aftersales/survey-templates'`

board.tsx 內部用 `kind` 切資料（撈 row 時 server query filter），UI 是同一份。

### 3.2 兩條路徑

#### 路徑 (A) — 銷售側一起升級、prop 控制適用時機 & 話術

**做法**：
- board.tsx + 新增的編輯器 component 都共用一份
- 用 `module: 'sales' | 'aftersales'` prop（也可叫 `kind`，現行已有）控制：
  - timing 選單內容（sales 4 個 / aftersales 6 個）
  - 是否顯示話術編輯區（aftersales 顯示、sales 不顯示）
  - 是否顯示題目 hint 欄位（同上）
  - 是否顯示預覽 panel（aftersales 顯示、sales 不顯示）
  - HABC chip 列（sales 顯示、aftersales 不顯示）
  - 卡片 icon 推導規則（依 kind 不同的 mapping table）

**影響範圍**：
- board.tsx 增約 200-300 行（含話術區 / 預覽 panel / hint 欄位 / 6 個 timing chip）
- CRM02A schema 提案的 `metadata.timing` 改 `metadata.timings: string[]`（影響 CRM02A.1 schema migration 草稿）
- `SurveyQuestion` type 加 `hint?` field（影響 CRM02A.5 題目 Modal）

**利**：
- 兩側永遠同步演進、bug fix / 視覺升級一次到位
- 共用 schema、共用 actions、維護成本最低
- 銷售側「順手升級」拿到拖曳排序、版本記錄等 CRM02A 沒明確要求但本來就要做的功能
- thin wrapper 模式持續有效

**弊**：
- board.tsx 變胖（接近 600-700 行），複雜度集中在一個檔案
- 兩側耦合 — 將來如果 sales / aftersales 工作流要走完全不同方向（例如 sales 想用 wizard），要拆分時成本高
- prop 條件渲染多 → 邏輯難讀（`if (module === 'aftersales')` 散在好幾個地方）
- 測試覆蓋面變廣，一改可能影響另一側

**工時估計**：3-4 天（含話術區 / 預覽 panel / 兩側 timing 適配 / hint 欄位 + 版本記錄 modal + 拖曳排序）

#### 路徑 (B) — 售後拆出 `aftersales-survey-templates-board.tsx` 獨立 component

**做法**：
- 新建 `src/app/(workspace)/crm/aftersales/survey-templates/_components/aftersales-survey-templates-board.tsx`
- aftersales/page.tsx 從 import sales 版改成 import 新版
- sales 版 board.tsx 不動（維持現狀，CRM02A 落地時才升）
- 兩份 board 各自演進；schema 仍共用 `survey_templates`

**影響範圍**：
- 新建一份獨立 board（~500-600 行）
- aftersales/page.tsx 改 import path
- `[id]` / `new` 是否也要拆？— 大概要（detail page 也有話術欄）
- domain helper / actions 共用一份即可（schema 一樣）

**利**：
- 兩側獨立、各自演進；售後可以快速上線而不卡銷售側
- 邏輯清晰、每份 board 只服務一條業務線
- 將來業務工作流分歧（例 sales 改 wizard）不需重構
- 改動範圍局限在 aftersales 目錄

**弊**：
- 90% code 重複；視覺升級 / bug fix 要改兩遍（DataGrid 升級、版本記錄、拖曳排序這些都要兩份）
- 銷售側 CRM02A 拖到第四輪 BDN 才能升、現在會出現「售後超漂亮、銷售還是舊 DataGrid」的不一致期
- helper / action 還是共用（schema 一樣）→ 共用層在 domain、UI 在外面 → 反而比 (A) 更難維護一致性
- 違反「同一概念用同一 component」的本能直覺、增加未來新人理解成本

**工時估計**：3-4 天（不會比 (A) 快，因為要重做整份 board，只是測試風險局限）

### 3.3 Sub-agent 中立分析意見

兩條路工時相近、都能達標。**核心差異是「未來兩條業務線會不會分岔走不同方向」**：

- 若 **2-3 個 BDN 輪次內、兩側都還是「列表 + 同頁編輯器」基本盤** → (A) 完勝（共用 component 紅利）
- 若 **半年內可能其中一側轉向 wizard / 多步驟 / 完全不同工作流** → (B) 比較安全（避免再拆一次的痛）

從目前 spec 看，CRM02A vs CRM02B 結構 90% 一樣（卡片清單 + 同頁編輯器 + 版本記錄）、差異點都是**資料欄位**而非**工作流結構**——這正是 prop 控制最適合處理的場景。

**Sub-agent 傾向 (A)**，理由：
1. 結構同源、差異是欄位級的（timing/script/hint/preview/HABC）→ 適合 prop 控制
2. CRM02A 提案的版本記錄 / 拖曳排序 / 卡片清單這幾個大頭都會做，兩邊都要、不如一次到位
3. POC 階段不過度 future-proof（架構文 §不寫什麼），等真的分岔再拆
4. 銷售側現在 366 行 board 既然能共用，多 200 行還在可控範圍；超過 800 行再考慮拆

**但 (B) 的理由也成立**：
- Ming 過去拆 CRM 模組（sales/aftersales 14 頁拆 /crm/* 統一）時就明確選過「拆獨立」路線（commit ff45491），偏好獨立演進
- 共用 board 一旦變胖，新人讀 366 → 700 行的條件渲染會頭痛
- 售後 SA 工作流是 SA 專屬流程、跟銷售業代差異會越來越大（CRM03B 工作台、NPS 看板都是 SA-only）

**未自選、等 Ming 拍板 §6 Q1。**

---

## 4. 互動 / 視覺細節（CRM02B 特有）

### 4.1 話術編輯區（script-editor）視覺

直接套 spec 的深藍 `#1A3A5C` 底：

```tsx
<div className="bg-[#1A3A5C] rounded-lg p-[13px_15px] mb-3">
  <div className="text-[9.5px] font-bold tracking-wider uppercase text-white/50 mb-2">
    SA 電訪話術腳本
  </div>
  <textarea
    className="w-full bg-white/[.08] border border-white/15 rounded-md px-3 py-2.5
               text-white text-[12.5px] leading-[1.8] outline-none resize-y min-h-[72px]
               placeholder:text-white/35 focus:border-white/35"
    placeholder="輸入建議話術，SA 在 CRM03B 電訪時可直接參照此腳本..."
  />
  <div className="text-[10.5px] text-white/40 mt-1.5">
    ＊話術將同步顯示於 CRM03B 電訪工作台的建議話術欄位
  </div>
</div>
```

**注意**：本專案 §Design Pattern 主色票是 navy `#1A3A5C`、跟 spec 一致；不衝突。

### 4.2 預覽 Panel 開合行為（待拍板，Q4）

選項：
- (a) 跟編輯器 panel 同模式（spec 原版）— 點預覽展開下方 panel、scrollIntoView
- (b) 改成 Modal（修飾性）— 預覽是 readonly、用 Modal 比較不佔頁面空間
- (c) Drawer 從右側滑入

**預設方案 (a)**（spec 原版、最低成本）。

### 4.3 卡片 icon 推導

CRM02B spec icon 多樣（⭐ ⏰ ✏️ 📦）；建議規則：
1. `metadata.icon` 有設值 → 用 metadata.icon
2. status='draft' → `✏️`
3. status='archived' → `📦`
4. status='active' + `metadata.timings` 含 `d3` → `⭐`
5. status='active' + `metadata.timings` 含 `maintenance` → `⏰`
6. status='active' + 其他 → `📋`

**待 Ming 拍板**：是否做 icon picker UI（Phase 1 預設**不做**，純推導；下個 BDN 增量再開）。

### 4.4 「複製現有問卷」radio 改 dropdown

spec hard-code 「copy-d3 / copy-maint」兩個固定 radio，**這在實務上會壞**（如果 user 之前沒建 D+3 問卷，radio 點下去找不到來源）。

**處置**：跟 CRM02A 同樣的做法 — radio 換 dropdown「複製現有問卷 ▾」、列出當前 kind 非封存的問卷供選。

### 4.5 題目 hint 在編輯器列表顯示

spec：`💬 {hint}` 藍字 (`#185FA5`) 顯示在 q-meta 下方。可直接套用。

CRM02A 的題目沒 hint 欄位，顯示時自動隱藏 → prop 控制路徑 (A) 下：條件渲染。

---

## 5. 落地拆分（CRM02B.1 ~ .4）

> 假設選 (A) 銷售側一起升級。若選 (B) 拆 board，則 .1 縮小、.2/.3/.4 變成在獨立 board 上實作。

### CRM02B.1 — schema migration（共用 CRM02A.1 + 售後增量）

- 沿用 CRM02A.1：`survey_templates` 加 `status` / `current_version_no`；新建 `survey_template_versions`；雙 brand seed
- **新增**：`metadata.timing`（CRM02A 提案）改 `metadata.timings: string[]`
- **新增**：domain type `SurveyQuestion.hint?: string`
- **新增**：售後側雙 brand 各 seed 4 筆問卷（D+3 啟用 + 回廠啟用 + 休眠草稿 + D+3 封存，**indian 為主**）
- domain helper `getSurveyTemplateListPageData` 補撈 `nps_responses` count（卡片顯示用）

**風險**：中（schema migration + seed）。**前置依賴**：CRM02A.1 是否已落地？若沒、CRM02B.1 = CRM02A.1（合併執行）。

### CRM02B.2 — 卡片清單 + sidenav → FilterBar 改造（共用 board / 兩側升級）

- board 從 DataGrid → 卡片清單
- 狀態 segmented control（[全部 | 啟用中 | 草稿 | 已封存]）
- timing chip 列（依 `kind` 決定 4 個 sales / 6 個 aftersales）
- 卡片內 timing tags、回收筆數、icon 推導
- 「快速工具」連結 — 按 kind 連到 CRM03A/04A 或 CRM03B/05B

**風險**：低（純 UI）。

### CRM02B.3 — 同頁編輯器 + 話術區（CRM02B 核心、勝負點）

- 點卡片展開編輯器 panel（spec 方案 a）
- 問卷名稱 + 狀態 select（two-col）
- timing-grid 多選 chip
- **話術 textarea**（aftersales-only、深藍卡片）
- 題目列表 + 拖曳排序（HTML5 d&d）
- 題目 hint 顯示（aftersales-only）
- 「💾 儲存問卷」收尾切版本

**風險**：中（拖曳 + 樂觀更新 + dirty state + 話術區條件渲染）。

### CRM02B.4 — 版本記錄 modal + 預覽 panel + 新增/編輯題目 modal

- 版本記錄 modal（共用、列回收筆數）
- restore 按鈕走方案 A（snapshot 寫回主表 + 新版號）
- **問卷預覽 panel**（aftersales-only、SA 視角）
- 新增題目 modal 加 hint input（aftersales-only）
- 編輯題目 modal（spec 沒做、補設計、復用新增 modal 結構）
- 題型不可改的警告 UX

**風險**：低-中。

---

## 6. 待 Ming 拍板（Q1-Q8）

| # | 問題 | 預設 / 傾向 | 為什麼問 |
|---|------|------------|---------|
| **Q1** | **架構選邊：(A) 銷售側一起升級、prop 控制 vs (B) 售後拆獨立 board** | Sub-agent **傾向 (A)**，但未自選 | 影響整個落地路徑、後續維護成本 |
| Q2 | `metadata.timing`（單數）改 `metadata.timings: string[]`（複數）— CRM02A 也要跟著改？ | **改成複數**（兩側對齊） | CRM02B spec 明確要多選、不改會分岔 |
| Q3 | 話術欄存 `metadata.script`（jsonb）vs 開 typed column `script text`？ | **走 metadata**（變動中、單模組） | 一致用架構文升降級規則 |
| Q4 | 預覽 panel 用 (a) 同頁展開 / (b) Modal / (c) Drawer？ | **(a) 同頁展開**（spec 原版） | 純呈現邏輯，影響開發時間 0.5 天 |
| Q5 | 220px sidenav 改 FilterBar chip 列 OK 嗎？（同 CRM02A Q5） | **OK** | 避免雙重 sidebar 套娃 |
| Q6 | 卡片 icon picker UI Phase 1 做不做？ | **不做**（純推導） | 增量 BDN 再開 |
| Q7 | 「複製現有問卷」用 dropdown 取代 spec 的 hard-code radio？ | **OK** | 避免問卷不存在時點不到 |
| Q8 | 版本記錄回收筆數 Phase 1 顯示 `-` / hard-code 0 還是現算？ | **Phase 1 顯示 `-`**（複雜度低、不卡進度） | 版本範圍內回收數需要 snapshot 期間切片，工程量高 |

---

## 7. 不在 Phase 1 範疇

- **話術區擴展**：分段話術（破冰 / 主問題 / 收尾）、多語、變數插值（`[SA姓名]`、`[車款]`）
- **問卷預覽更逼真**：CRM03B 工作台 UI 1:1 重現
- **問卷範本庫**（題目庫 / 跨問卷共用題）
- **題目分支邏輯**（依答案跳題）
- **問卷收件率 / 完成率 / NPS 計算分析**（CRM05B 負責）
- **A/B 測試**（v2-active vs v3-trial 同時跑）
- **題型擴增**（日期 / 圖片上傳 / NPS 內建子題）

待 CRM02B.4 收尾後 BDN 再開新卡。

---

## 8. 與 CRM02A 提案的合併建議

若 Ming 選路徑 (A)：

1. CRM02A.1 schema migration **合併** CRM02B.1 一次跑（避免 `metadata.timing` 改名改兩次、雙 brand seed 一次補齊）
2. CRM02A.2 / CRM02B.2 卡片清單 **合併** 一條（共用 board UI）
3. CRM02A.3 / CRM02B.3 編輯器 **合併** 一條，但工作量 +30% 加話術 / hint / preview
4. CRM02A.4 / CRM02B.4 版本記錄 + 題目 modal **合併** 一條
5. 拖曳排序合進 CRM02B.3

→ 從 CRM02A 5 條 + CRM02B 4 條 = 9 條，合併後 **4-5 條**搞定兩側，工時 +1 天但避免重工。

若選路徑 (B)：兩份提案各自落地、無合併。

---

_提案完成。等 Ming 拍板 §6 Q1（架構選邊）+ Q2-Q8 後進 CRM02B.1（或合併版 CRM02.1）。_
