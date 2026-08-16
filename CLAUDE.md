# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

**DealerOS for Ducati Taiwan** — 杜卡迪（Ducati）重機經銷商營運管理平台。基於 Next.js 16 App Router，設計稿全部在 Stitch 上完成。

## 部署環境 / E2E 測試帳號（MANDATORY）

**正式部署 URL**：`https://dealeros.zeabur.app/`（Zeabur `DealerOS-Production`，監看 GitHub `main` 自動部署）。

**驗證一律走 Deploy-then-Test**（`.claude/skills/spec-to-feature/references/orchestration.md` §3）：push → Zeabur 自動部署 → 打**部署後 URL** 跑 Playwright，**不在開發機起常駐 `next dev`**（會跟 Chromium 搶記憶體當機）。

**⚖️ 法律/合規類修正 = hotfix，不納入大批次（2026-06-23，Russell 正式裁示）**：凡涉及合約文字、消保法不得記載、法律揭露義務等合規類修正，**一律定性為 hotfix 立即單獨部署**，不可被「全部做完才一次部署」的大批次卡住、不受其他功能進度牽連。遇到合規類問題主動標記「不可納入批次、需即時部署」並提醒 Ming。（緣由：RS04 合約違法條款因卡在大批次+簽核 gate 拖了數天才修，Russell 要求正式記錄此規則避免重演。）

**⏸️ 上版 LINE 通知已暫停（2026-06-23，省 LINE 額度）**：LINE 免費額度每月僅 200 則，每天 push 會把額度燒光，故**暫時關閉上版通知**。實作上是把 Notification Hub 裡 `deploy.released` 的 LINE 訂閱設 `is_active=false`（subscription id `46060e2c-4446-41b3-9229-5a4342906b79`），**只關上版這一個事件的 LINE，其他 LINE 通知（許願單建立等）照常**。
- **現在 push 完不必再跑 `node scripts/notify-deploy.mjs`**（跑了也不會推 LINE，dispatch 命中 0 個 active 訂閱）。
- 要恢復：把該 subscription `is_active` 設回 `true` 即可（機制、script、模板、token 全保留未動，隨時可開回）。
- 機制備忘（恢復時參考）：script 輪詢 `zeabur deployment list --json` 等 HEAD RUNNING → POST `/api/deploy/released`（`DEPLOY_NOTIFY_TOKEN` 守門）→ Hub 推 LINE 🚀 已上版卡；事件 `deploy.released`、模板 `src/lib/notifications/templates/deploy-released.ts`。詳見 memory `reference_twenty_third_round` / `feedback_deploy_notify_include_commits`。

**E2E 測試帳號（admin，可程式登入）**：

| 用途 | Email | Password |
|------|-------|----------|
| Playwright 登入正式站做 E2E（含 admin-gated 頁如 `/admin/accounting/reports/*`、`/admin/*`） | `yemming.yu@gmail.com` | `yemming.yu@gmail.com` |

- **帳密相同**（`yemming.yu@gmail.com`）；此帳號已在 `app_admins`（isAdmin=true）→ 可進所有 admin-gated 頁。雖平常用 Google OAuth，但已另設 email/password，可全自動 Playwright 登入（走 `/login` 的 email/password 表單，**非** OAuth）。
- **storageState 換網域作廢**：`tests/e2e/.auth/*.json` 是 localhost cookie，打部署 URL 無效 → 對部署後 URL 用此帳號**重新登入**產 storageState。
- 8 個 e2e persona（sa/tech/warehouse/…）都不是 admin → 要驗 admin 頁一律用 `yemming.yu@gmail.com`。
- ⚠️ `ccc@ccc.ccc` 是**客戶 demo 帳號（非 admin）**，給客戶進來看展示用 —— **不要拿來測 admin 頁、不要擅自把它加進 `app_admins`**（會把設定類功能也對它打開）。

## 📋 修復/任務完成報告規範（MANDATORY，2026-08-16 拍板）

> **緣由**：`docs/20260815/profile_brands-user_assignments-dual-auth-fix.md` 這份報告的寫法得到 Ming 肯定，訂為往後所有修復/任務完成報告的標準做法。核心精神：**單一連結交付、人與 AI 都能一次讀完、誠實揭露限制**。Russell 會直接掃 GitHub 的碼，報告本身就是攤在陽光下的東西，不要另外整理簡報或截圖包。

### 交付形式

- **一份 self-contained 的 Markdown 檔**，位置 `docs/YYYYMMDD/{slug}.md`；截圖丟同目錄下的 `screenshots/` 子資料夾。
- **截圖一律用 Markdown image 語法內嵌相對路徑**（`![說明](screenshots/xxx.png)`），不要只留檔名或當附件——GitHub 開連結直接渲染成圖，人跟 AI 都能在同一個頁面讀完整份報告，不用再點開第二個檔案。
- **完成後 push 到 `main`**，回覆時只丟這個 GitHub 連結（`https://github.com/yemming/cicd_pipeline_poc/blob/main/docs/...`），不要另外傳 zip、截圖包或口頭摘要取代連結——連結就是唯一事實來源，對方（Ming／Russell）自己點進去看。

### 報告結構

固定包含以下段落（可依任務調整標題文字，但精神不能少）：

1. **修復/變更內容**：改了什麼、邏輯是什麼，附關鍵程式碼片段
2. **變更範圍確認**：明確列出「做了什麼」與「刻意沒做什麼」（尤其當指令有畫線範圍時），避免順手擴權
3. **執行紀錄**：migration 名稱 / commit hash / 部署方式，讓對方能自己回溯
4. **驗證與證據**：能跑 Playwright 就跑，截圖內嵌；不能跑就明講用的是哪一層驗證（SQL / API / 邏輯推導），不要含糊帶過
5. **風險說明**：型別轉換、邊界條件、可能的副作用
6. **誠實揭露限制**：驗證失敗、卡住、或發現的新問題（**包括自己這次修復本身引入的 regression**）都要如實記錄，不要隱藏或美化成「已完成」。分清楚「這是本次任務範圍」還是「另一個問題，需要另外確認」

### 追加式更新，不是每次開新檔

**同一個任務的後續進度、補測、或事後發現的問題，一律用新增章節追加到原本那份報告檔案裡**（例如 `## 六、後續補做（2026-08-16 追加）`），**不要另開一份新的日期資料夾報告**打散敘事脈絡。理由：報告的價值在於一個連結能看到完整故事（含中間繞的彎路），拆成多份檔案會讓 Russell 要自己拼圖。只有當這是**全新、不相關的任務**時才開新檔案。

### 自己捅的簍子要寫進去

如果驗證過程中發現自己的修復本身引入新問題（例如改一個 RLS helper function 卻造成遞迴），**不要默默修完就當沒發生過**——要在報告裡完整記錄「發現了什麼、為什麼會發生、怎麼修的、修復前後的證據」。這比只報喜不報憂更能取得信任，也是留給下一個接手的人（人或 AI）最有用的踩坑紀錄。

## 📥 需求受理與回應規範（MANDATORY，2026-08-03 拍板）

> **背景**：這是 CI/CD POC 的核心矯正。近 30 輪的需求輸入端 100% 是外部（Russell）的 Word / Markdown 批次指令，而系統設計的真正輸入端「許願池」實際只收過 **7 張單、1 個作者（Ming 自己）、最後一張停在 2026-06-09**。專案商業前提（時程 / 範圍 / 金額 / 上線日）**至今未談定**，客戶端也沒有持續回饋。
>
> 在這個前提下，「把文件裡每個缺口都做完」不是交付，是替沒人走過的路蓋紅綠燈。

### 一、拿到需求還是做 —— 但產出的形狀要改

**收到外部批次文件（Word / Markdown / 缺口清單 / 「所有缺口全部完成才能回報」型指令）時，照常執行分析與落地，但回覆與報告一律分成三類，禁止寫成「全部都做」。**

| 類別 | 判準 | 處置 |
|---|---|---|
| **A · 現在就做** | 防止系統造成**真實傷害**的 downside 保護（例：打電話給已標記 `deceased` / `do_not_contact` 的客戶）、明確 bug、法律/合規類、單一畫面或單一 function 的小範圍修正 | 直接做、小批量單獨部署。合規類依 §部署環境 走 hotfix |
| **B · 標成「缺口」** | 功能確實缺、但沒有真實使用量支撐優先級 | 記錄成缺口清單（含資料量佐證），**不排期、不建治理樓**，等真實訊號 |
| **C · 標成「需與客戶實際討論後定案」** | 任何牽涉**業務流程規則**的參數與層級：SLA 幾小時、升級給誰、誰有裁示權、D+N 回訪的 N、嚴重度分級定義、審批層數 | **只出提案、不寫死實作**。這些數字不是技術問題，是公司流程問題，AI 和我們都無權自己決定 |

**C 類是重點**。以前的失誤是把「主管 2 小時內必須處理」這種**憑空生出來的流程規則**直接實作成 schema + cron + 通知鏈。這種東西客戶一句「我們公司不是這樣跑」就全廢，而且改起來比沒做還貴。

### 二、動手前必查資料量（MANDATORY）

要在某張表上蓋流程 / 治理 / 自動化之前，先跑：

```sql
select count(*), max(created_at)::date from <table>;
-- 再看是不是 seed：
select created_at::date d, count(*) from <table> group by 1 order by 2 desc limit 5;
```

**判準**：如果該表只有個位數 row、或 80% 的 row 是同一天灌進來的 seed → 這條需求歸 **B 或 C**，不歸 A。把數字寫進回覆裡，讓事實去說話，不要用形容詞。

（2026-08-03 實例：`complaints` 2 筆、`survey_responses` 6 筆停在 5/17、`call_tasks` 239 筆中 181 筆是 5/19 一天的 seed。在這之上蓋三層 SLA 升級 + cron + 電郵草稿，是替空表蓋樓。）

### 三、方向：文件流 → 許願池流

**目標**：把「Markdown / Word 丟來丟去」換成**在系統裡開工單、被 log** 的流程。逼使用者或 Russell 真的坐在瀏覽器前跑一次流程、留下 log，我們的系統才第一次有意義（也才是在吃自己的狗糧）。

未來許願單要帶的欄位方向（尚未實作，等 Ming 拍板時機）：
- `source_person` — 誰說的（真實姓名 + 職位 + 門店）
- `observed_at` — 什麼時候、他當時在做什麼
- `frequency` — 每天 / 每週 / 每月 / 一年一次 發生幾次（**強迫給權重**；AI 產的缺口清單最大的病是每一項都同等重要，所以永遠無法排序、永遠不收斂）

⚠️ **節奏：不要激進轉變**。客戶端連時程 / 範圍 / 金額都還沒談定，此時強推流程改革只會製造反感。**先改我們自己回覆的形狀（第一、二節），制度化的 gate 等 Ming 說了才做。** 不要主動去要求對方改流程、不要自作主張發出流程改革宣告。

### 四、報告與回覆的寫法

- ❌ 不要寫「已全數完成 N 個缺口」——那是努力的證據，不是價值的證據
- ✅ 要寫「A 類已做並部署 / B 類缺口清單（附資料量）/ C 類待客戶確認的流程問題清單」
- ✅ C 類請把問題寫成**可以直接拿去問客戶的白話問句**（例：「NPS 低分後，貴公司實際上是誰在多久內聯繫客戶？」），而不是寫成規格
- ✅ 截圖只證明畫面存在，不證明流程有人走過。**真正的驗收是真人在 prod 完成一次真實業務、資料落地**

---

## 開發測試資料規範（MANDATORY）

**所有開發 / demo / 測試資料一律塞在 `brand_id='indian'` 底下，不要亂放到 ducati。**

**為什麼**：Ming 平常在瀏覽器登入測試的帳號是 Indian brand（dev session scope 也是 Indian）。如果 demo 資料塞 Ducati、Ming 切過去截圖會看到空畫面、誤以為功能壞掉，雙方對不齊浪費 round-trip。

**怎麼做**：
- 造 demo / fixture 前先 `SELECT brand_id, count(*) FROM <table> WHERE ...` 確認，要塞的 row 一律帶 `brand_id='indian'`
- 撈相依資料（warehouse_id / item_id / supplier_id 等）也要用 Indian 的 FK
- Ducati seed 資料是業務範例（Ming Taipei 真實情境），保留別動
- 若需要兩 brand 都示範（例如 sidebar 入口、跨 brand 規範），明說「雙 brand 各塞一筆」再做

**例外**：Ming 主動指定「在 Ducati 做」才用 Ducati。預設一律 Indian。

## UX 互動規範（MANDATORY）

### 前端寫入後端資料庫時，必須做載入動畫 + 鎖住 UI

**規則**：只要是會寫入資料庫或打 server action 的互動（建立單據、送出留言、切換狀態、上傳附件、儲存畫布、更新設定…等），前端都必須：

1. **顯示讀取中動畫** — 按鈕內嵌 spinner、文字換成「儲存中⋯」/「建立中⋯」/「切換中⋯」等明確的進行式
2. **鎖住 UI** — 該區塊 `disabled` + `pointer-events-none` + 半透明，避免使用者以為沒反應而重複點擊
3. **請求完成後**依資料屬性或 DB 回應決定下一步：
   - **成功** → 關閉 modal / 清空表單 / toast「✓ 已儲存」/ 樂觀更新的資料落地
   - **失敗** → 顯示明確錯誤訊息（錯誤碼 + 人話），rollback 樂觀更新，維持表單內容讓使用者修正

**為什麼**：server action / Supabase round-trip 在網路差或 Auth server 有延遲時會有 ~200-500ms「看不見的黑盒時間」，沒有 UI 回饋使用者會以為系統壞了、狂點按鈕 → 重複送出、資料亂掉、體感「頓」。

**標準做法**：
- Form + server action → `useFormStatus()` 取得 `pending`
- 自訂 async 流程 → `useTransition()` 的 `isPending`
- 樂觀更新 → 樂觀項目標 `pending: true` + 視覺半透明 + spinner
- 禁止：純 `<form action={serverAction}>` 不加 pending UI

**參考實作**：`src/components/feedback/ticket-form.tsx`、`src/components/feedback/comment-thread.tsx`、`src/components/feedback/status-actions.tsx`

## Dev / Commands

```bash
npm run dev -- -H 0.0.0.0 -p 3000   # LAN-accessible（http://10.7.12.179:3000）
npm run build && npm run start       # production
npm run lint                          # ESLint
```

## Workspace Shell Architecture (MANDATORY)

**所有業務頁面一律共用 dual-rail shell，不可重寫。**

頁面只負責**內容**，殼由 `(workspace)/layout.tsx` 統一提供。整個導航由 `src/lib/modules.ts` 這個 registry 驅動，是全站的 Single Source of Truth。

### Shell 構成（由外到內三層）

```
┌──┬──────────────┬─────────────────────────────
│ 56│  240          │  Main content (ml-[296px])
│   │              │  ┌──────────────────────── Topbar (fixed, left-[296px])
│ M │  Pages       │  │  [title/tabs/breadcrumb | search | actions]
│ o │  Panel       │  └────────────────────────
│ d │              │
│ u │  (module's   │  頁面內容（各模組 *.tsx）
│ l │   flat page  │
│ e │   list)      │
│   │              │
│ R │              │
│ a │              │
│ i │              │
│ l │              │
└──┴──────────────┴─────────────────────────────
```

| 元件 | File | 負責 |
|------|------|------|
| `<ModuleRail>` | `src/components/module-rail.tsx` | 左 56px 深藍細條，列出所有模組 icon + 主地圖入口 |
| `<PagesPanel>` | `src/components/pages-panel.tsx` | 左 240px 深藍面板，顯示當前模組的扁平頁面清單（支援 section 分組） |
| `<Topbar>` | `src/components/topbar.tsx` | 頂部 64px；依 `PageHeaderContext` 渲染 tabs/breadcrumb/搜尋 |
| `PageHeaderContext` | `src/components/page-header-context.tsx` | 頁面 ↔ Topbar 溝通橋樑 |
| `<CommandPalette>` | `src/components/command-palette.tsx` | ⌘K 跨模組搜尋 |
| `<PlaceholderPage>` | `src/components/placeholder-page.tsx` | 尚未開發頁面的統一佔位 |
| `<StitchViewer>` | `src/components/stitch-viewer.tsx` | **Phase 2 核心**：嵌入 Stitch 原稿（iframe），demo 用的臨時頁面 |

### 新增一個模組：只改 `src/lib/modules.ts`

Module Rail、Pages Panel、Launcher 都自動吃這份 registry，不需要修改任何元件：

```ts
// src/lib/modules.ts
export const modules: ModuleDef[] = [
  {
    key: "service",
    name: "維修管理",
    icon: "build",
    accent: "#4A90E2",
    description: "預約・工單・維修廠",
    home: "/service/appointments",
    permission: "service.access",
    pages: [
      { name: "預約管理", icon: "calendar_today", href: "/service/appointments", stitchScreenId: "1575f27a..." },
      { name: "維修工單", icon: "construction",   href: "/service/workorders",   stitchScreenId: "2428f2b6..." },
      // ...
    ],
  },
];
```

`stitchScreenId` 是 Phase 2 新增欄位：帶著此 ID，`<StitchViewer>` 會把對應 Stitch 畫面嵌進來。

### 頁面如何設定自己的 Topbar

```tsx
"use client";
import { useSetPageHeader } from "@/components/page-header-context";

export default function WorkorderPage() {
  useSetPageHeader({
    title: "維修工單",
    tabs: [
      { label: "全部", href: "/service/workorders" },
      { label: "進行中", active: true },
    ],
    breadcrumb: [
      { label: "維修管理", href: "/service/appointments" },
      { label: "維修工單" },
    ],
    hideSearch: false,
  });
  return <div>...</div>;
}
```

### 權限（Permission）機制（未來接 RBAC）

每個 `ModuleDef` 可帶一個 `permission` key。現階段 registry 先紀錄欄位；demo 階段全開放。

### Stitch HTML 與共用 shell 的分工

- ✅ **畫面主體內容**：照 design pattern + 設計稿做
- ❌ **Sidebar / Topbar / Rail**：不照抄 Stitch，改用共用 shell
- ✅ **新模組 / 新頁面**：只改 `src/lib/modules.ts` + 對應 `page.tsx`

### 一頁多目錄（別名頁 / 重複利用入口）規範（MANDATORY）

> **情境**：同一個功能頁面要在不同 module / 目錄底下都有入口（例：「料件主檔」既屬進銷存，也要出現在「會計 / List 主檔」下叫「料號商品」）。

**鐵則：重複利用同一頁，不要複製頁面、不要新 route、不要做成會跳目錄的捷徑。**

**怎麼做（只做這一件事）**：在 `nav_nodes` 加一個入口 node，`page_kind='react_route'`、`href` 直接指向那頁的 **canonical URL**（既有的那一個，例 `/parts/setup/items`）。雙 brand 各一筆。**不寫任何新 code、不開 catch-all、不複製元件**。

**為什麼點了 sidebar 不會跳到別的 module**：active module 解析已內建 **client-side stickiness**——

- `src/lib/nav/helpers.ts` 的 `resolveModuleCandidates()` 對「同一個 href 被多個 module 宣告」回**所有平手候選**（canonical 優先當冷啟動預設），不再硬擇一。
- `src/components/nav-provider.tsx` 的 `NavProvider` 記住「進入別名頁前所在的 module」，平手時**留在那個 module**。語意 = 「從哪個入口點進別名頁，sidebar 就留在那個入口的路徑下」。
- 元件一律透過 `useActiveModule()`（`src/lib/use-active-module.ts`）或 `useNav().activeModule` 讀 active module，**不要自己用 `usePathname()` + `resolveModuleFromPathname()` 重算**（那會破壞 stickiness、別名頁又會跳走）。

**成立的前提 / 邊界**：

- 別名入口和 canonical 入口指向**同一個 URL**——所以網址只有一份、頁面只有一份、list/detail 都走 canonical path。stickiness 只改 sidebar 的視覺歸屬，不改網址。
- 因此**頁面元件內 hardcode 的路徑（如 `items-board.tsx` 裡的 `/parts/setup/items` 篩選/分頁/detail link）維持 canonical 即可，不必參數化**。
- 直接貼網址冷啟動進別名頁 → 歸 canonical module（沒有來源 context 可循，合理）。
- 非別名頁（單一候選）行為完全不變。

**禁止**：

- ❌ 為了「在另一個目錄出現」複製一份 `page.tsx` / `_components`
- ❌ 開新 route（`/n/{id}` catch-all、`/accounting/items` 之類）render 同內容
- ❌ 把別名做成 `redirect()` 到 canonical（會跳目錄、sidebar 也跟著跳）
- ❌ 在元件內自己 `resolveModuleFromPathname(usePathname())` 重算 active module

---

## Stitch Inline 模式（現役）

大多數尚未升級的頁面用 server component fs-read `public/stitch/{id}.body.html` + `dangerouslySetInnerHTML` 內嵌進 React，共用專案 Tailwind tokens。`*.body.html` 由 `scripts/strip-stitch-chrome.py` + `scripts/extract-stitch-bodies.py` 處理 Stitch 原始 HTML 而來（重新下載 Stitch HTML 後必須依序重跑這兩支 script，否則會出現雙層 sidebar 套娃）。

要「對資料、加互動、接 API」的頁面 → 升級到下面的 Design Pattern。

### RWD 側邊欄

- `SidebarContext` 提供 `collapsed` state（`src/components/sidebar-context.tsx`）
- 初始值依 `matchMedia("(max-width: 768px)")`：桌機展開、行動裝置預設收合
- Topbar 左側有 hamburger toggle（menu ↔ menu_open）
- PagesPanel 收合時 `-translate-x-full` 滑出畫面，`<main>` `ml-14` 只留 ModuleRail
- 行動裝置展開時顯示 backdrop（md: 以下），點擊收回

---

## 🧩 資料存取架構（POC 階段慣例 — MANDATORY）

> **新功能 / 新頁面一律走 `spec-to-feature` skill**（在 `.claude/skills/spec-to-feature/`）。拖 Stitch HTML / 貼 URL / 文字描述都認 — 5 階段：結構分析 → 架構提案 → 拍板 → 落地 → 驗證。

### 三個演員

```
UI 頁面（src/app/**/*.tsx）
       │ import & 呼叫
       ▼
Domain Helper（src/domain/*.ts）   ← 業務動作的單一入口、實作可隨時換
       │ 內部寫法自由：直連 / RPC / server action
       ▼
Supabase / Postgres                ← Typed core columns + metadata jsonb
```

Domain Helper **不過網路、不是 endpoint**，是 import 進來的純 TS function、跟 UI 同 process。零 round-trip 成本。

### 三件套

**1. Domain Helper（facade）**：每個業務領域一個檔（`org.ts` / `procurement.ts` / `inventory.ts` / `rules.ts`…），UI 永遠 `import { addStore } from '@/domain/org'`。Helper 內部今天直連 supabase、明天改 RPC、後天改 server action — UI 一行不動。

**2. Typed Core + JSONB Metadata**：每張表都加 `metadata jsonb DEFAULT '{}'::jsonb`。

```sql
CREATE TABLE <entity> (
  id uuid PRIMARY KEY,
  brand_id text,
  -- typed core: 穩定、會被 RLS / FK / 報表用
  name text, code text, is_active boolean, ...
  -- jsonb metadata: 變動中、單頁專用、純顯示
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
```

升降級規則：
- 形狀穩 / 報表會用 / 要 index / 要 FK → typed column
- 形狀還在變 / 單頁專用 / 純顯示 → metadata jsonb
- metadata 某 key 被三頁以上用 → 一條 ALTER TABLE promote 成 typed column（domain helper 內部把它從 rest 拆出來，UI 不動）

**3. 規則類用 `business_rules` 一張打天下**：採購權限規則 / 盤點回傳規則 / 告警階層 / ABC 分類 全用同一張表 + `rule_kind` + `config jsonb`。詳見 `.claude/skills/spec-to-feature/references/architecture.md`。

### 唯一紀律（天條 — 無例外）

> **任何 UI / page / component / hook 都禁止 `import { createClient } from '@/lib/supabase/...'`。所有讀寫只透過 `@/domain/*` helper。**

**包含但不限於**：
- `/parts/*`（進銷存模組）
- `/admin/*`（即使是「ERP 核心模組」、即使是後台 admin 工具，**沒有例外**）
- `/sales/*` / `/service/*` / `/inventory/*` / `/usedcar/*` / `/delivery/*` / `/group/*` 等業務頁
- `feedback/*` / `einvoice/*` / `csi/*` / `tools/*` / `pos/*` 等 workspace 頁
- Server component 撈下拉資料、Client component 觸發 mutation、`new/page.tsx` 撈 form 候選清單 — 一律走 helper

**為什麼 admin 沒例外**：admin / ERP 核心反而是改 schema 最頻繁的地方（加欄位、改業務規則、推 LINE / 寫 audit）— helper 抽象的收益**更大**、不是更小。第一版直接 supabase 看似省事，等加第二個業務副作用時 N 個 page 都要追改。

POC 階段純靠紀律、不加 lint guard。Domain helper 內部自己 import supabase 是 OK 的（那是它的工作）。

**落地必跑 audit**（commit 前）：

```bash
grep -rn "@/lib/supabase" "src/app/(workspace)" src/components 2>/dev/null
# 預期：0 hit。出現任一行就立刻包進對應的 @/domain/* helper、UI 改 import。
```

### 既有 server actions 處置

`src/lib/master-data/org-actions.ts` 等既有 server actions **不刪、不強用**。新建頁面走 domain helper 直連 supabase；helper 升級到「需要副作用」階段（推 LINE / 跨表事務 / 業務規則驗證）才 reuse 既有 action。

### 不寫什麼

- ❌ 不寫 zod schema（POC 階段；type 靠 `mcp__plugin_supabase__generate_typescript_types`）
- ❌ 不寫 ESLint guard 擋直連（純靠紀律）
- ❌ 不每個規則類型開一張表（全走 `business_rules`）
- ❌ 不為了 future-proof 全部欄位 typed（變動中的丟 jsonb）

---

## 🎨 Design Pattern — List View / Page View（MANDATORY）

> **本專案以後所有 List View / Page View 一律照這份規格做**。Canonical 範本在 `parts/setup/items` —— 列表頁 `(workspace)/parts/setup/items/_components/items-board.tsx`，詳情/編輯頁 `(workspace)/parts/setup/items/[id]/_components/item-detail-view.tsx`。新模組的 list / detail 直接拷貝這兩支來改，不要重起爐灶。

### 共用 Design Tokens

```
品牌主色（深藍，主操作 / focus）            #1A3A5C   hover #0F2A45
新增 / 確認綠（建立、儲存）                  #0F6E56   hover #0a5742
危險紅（刪除、停用 banner、必填提示）         #CC0000
危險紅淺底                                  #FDECEA   border #F5AEAD   hover #fbdcd9
警告 / 編輯模式 amber                        bg #FDF3E3   text #854F0B
成功綠（啟用 chip / 成功 banner）            bg #EAF3DE   text #3B6D11
資訊藍 chip（管控等級 B 類、副標）            bg #EAF4FB   text #185FA5
副標藍 / hover                               #185FA5
中性灰中（停用 chip 底）                     bg #F2F2F2   text #6B6A68
邊框灰（卡片 / 表格）                        #EEECE6
邊框灰（input / button）                     #D5D3CB   hover #9A9890
背景奶油（filter section header / spec 列）   #F8F7F4
主要文字 / 標題                              #2C2C2A
次要文字                                    #5A5955
弱化文字 / placeholder / 元資訊                #9A9890
管控等級 chip：A=red(#FDECEA/#CC0000) · B=amber(#FDF3E3/#854F0B) · C=teal(#E8F5F0/#0F6E56) · D=blue(#EAF4FB/#185FA5) · 預設 navy(#EBF3FF/#1A3A5C)
```

字級階梯（**所有 list / detail 都用這套，不要再自己訂**）：

```
頁面 H1                           text-[16px] font-semibold
頁面 caption / 副標                 text-[12px] text-[#9A9890]
卡片 / section header              text-[13px] font-semibold
表格欄表頭                          text-[11px] text-[#9A9890]
表格內文                           text-[12px] / 12.5px
chip / 角標                        text-[11px]   inline-flex items-center px-1.5 py-0.5 rounded-md
KV label                          text-[11px] text-[#9A9890]
KV value                          text-[12.5px] text-[#2C2C2A]
button (filter/toolbar/CRUD)       h-[30px] text-[12.5px]   pill 用 rounded-full、長條操作用 rounded
button (table 列內 / toolbar 副)    h-[26px] text-[11.5px]
input / select                    h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]
```

頁面整體：`<main className="px-6 py-5 space-y-3">` — 統一 padding、區塊間隔。

### List View 規格（範本：`/parts/setup/items`）

由上到下 **5 層結構**，每層的 class 都是 spec、不要漂移：

```
1. Page Header     ─ 標題 + Sprint 章節 chip + 副標（單行）
2. Banner（可選）   ─ 操作回饋（成功 / 失敗）
3. Filter Bar      ─ 白卡片：左 4–6 個篩選欄位、右靠齊 [查詢][重置][+ 新增]
4. Toolbar         ─ 左「共 X 筆…」、右靠齊次要動作（管理下拉選單 / 匯出 / 批次匯入）
5. Table           ─ 白卡片：sticky header、行高 ~36–44、最右一欄 [編輯][停用][刪除]
```

**1. Page Header**

```tsx
<header className="flex items-center gap-2.5">
  <h1 className="text-[16px] font-semibold text-[#2C2C2A]">{TITLE}</h1>
  <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">{SPRINT}</span>
  <span className="text-[12px] text-[#9A9890]">{CAPTION}</span>
</header>
```

**3. Filter Bar**

```tsx
<section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
  <div className="flex gap-2 items-end flex-wrap">
    {/* 篩選欄位：每欄 <div className="flex flex-col gap-1"><label className="text-[11px] text-[#9A9890] font-medium">…</label><select … /></div> */}
    <div className="flex gap-2 ml-auto">
      <button /* 查詢 */ className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60">查詢</button>
      <button /* 重置 */ className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">重置</button>
      <button /* + 新增 */ className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50">＋ 新增{NOUN}</button>
    </div>
  </div>
</section>
```

`查詢` 在 pending 時改文字為「查詢中⋯」+ disabled。

**4. Toolbar**

```tsx
<div className="flex items-center gap-2">
  <span className="text-[12px] text-[#9A9890]">
    共 <b className="text-[#2C2C2A]">{TOTAL}</b> 筆… （顯示 <b>{SHOWN}</b> 筆）
  </span>
  <div className="ml-auto flex gap-1.5">
    {/* 次要動作一律 h-[26px]/text-[11.5px]/白底/灰邊 */}
  </div>
</div>
```

**5. Table — 用 `<DataGrid>` 元件**

> ⚠️ **不要再手刻 `<table>`**。所有 list view 的表格段一律用 `@/components/data-grid` 的 `<DataGrid>`，元件提供統一的 column visibility（user 可自選顯示哪些欄位、偏好存 localStorage）、header 點擊排序（asc → desc → none）、Excel 匯出（chip 自動解成純文字）、可選 inline edit cell、可選 Excel 匯入。視覺 token（字級、chip、button）跟手刻版完全一致，遷移成本只是把 `<thead>/<tbody>` 改寫成 `columns: DataGridColumn<T>[]`。

```tsx
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

const columns: DataGridColumn<MyRow>[] = [
  {
    id: "code",            // 唯一 id，用於 column visibility 的 localStorage key
    header: "代碼",         // 純文字 header（也用於 Excel 匯出欄名）
    width: 130,             // 預設寬度 px
    hideable: false,        // 主鍵概念，禁止隱藏（user 隱藏後找不到 row）
    cell: (r) => (          // 顯示用的 React node
      <span className="font-mono font-semibold text-[#1A3A5C]">{r.code}</span>
    ),
    exportValue: (r) => r.code,    // Excel 匯出時的純值（沒給就匯出空字串）
    sortValue: (r) => r.code,       // 排序用的 primitive（沒給時 fallback 到 exportValue）
  },
  {
    id: "name",
    header: "名稱",
    cell: (r) => r.name,
    exportValue: (r) => r.name,
    editable: {                     // 開啟 inline edit（cell 可點擊變 input）
      type: "text",                 // 'text' 或 'textarea'
      getValue: (r) => r.name,
      onSave: async (r, value) => {
        const v = value.trim();
        if (!v) return { ok: false, error: "名稱不可為空" };
        const res = await updateAction(r.id, { name: v });
        if (res.ok) {
          showBanner({ ok: true, msg: "✓ 已更新" });
          router.refresh();
        }
        return res;
      },
    },
  },
  // ... 其他欄位
];

<DataGrid
  columns={columns}
  data={rows}
  rowKey={(r) => r.id}
  persistKey="admin/master-data/{slug}"   // 必填，column visibility 存這個 key
  exportFileName="my-list"                  // Excel 檔名（不含 .xlsx）
  emptyMessage="沒有符合條件的資料"
  disabled={isPending}                       // 整體禁用 + 半透明
  rowActionsWidth={210}
  rowActions={(r) => (
    <>
      <button onClick={() => openEdit(r)}    className="...">編輯</button>
      <button onClick={() => toggleActive(r)} className="...">{r.is_active ? "停用" : "啟用"}</button>
      <button onClick={() => removeRow(r)}    className="...">刪除</button>
    </>
  )}
  // 不傳 onImport：右上不會出現「⬆ 匯入 Excel」按鈕；想開放匯入再傳。預設 master data 不開放，避免 user 把資料亂改。
/>
```

**`DataGridColumn<T>` 欄位**

| 欄位 | 必填 | 說明 |
|------|------|------|
| `id` | ✓ | 欄位唯一 id（column visibility / 排序狀態的 key） |
| `header` | ✓ | 表頭純文字（也是 Excel 匯出欄名、column chooser 顯示名） |
| `cell` | ✓ | 顯示用 React node（chip、link、formatter） |
| `width` |  | 欄寬 px |
| `align` |  | `left` (預設) / `right` |
| `hideable` |  | 預設 `true`；設 `false` 時 user 不能在 column chooser 裡隱藏 |
| `defaultHidden` |  | 預設 `false`；設 `true` 時第一次載入隱藏（user 仍可手動開啟） |
| `sortable` |  | 預設 `true`；設 `false` 時 header 不可點排序（例如圖片欄、多行 chip 欄） |
| `sortValue` |  | 排序用的 primitive，沒給時 fallback 到 `exportValue`，再 fallback 到 `null` |
| `exportValue` |  | Excel 匯出時的純值，沒給就匯出空字串 |
| `editable` |  | 開啟 inline edit；spec：`{ type: 'text' \| 'textarea', getValue, onSave }`，`onSave` 回傳 `{ ok, error? }` |

**`DataGridProps<T>` 重要 props**

| prop | 必填 | 說明 |
|------|------|------|
| `columns` | ✓ | 欄位定義 |
| `data` | ✓ | 列資料 |
| `rowKey` | ✓ | `(row) => string` |
| `persistKey` | ✓ | column visibility 存 `localStorage["data-grid:v1:" + persistKey]`；命名建議用 route path（`admin/accounting/dimensions`） |
| `exportFileName` |  | Excel 檔名（不含 .xlsx），預設用 persistKey |
| `onImport` |  | 不傳就不顯示匯入按鈕；傳了會顯示「⬆ 匯入 Excel」並 callback rows |
| `rowActions` |  | 列尾操作 React node；傳了會多出「操作」欄 |
| `rowActionsHeader` / `rowActionsWidth` |  | 操作欄表頭 / 寬度（預設 `操作` / 210） |
| `emptyMessage` |  | 沒資料時的訊息 |
| `disabled` |  | `true` 時整個 grid `pointer-events-none opacity-60`（搭配 `useTransition` 的 `isPending`） |
| `pagination` |  | `{ page, pageSize, totalCount, onPageChange }` — 不傳就沒分頁；傳了會在表格底部顯示分頁列、頁碼存 URL `?page=N`，sort 改成只作用於當頁（footer 會顯示 hint） |

列內標籤（chip）規範（caller 在 `cell` 內自己渲染）：
- **管控等級**：依 `accent` 套色票表 token（A 紅 / B 黃 / C 綠 / D 藍）
- **狀態**：啟用 = `bg-[#EAF3DE] text-[#3B6D11]`；停用 = `bg-[#F2F2F2] text-[#6B6A68]`；都加 `whitespace-nowrap`
- **品類 / 區段**：`bg-[#EEF4FB] text-[#185FA5]`

列尾操作 3 顆 button（左到右固定順序，caller 在 `rowActions` 內自己渲染）：
- **編輯** — 白底灰邊 (`bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`)
- **停用 / 啟用** — 同上
- **刪除** — 紅底紅字 (`bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]`)

全部 `h-[26px] px-2.5 rounded text-[11.5px]`。

**Inline edit 行為**

- 點 cell → 變成 input；Enter / blur 儲存、Esc 取消
- 儲存中 cell 顯示「儲存中⋯」、disabled
- 失敗顯示紅底錯誤泡泡在 cell 下方，再點別處或修值消失
- 沒改值（值跟原本相同）直接收掉、不打 server action

預設只把「安全欄位」開 inline edit（純字串、無外鍵、無系統相依）。`code` / `reference_table` / 外鍵 / segment script id 這類仍走 Modal。複雜場景（dropdown、lookup、日期）目前沒支援，需要時再擴元件。

**分頁規範（>100 row 必開）**

> 量級判斷：query 有可能撈超過 100 row（master data 累積、長期 transactional 列表）→ **必須開 server-side pagination**，不要靠 client-side `.limit(2000)` 硬撐。365 row 的 COA 沒分頁時 TTFB 是 50 row 的 4.4×、sort 互動 ~200ms 卡頓。

實作 SOP（範本：`/admin/accounting/coa`）：

1. **Query layer**（`src/lib/{domain}/queries.ts`）— 加 `options: { page?, pageSize? }` 參數，supabase 用 `.range(from, to)` + `.select(..., { count: 'exact' })`：

```ts
export const COA_PAGE_SIZE_DEFAULT = 50;

export async function listFoo(filters, options: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? COA_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, count } = await q.order(...).range(from, to);
  return { rows: data ?? [], totalCount: count ?? 0 };
}
```

2. **page.tsx (server)**：讀 `searchParams.page`、傳 `{ page, pageSize }` 給 query、轉 `page` / `pageSize` 給 board。
3. **board.tsx (client)**：把 `pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}` 傳給 `<DataGrid>`；`goToPage` 推 URL 帶 `?page=N`。filter 改變時一律 reset 到 `page=1`（總數變了，停在第 N 頁可能空）。
4. **不要動 DataGrid 內建 sort**：v1 sort 是 client-side per-page，footer 會自動顯示「（排序僅作用於當頁）」hint。如果需要全集排序，要把 sort state 也推到 URL，由 server query.order 做 — 屆時擴元件。

### Page View 規格（範本：`/parts/setup/items/[id]`）

由上到下 **6 層結構**：

```
1. Breadcrumb + CRUD Pill Bar        ─ 同一橫列：左麵包屑 + 模式 badge、右靠齊 CRUD pill
2. Title Card                        ─ 白卡片：左標題 caption + H1 + chip 列 + 動作 pill 列；右圖片框 260×120
3. ▼ 區段卡片（基本資料 / 分類設定）   ─ 灰底 header、白底 KV grid（3 欄）
4. Tabs（採購 / 庫存 / 銷售 / …）    ─ 上 rounded-t-lg 的 tabs row、下 rounded-b-lg 的內容區
5. Tab Content                       ─ 內含 sectionCard（子卡）2 欄 grid
6. Modals / Banner                   ─ 底層 fixed
```

**1. Breadcrumb + CRUD Pill Bar**

```tsx
<div className="flex items-center gap-3 flex-wrap">
  <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
    <Link href="/.../{LIST}" className="hover:text-[#185FA5]">{LIST_LABEL}</Link>
    <span>›</span>
    <span className="text-[#5A5955] font-mono">{CODE}</span>
    {/* 模式 badge：編輯模式 / 建立模式 — bg-[#FDF3E3] text-[#854F0B] */}
  </div>
  <div className="ml-auto flex items-center gap-1.5">
    {/* CRUD pill — 全部 h-[30px] px-4 rounded-full text-[12px]，下面 5 顆 */}
  </div>
</div>
```

CRUD pill 顏色與順序（**view mode 從左到右固定**）：

| 按鈕 | 用途 | className |
|---|---|---|
| 返回列表 | 回 list | `bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm` |
| 新增 | 進 create mode（同頁就地清空，**不跳新頁**） | `font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50` |
| 修改 | 進 edit mode | `font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50` |
| 🖨️ 列印（可選） | 只在「可列印單據」出現，詳見 §📄 列印 / PDF Pattern | `bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm` |
| 刪除 | 危險動作 | `bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50` |
| 停用 / 啟用 | 切 is_active | `bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50` |

edit mode 換成 `[儲存變更（綠）][取消（白）]`；create mode 換成 `[取消（白）][建立並開啟（綠）]`。列印按鈕只在 view mode 出現、edit/create mode 不顯示（避免列印到未存的草稿）。

⚠️ **「新增」一律不開新頁**：點下去 → 同一個 PageView 切到 create mode、欄位清空、麵包屑顯示「{LIST} › 新增{NOUN} [建立模式]」、tabs 與相依資料區塊隱藏、儲存後 `router.push` 到新 id 的 detail page。詳見 `item-detail-view.tsx` 的 `creating` state 實作。

**2. Title Card**

```tsx
<header className="bg-white border border-[#EEECE6] rounded-lg p-4">
  <div className="flex items-stretch gap-4">
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      <div>
        <div className="text-[11px] tracking-wider text-[#9A9890]">{KIND_CAPTION}</div>
        <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">{NAME}</h1>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
          <span className="font-mono text-[#5A5955]">{CODE}</span>
          {/* + 管控 chip / 啟用 chip / 品類 chip — 都是 px-1.5 py-0.5 rounded-md text-[11px] */}
        </div>
      </div>
      {/* 動作 pill 列：h-[26px] px-3 rounded-full text-[11.5px]；主動作深藍底，其餘白底灰邊 */}
    </div>
    <div className="shrink-0">
      {/* ItemImageUploader / placeholder：260×120，rounded-lg */}
    </div>
  </div>
</header>
```

create mode 下 H1 顯示「（未命名{NOUN}）」、chip 列顯示「— [尚未建立 amber]」、圖片改為虛線 placeholder：

```tsx
<div className="w-[260px] h-[120px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] flex items-center justify-center text-[12px] text-[#9A9890]">
  建立後可上傳圖片
</div>
```

**3. 區段卡片（KV grid）**

```tsx
<section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
  <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
    <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ {SECTION_TITLE}</span>
  </header>
  <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
    {/* <Kv label="…" value={…} /> */}
  </div>
</section>
```

`<Kv>` 元件 API：`{ label, value, mono?, small? }` — label 11px 灰、value 12.5px 主色，`mono` 套等寬、`small` 11.5px 次色。

**4. Tabs**

```tsx
<div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto" id="tab-content">
  <div className="flex border-b border-[#EEECE6]">
    {/* 每個 tab：px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0
        active：bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px
        inactive：text-[#5A5955] hover:bg-[#F8F7F4] */}
  </div>
</div>
<div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
  {/* 內容用 grid grid-cols-1 md:grid-cols-2 gap-3 + sectionCard 子卡片 */}
</div>
```

子卡片 `sectionCard(title, body)`：

```tsx
<section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
  <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
    <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
  </header>
  <div className="px-4 py-3">{body}</div>
</section>
```

⚠️ **建立模式下整個 tabs 區塊隱藏**（避免上一筆殘留資料污染畫面）；改用一行提示「建立後將跳轉到該{NOUN}的詳情頁，可進一步維護⋯」。

**6. Banner（toast）**

```tsx
<div className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50
  ${ok ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
       : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"}`}>{msg}</div>
```

成功 banner 2.2s 自動消失、失敗 banner 留著等使用者讀。

### 互動規範（搭配 CLAUDE.md §UX 互動規範）

- 所有寫入按鈕：pending 時 `disabled` + 文字換成「儲存中⋯」/「建立中⋯」/「查詢中⋯」、外層加 `pointer-events-none opacity-60`
- 樂觀更新：成功 banner 後 2.2s 自動關閉；失敗 banner 不自動關
- 編輯模式視覺暗示：頂端模式 badge（amber）+ section 卡 pending 時整體變淡
- create mode 後成功 → `router.push` 到新 id 的 detail page、不停在原來那筆

### 怎麼開新模組

1. 拷貝 `(workspace)/parts/setup/items/_components/items-board.tsx` → 新 list 元件、改 `columns: DataGridColumn<T>[]` + filter
2. 拷貝 `(workspace)/parts/setup/items/[id]/_components/item-detail-view.tsx` → 新 detail 元件、改 KV grid + tabs
3. **不要動色碼、不要動字級、不要動按鈕順序** —— 上面那張色票就是規格
4. 表格段一律 `<DataGrid>` —— 不要再寫 `<table>`、不要再自己刻 column visibility / sort / Excel 匯出
5. 自由的部分只有：filter 欄位數、`columns` 內容、KV 欄、tab 數、tab 內容、`<Kv>` 排列

碰到設計稿（Stitch / Figma）跟這份規格衝突 → 規格贏，設計稿上的 sidebar/topbar/CRUD 一律改用本規格的 token；只有頁面主體內容才照設計稿做。

---

## 📄 列印 / PDF Pattern（MANDATORY）

> **適用範圍**：所有可列印的「單據型」頁面 — 採購單 / 銷售訂單 / 報價單 / 維修工單 / 領料單 / 調撥單 / 進貨單 / 出貨單 / 退貨單 / 對帳單。簽核 / 通知 / 設定類頁面**不需要列印**，不必套這套。

### 一、核心原則 — Print Route Pattern

列印用的版面**獨立成一個路由**，跟 workspace shell（sidebar / topbar / breadcrumb）完全脫鉤。檔案位置在 `src/app/print/{slug}/[id]/`，**不在** `(workspace)` group 底下，所以不會繼承 PageHeaderContext / ScopeContext 之外的 UI chrome。

```
src/app/print/{slug}/[id]/
  ├── page.tsx                          ← server component；撈資料 + 權限檢查（螢幕預覽用）
  └── _components/{slug}-printable.tsx  ← client component；渲染 + 右上浮動工具列

src/app/api/pdf/[slug]/[id]/route.ts    ← Server PDF API（headless chromium 對 print route 截圖、回 PDF blob）

src/lib/pdf/
  └── render.ts             ← chromium launch / page.pdf 抽出共用 helper

src/components/print/
  ├── print-shell.tsx       ← 共用文件外殼（brand logo / 文件標題 / 單號 / 客戶區）
  ├── print-meta-grid.tsx   ← 上方 KV grid（單號、日期、客戶、業務員⋯）
  ├── print-table.tsx       ← 表格元件（thead 跨頁 repeat、斑馬紋）
  ├── print-totals.tsx      ← 金額小計區（含稅 / 未稅 / 折扣 / 總計）
  ├── print-signatures.tsx  ← 簽核欄（申請人 / 主管 / 倉管 / 客戶簽收）
  ├── print-toolbar.tsx     ← 螢幕版浮動工具列「下載 PDF」「關閉」(@media print 自動隱藏)
  └── print.css             ← @page / @media print 全域規則（含 Google Fonts Noto Sans TC import）
```

### 二、技術選擇 — `puppeteer-core` + `@sparticuz/chromium`（server-side）

**為什麼不用 `window.print()`**：瀏覽器原生「另存為 PDF」會強制在每頁印 URL header / 頁碼 / 時間 footer（user 可手動取消但每次都要勾、印表機驅動還可能強塞），業務單據不能用。

**走 server-side**：

- `puppeteer-core@^23` + `@sparticuz/chromium@^131`（stripped Chromium，bundled 在 npm 套件裡、不需要 Dockerfile）
- `/api/pdf/[slug]/[id]/route.ts` 是通用 endpoint，slug 走 whitelist (`ALLOWED_SLUGS`)
- chromium 啟動 → forward auth cookie → page.goto(`/print/{slug}/{id}`) → `page.pdf({ displayHeaderFooter: false, printBackground: true })` → 回 PDF blob

**字體**：@sparticuz/chromium 不含任何 CJK 字體，中文會出豆腐。靠 `print.css` 的 `@import url('...Noto+Sans+TC...')` 拉 Google Fonts，render 時 chromium 自動 fetch。

**Deploy 不用改 Zeabur 設定**：@sparticuz/chromium 把 chromium binary 包進 npm 套件 + 靜態連結 deps，`npm install` 完直接能跑，不用 Dockerfile / apt install。

⚠️ **預覽 vs 列印分開** — print route 載完**只顯示 A4 預覽**（瀏覽器內），不自動觸發任何動作。使用者要 PDF 時點右上 `<PrintToolbar>` 的「下載 PDF」→ 走 server-side API → 回乾淨 PDF（**無 browser chrome / 無 URL header**）→ 在新 tab 用瀏覽器內建 PDF reader 開，從那邊可以再列印實體機（PDF reader 列印也不會有 URL header）。

### 三、列印路由結構

**`page.tsx` (server component)**：

```tsx
// src/app/print/quotation/[id]/page.tsx
import { getQuotationForPrint } from "@/domain/sales";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission, PERMISSIONS } from "@/lib/rbac/policies";
import { QuotationPrintable } from "./_components/quotation-printable";

export const dynamic = "force-dynamic";

export default async function QuotationPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="p-8 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  // 列印權限 = 詳情頁讀取權限。沒額外的「列印 only」權限
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return <main className="p-8 text-[14px] text-[#CC0000]">無權限列印此單據</main>;
  }
  const quotation = await getQuotationForPrint(id);
  if (!quotation) {
    return <main className="p-8 text-[14px] text-[#CC0000]">找不到報價單 {id}</main>;
  }
  return <QuotationPrintable data={quotation} />;
}
```

⚠️ **沒有 `(workspace)` group 包住，所以沒 topbar / sidebar / brand logo header** — 這正是想要的（列印頁要乾淨）。

**`_components/{slug}-printable.tsx` (client component)**：

```tsx
"use client";

import { PrintShell, PrintMetaGrid, PrintTable, PrintTotals, PrintSignatures, PrintToolbar } from "@/components/print";

export function QuotationPrintable({ data }: { data: QuotationForPrint }) {
  // 不 auto window.print() — 預覽歸預覽，user 自己點右上「下載 PDF」走 server-side API
  return (
   <>
    <PrintToolbar pdfHref={`/api/pdf/quotation/${data.id}`} />
    <PrintShell
      brand={data.brand}
      docTitle="報價單 QUOTATION"
      docNo={data.quote_no}
      docDate={data.created_at}
      pageNumber  /* 自動印「第 X 頁 / 共 Y 頁」 */
    >
      <PrintMetaGrid
        cols={2}
        items={[
          { label: "客戶", value: data.customer.name },
          { label: "聯絡電話", value: data.customer.phone },
          { label: "業務員", value: data.sa.name },
          { label: "報價日期", value: data.quote_date },
          { label: "有效期限", value: data.expires_at },
        ]}
      />

      <PrintTable
        columns={[
          { header: "項次", width: 40 },
          { header: "品名 / 規格", flex: 1 },
          { header: "數量", width: 60, align: "right" },
          { header: "單價", width: 90, align: "right" },
          { header: "小計", width: 100, align: "right" },
        ]}
        rows={data.lines.map((l, i) => [
          i + 1,
          `${l.item_name}\n${l.spec ?? ""}`,
          l.qty,
          formatNT(l.unit_price),
          formatNT(l.subtotal),
        ])}
      />

      <PrintTotals
        items={[
          { label: "未稅小計", value: formatNT(data.subtotal_excl_tax) },
          { label: "稅額 5%", value: formatNT(data.tax) },
          { label: "折扣", value: formatNT(-data.discount) },
        ]}
        grandTotal={{ label: "總計含稅", value: formatNT(data.total) }}
      />

      <PrintSignatures
        roles={["業務員", "業務主管", "客戶簽收"]}
      />
    </PrintShell>
  );
}
```

### 四、共用元件規範

#### `<PrintShell>` props

| prop | 必填 | 說明 |
|---|---|---|
| `brand` | ✓ | `{ key, displayName, logoUrl }` — 自動套對應品牌 logo |
| `docTitle` | ✓ | 文件中文+英文標題（例：「報價單 QUOTATION」） |
| `docNo` | ✓ | 單號（會印在右上角大字、條碼可選） |
| `docDate` | ✓ | 開立日期 |
| `pageNumber` |  | true 時自動印「第 N 頁 / 共 M 頁」on footer（CSS counter-increment） |
| `legalFooter` |  | 公司抬頭 / 統編 / 地址 / 電話（沒給就吃 `subsidiary` context） |
| `children` |  | 文件主體（用 `<PrintMetaGrid>` / `<PrintTable>` / `<PrintTotals>` / `<PrintSignatures>` 拼） |

#### Print CSS 規範

```css
/* src/components/print/print.css */
@page { size: A4; margin: 15mm 12mm 18mm 12mm; }

@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  thead { display: table-header-group; }   /* 表頭跨頁自動 repeat */
  tfoot { display: table-footer-group; }
  tr, .keep-together { page-break-inside: avoid; }
  .page-break-before { page-break-before: always; }
  .page-break-after { page-break-after: always; }
}

/* 字級規範 — 列印用 pt 不用 px，跟印表機解析度脫鉤 */
.print-doc-title { font-size: 16pt; font-weight: 700; }
.print-meta-label { font-size: 9pt; color: #5A5955; }
.print-meta-value { font-size: 10.5pt; color: #1A1A1A; }
.print-table-header { font-size: 9.5pt; font-weight: 600; background: #F8F7F4; }
.print-table-cell { font-size: 10pt; }
.print-totals-value { font-size: 11pt; font-weight: 600; }
.print-grand-total { font-size: 14pt; font-weight: 700; color: #1A3A5C; }
.print-signature-label { font-size: 9pt; color: #5A5955; }
```

⚠️ **單位用 pt 不用 px**：印表機解析度是 dpi 不是 css px，用 pt 才能跨印表機一致。

### 五、Page View 整合 — CRUD pill bar 加列印按鈕

```tsx
{/* view mode、且這個單據型頁面是可列印的 */}
{!editing && !creating && isPrintable && (
  <button
    onClick={() => window.open(`/print/${PRINT_SLUG}/${id}`, "_blank")}
    className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm inline-flex items-center gap-1"
    title="列印 / 另存 PDF"
  >
    <span className="material-symbols-outlined text-[14px]">print</span>
    列印
  </button>
)}
```

**`PRINT_SLUG` 命名規則**：kebab-case 單數名詞，跟 detail page slug 解耦（detail 在 `/parts/purchase/orders/[id]`、print 在 `/print/purchase-order/[id]`）。

| 業務模組 | PRINT_SLUG |
|---|---|
| 採購單 | `purchase-order` |
| 銷售訂單 | `sales-order` |
| 報價單 | `quotation` |
| 維修工單 | `repair-order` |
| 領料單 | `stock-issue` |
| 調撥單 | `stock-transfer` |
| 進貨單 (GRN) | `stock-receipt` |
| 退貨單 | `return-order` |
| 對帳單 | `statement` |

### 六、Domain helper 規範

詳情頁的 `getXxxById(id)` 通常只回單頭資料，**列印需要額外撈關聯資料**（明細列、客戶 contact、業務員姓名、subsidiary 法人資訊⋯）。所以在 helper 加一支 `getXxxForPrint(id)`，一次撈齊。

```ts
// src/domain/sales.ts
export type QuotationForPrint = {
  // 單頭
  id: string;
  quote_no: string;
  quote_date: string;
  expires_at: string;
  // joined
  brand: BrandInfo;
  subsidiary: SubsidiaryInfo;
  customer: { name: string; phone: string; address: string };
  sa: { name: string; phone: string };
  lines: Array<{ item_name: string; spec: string | null; qty: number; unit_price: number; subtotal: number }>;
  // 計算欄
  subtotal_excl_tax: number;
  tax: number;
  discount: number;
  total: number;
};

export async function getQuotationForPrint(id: string): Promise<QuotationForPrint | null> {
  // 一次 query 含 joined customer / sa / lines / subsidiary
  // ⚠️ RLS 跟詳情頁一樣靠 user_has_brand() 把跨 brand 擋掉
}
```

### 七、新增列印頁的 SOP（每張單據 ~30 分鐘）

1. **加 `getXxxForPrint(id)` 到對應 domain helper** — 撈齊單頭 + 明細 + joined 顯示欄位；**型別必含 `id`** 給 PDF API URL 用
2. **建 `src/app/print/{slug}/[id]/page.tsx`** — server component 拉資料 + 權限檢查
3. **建 `_components/{slug}-printable.tsx`** — 用 `<PrintShell>` + `<PrintMetaGrid>` + `<PrintTable>` + `<PrintTotals>` + `<PrintSignatures>` 拼出版面，把 `<PrintToolbar pdfHref={\`/api/pdf/${SLUG}/${data.id}\`} />` 放最外層
4. **PDF API whitelist**：到 `src/app/api/pdf/[slug]/[id]/route.ts` 的 `ALLOWED_SLUGS` set 加新 slug（**不加會回 400**）
5. **在對應 detail-view 加列印按鈕** — `window.open(\`/print/${SLUG}/${id}\`, '_blank')`
6. **手測**：
   - 螢幕預覽：開 `/print/{slug}/{id}` 直接看 A4 版面對不對
   - PDF 下載：點工具列「下載 PDF」→ 開新 tab 看 PDF reader 內容 → **確認沒有 URL header / 頁碼 footer**
   - 中文字：確認 PDF 內中文不是豆腐方塊（沒拉 Google Fonts 或 chromium 沒裝字體會出豆腐）
   - 多頁：找一張行數 > 30 的單據看 thead 跨頁有沒有自動 repeat

### 八、不要做的事

- ❌ 在 print route 留 `<Topbar>` / `<Sidebar>` — 列印就是要乾淨
- ❌ 用 px 標尺寸 — 用 pt，否則跨印表機字級不對
- ❌ 在列印頁加複雜互動（編輯欄位、按鈕展開折疊）— 列印頁是「snapshot」，要互動回 detail 頁做完再列印
- ❌ 走 `window.print()` 產 PDF — 瀏覽器強制印 URL header / 頁碼 footer，業務單據不能用；走 server-side `/api/pdf/{slug}/{id}` 才乾淨
- ❌ 多人共用同一個 print route 但 props 大不同 — 設計上應該是「一張單一條 route」、共用的是 `<PrintShell>` 元件，不是 route
- ❌ Print route 寫資料庫 — print 是純讀，禁止有任何 server action / mutation
- ❌ 沒做 `getXxxForPrint` helper、直接在 print page 拼 query — joined 拼錯會 N+1，集中在 domain helper 一次撈乾淨
- ❌ 新 slug 沒加進 `ALLOWED_SLUGS` 就上線 — PDF API 會回 400，detail page 螢幕版可用但「下載 PDF」按鈕會炸
- ❌ 自己換字體 family 卻沒 import 對應的 @font-face — server chromium 沒任何 CJK 字體，會出豆腐

---

## 🔁 SOP — 「把 X 做成 design pattern」（List View + Page View 升級流程）

> **觸發語**（看到任何一個就跑這條 SOP，不要當成 ad-hoc 改進處理）：
> - 「把 XX 做成 design pattern」「套 design pattern」「design pattern 化」
> - 「把 X 改成標準的 list view + page view」
> - 「會計 / 統計 / master data 的 XX 表」之類具體頁面 + 「改造 / 升級」字眼
> - 指著某張現有的單張 List 表單要求升級
>
> **看到觸發語自動跑下面這條流程，不要反問「要怎麼做」、不要拆開只做一半。**
>
> ⚠️ **「Design Pattern」= List View + Page View 必須一起做、一起交付**：
> - List View 用 `<DataGrid>`（§List View 規格 §5）
> - Page View 是獨立的 `[id]/page.tsx` + `[id]/_components/{slug}-detail-view.tsx`，支援 view / edit / create 三 mode（§Page View 規格）
> - **只升級 list 的 table 段、保留舊 inline edit/create modal、不做 detail page → 不算合規，不要這樣交付**
> - 既有 list-only 頁面（過去沒做 detail）一旦使用者再次提到此頁 + design pattern，**主動補做 detail page**，不要默認「list 升級了就 OK」
>
> 例外（明確列在 §邊界）：純資訊頁可以只做 list 配 readonly KV detail；wizard 類（採購單 / 工單）走 multi-step pattern 不適用本 SOP。其他情況一律 list + detail 雙交付。
>
> **Canonical 範本**：列表 `(workspace)/parts/setup/items/_components/items-board.tsx` ・ 詳情 `(workspace)/parts/setup/items/[id]/_components/item-detail-view.tsx` ・ Server actions `src/lib/parts-setup/item-actions.ts`（Result 型別、不 redirect）。
>
> **參考成品**：
> - `/admin/master-data/supplier-pricing`（2026-05-09 第一份用 SOP 升級的 master-data 頁面）
> - `/admin/accounting/coa`（2026-05-10 第一個用完整 SOP + DataGrid 升級的會計頁面，含 view/edit/create 三 mode detail page）

### Step 0 · 開 worktree（建議）

跨多檔案改動 + 要起新 dev server 試，開 worktree 最乾淨：

```
EnterWorktree name=fix-{slug}
ln -sf <main>/.env.local .env.local      # 必補，否則 Supabase 起不來
npm run dev -- -H 0.0.0.0 -p 3001        # 主目錄佔 3000，worktree 用 3001
```

### Step 1 · 找頁面 + 探 DB schema（5 分鐘）

```bash
# 1a) 找現存的舊 list 在哪
find "src/app/(workspace)/admin/master-data/{slug}" -type f
grep -rn "list{Slug}\|get{Slug}ById" src/lib/master-data/queries.ts
```

```sql
-- 1b) 探資料表欄位 + 既有 row 數（雙 brand seed 都要 > 0，否則 dev 顯示空）
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='{table_name}'
ORDER BY ordinal_position;

SELECT brand_id, count(*) FROM {table_name} GROUP BY brand_id;

-- 1c) unique index 名（mapDbError 23505 翻譯要對得上）
SELECT indexname, indexdef FROM pg_indexes WHERE tablename='{table_name}';
```

### Step 2 · 改寫 server actions 成 `Result<T>` 型別（不 redirect）

舊版多半用 `useActionState` + redirect → 必須改成 client 自控導航的 ok/error pattern，banner / 樂觀更新才做得起來。樣板看 `src/lib/parts-setup/item-actions.ts`。

新檔案 `src/lib/master-data/{slug}-actions.ts` 必出現：

```ts
"use server";
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type {Slug}Input = { /* 業務欄位 */ };

export async function create{Slug}Action(input: {Slug}Input): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.{SLUG}_EDIT);
  // 驗證 → insert → return { ok: true, data: { id } } | { ok: false, error }
}
export async function update{Slug}Action(id: string, patch: Partial<{Slug}Input>): Promise<ActionResult<{ id: string }>> { ... }
export async function set{Slug}ActiveAction(id: string, active: boolean): Promise<ActionResult<{ id: string }>> { ... }
export async function delete{Slug}Action(id: string): Promise<ActionResult<{ id: string }>> { ... }
```

**禁止**：`redirect()` 出現在 action 裡（client 自己決定路由）、`useFormState` form-shape 的回傳。

### Step 3 · 建 `_components/{slug}-board.tsx`（List View）

逐節照抄 `items-board.tsx`、改業務欄位即可：

- `"use client"` + `useTransition`
- Page Header（title + sprint chip + caption）
- Banner（fixed 區塊）
- Filter Bar（左 4–6 欄、右 [查詢][重置][＋ 新增]）— 用 `URLSearchParams` 推 `router.push`，狀態走 server query string
- Toolbar（左「共 N 筆…」、右次要動作如「管理下拉選單」「批次匯入」之類；Excel 匯出 / 欄位選擇器由 `<DataGrid>` 自帶，**不要在外面 toolbar 重複放**）
- Table — **用 `<DataGrid>` 元件（見 §List View 規格 §5）**。不要手刻 `<table>`、不要自己 wire column visibility / 排序 / Excel I/O。
- **Inline Create/Edit Modal**（同一個 `<Modal>`，依 `formMode` 切標題與 submit handler）

樣板裡的 `inputClass` / `labelClass` / `lockedClass` 變數一字不改、UX 互動規範（pending 鎖、文字換進行式）一字不改。

`<DataGrid>` 的 `persistKey` 用 route path（例：`admin/master-data/{slug}`）— 它是 column visibility 的 localStorage key，不要跟別頁衝突。預設**不傳 `onImport`**：master data 不開放前端匯入（亂改主檔風險高、又沒 server validation）；真的要匯入用既有的「批次匯入」TSV paste modal（見 `items-board.tsx`）。

inline editable 欄位選擇原則：
- ✅ 純字串、無外鍵相依、改錯也只是文字錯（如 `name`、`description`、備註）→ 開 `editable`
- ❌ 主鍵 / code / 外鍵欄位 / NetSuite script id / boolean toggle（已有專屬 button）→ 走 Modal，不開 inline

### Step 4 · 建 `[id]/_components/{slug}-detail-view.tsx`（Page View）

逐節照抄 `item-detail-view.tsx`：

- Breadcrumb + CRUD pill bar（**view mode 5 顆**：返回列表 / 新增 / 修改 / 刪除 / 停用啟用）
- 模式 badge（編輯=amber、建立=amber）
- Title card（左標題塊 + chip 列；右 260×120 圖片框，create 時改虛線 placeholder）
- 區段卡片 KV grid（`▼ 基本資料` / `▼ 價格` / `▼ ...` 等 2–4 段，3 欄 grid）
- Tabs（簡單 2–3 個就好；複雜業務再加）
- **同頁 create-mode**（`creating` state）—— 按「新增」不開新頁，整頁切空白、tabs 隱藏、儲存後 `router.push` 到新 id
- Banner fixed 右下、`Kv` helper 小元件

create page (`new/page.tsx`) 直接 reuse 同一個 detail view，傳 `pricing={null}` + `initialMode="create"`。

### Step 5 · Wire 三支 page.tsx

- `page.tsx`（list）— server component 讀 `searchParams`、組 filters、`Promise.all` 撈 rows + lookups → 傳給 board
- `[id]/page.tsx` — 讀 `getXxxById(id)` + lookups → 傳給 detail view
- `new/page.tsx` — 只撈 lookups、`pricing={null}` + `initialMode="create"` → 傳給同一個 detail view

權限檢查：頭兩行 `getCurrentUserAndAdmin()` + `hasPermission(...VIEW)`，沒權限回紅字 main。`canEdit = hasPermission(...EDIT)` 傳給 client。

### Step 6 · 驗證

```bash
npx tsc --noEmit                                          # 必 0 errors
npx eslint "src/app/(workspace)/admin/master-data/{slug}" \
  "src/lib/master-data/{slug}-actions.ts"                 # 必 0 errors
```

### Step 7 · sidebar 找位置 — **DB-driven，必動 `nav_nodes` 表**

`src/lib/modules.ts` 只是樣板 fallback；**實際 sidebar 從 `nav_nodes` 讀**。改 `modules.ts` 看不到效果，必須 `INSERT INTO nav_nodes` 雙 brand 各一筆。

```sql
-- 7a) 看 List 主檔 群組長什麼樣（雙 brand 各有一個 parent，level=2）
SELECT brand_id, name, href, parent_id, sort_order
FROM nav_nodes
WHERE parent_id IN (
  SELECT id FROM nav_nodes WHERE name='List 主檔' AND level=2
)
ORDER BY brand_id, sort_order;

-- 7b) 找個邏輯位置（同性質的 nav 鄰著放，例：供應商定價 緊接 供應商）
--     如果要插中間，先把後面的 sort_order 往後推
UPDATE nav_nodes SET sort_order = sort_order + 1
WHERE parent_id IN ('<ducati-list-parent>', '<indian-list-parent>')
  AND sort_order >= {target};

-- 7c) 雙 brand 各 INSERT 一筆。page_kind 必填且只接受
--     'static_html' | 'react_route' | 'iframe' | 'placeholder' — react 頁用 'react_route'
INSERT INTO nav_nodes (brand_id, parent_id, level, sort_order, name, icon, href, page_kind, is_active, coming_soon)
VALUES
  ('ducati', '<ducati-list-parent>', 3, {target}, '{中文名}', '{material_icon}', '/admin/master-data/{slug}', 'react_route', true, false),
  ('indian', '<indian-list-parent>', 3, {target}, '{中文名}', '{material_icon}', '/admin/master-data/{slug}', 'react_route', true, false);
```

⚠️ **常踩雷**：
- `nav_nodes_page_kind_check` 只允許上述 4 種值，亂填會報 `23514`
- 不雙 brand 補 → 至少一個品牌看不到入口
- 修 `src/lib/modules.ts` 不會影響實際 sidebar（除非 nav_nodes 為空走 fallback）—— **不要把工放在 modules.ts**

### Step 8 · 收尾

- 跑一輪手測：list 篩選 / 新增 modal / 編輯 modal / 停用啟用 / 刪除 / detail KV / detail 修改 / detail 同頁新增 / 切 tab
- 改動同步回 main（如果在 worktree 做）
- 不主動 commit；等使用者點頭

### 可重用 helper / 樣板（直接 import 不要重寫）

| 用途 | 元件 / 函式 | 位置 |
|------|------------|------|
| List view 表格（必用） | `<DataGrid>` + `DataGridColumn<T>` | `src/components/data-grid` |
| 快速新增 dropdown 選項 | `<QuickAddSelect>` | `src/components/quick-add-select.tsx` |
| KV pair 顯示 | local `Kv` helper | 拷貝 `item-detail-view.tsx` 底部 |
| Modal | local `Modal` helper | 同上 |
| Banner | inline JSX `fixed bottom-6 right-6` | 同上 |
| 權限檢查 | `requirePermission` / `hasPermission` | `src/lib/rbac/policies.ts` |

### 邊界 — 不適用本 SOP 的情況

- 純資訊頁（沒有 CRUD）→ 只做 list、detail 用唯讀 KV grid 即可
- 跨多表 wizard（採購單、工單） → 走 multi-step pattern、不適用 inline modal CRUD
- 有設計稿且明確跟本規格衝突 → 仍以本規格優先（色碼/字級/按鈕順序）
- permission matrix / tree view / KV grid 不算 list view，可用 raw `<table>`、不必強制走 DataGrid

---

## COA 規格使用規則

`docs/coa-spec/` 是參考規格，不是要直接套用的 migration。執行任何 COA 相關任務前，必須：

1. 先閱讀 `docs/coa-spec/03_design_principles.md`
2. 產出 `docs/proposals/coa-{task-name}.md` 計劃書
3. 等 Ming 審核同意後才執行實際 schema 變更
4. 絕不直接修改 `docs/coa-spec/` 任何檔案、絕不擅自跑 DDL

> 📌 補充：本專案目前沒有 `supabase/migrations/` 目錄（schema 在 Cloud 手動 apply，透過 supabase MCP `apply_migration` 工具）。第一次 COA 落地（2026-05-10）已完成五層 schema + 412 筆 seed + chart_of_accounts 部署 + gl_dimensions 29 個預設 + netsuite_dim_mapping，落地紀錄在 `docs/proposals/dimension-integration-research-2026-05-10.md`。

### 維度模型對齊（MANDATORY）

DealerOS 採五軸維度模型（plan §4.2 / dimension-integration-research）：

| 軸 | 性質 | DealerOS 表 | NetSuite 對映 |
|---|---|---|---|
| 集團 (group) | 虛 / Tenant 邊界 | `groups` (tenant_uuid) | Parent Subsidiary |
| 品牌 (brand) | **虛**（行銷層，不掛統編） | `brands` | Custom Segment 'Brand' |
| **法人 (subsidiary)** | **實**（統編 / 帳本 / 本位幣） | `subsidiaries` | **Subsidiary** |
| 門店 (store) | 實 / 營運點 | `organizations` (level=2) | Location |
| 部門 (department) | 虛 / 成本中心 | `departments` | Department |

寫任何會計分錄、財務報表、跨維度 query 時，**brand ≠ subsidiary**，subsidiary 才是 NetSuite Subsidiary 的對映；brand 是行銷層走 Custom Segment。

---

## 意見回饋模組（Feedback Module）— CI/CD Pipeline POC 核心

> 這是本 repo 最重要的原創功能。DealerOS 的所有「許願單」就是這個 CI/CD pipeline 的輸入端。

### Pipeline（從許願到部署）

- 客戶 `/feedback/tickets/new` 提需求 → `feedback_tickets.status = draft`
- Admin 審批 → `status = in_progress`（admin only）
- **Phase A（現在，手動）**：Admin 確認需求 → 手動 trigger GitHub Actions 或直接開發
- **Phase B（未來，自動）**：Supabase webhook → GitHub Actions → Claude Code API → auto PR
- 開發完成 → PR → 人工審批 merge（不跳過）→ Zeabur 自動部署
- 部署後 → `status = released`

頁面與元件位置：`src/app/(workspace)/feedback/tickets/{,new,[id]}` + `src/components/feedback/`。Server actions 在 `src/lib/feedback-actions.ts`。

**狀態機**（`src/lib/feedback.ts`）：
```
draft → in_progress → review → released
         ↑ admin only  ↑ admin  ↑ admin
```

### Supabase 資料庫

**專案 URL**: `https://bykvtcptbirpxyqkfwfl.supabase.co`

**核心資料表**：

```sql
-- 許願單主表
feedback_tickets (
  id          uuid PRIMARY KEY,
  title       text NOT NULL,
  url         text,              -- 相關連結（Stitch 畫面 / Figma / 錄影）
  description text,
  status      text,              -- draft | in_progress | review | released
  created_by  uuid,              -- auth.users.id
  assignee_id uuid,
  created_at  timestamptz,
  updated_at  timestamptz
)

-- 留言
feedback_comments (
  id         uuid PRIMARY KEY,
  ticket_id  uuid REFERENCES feedback_tickets,
  author_id  uuid,
  body       text,
  created_at timestamptz
)

-- Excalidraw 畫布 snapshot
feedback_canvas_snapshots (
  ticket_id  uuid PRIMARY KEY REFERENCES feedback_tickets,
  snapshot   jsonb,             -- Excalidraw elements + appState
  updated_at timestamptz
)
```

### 當許願單被建立 → 自動推 LINE 通知（2026-04-20 上線）

`createTicket()` 在 insert 成功後用 Next 16 的 `after()` 非阻塞呼叫 `notifications.dispatch({ code: 'feedback_ticket.created', ... })`，經 Notification Hub 推到所有訂閱該事件的目標。**這是 CI/CD pipeline 的入口訊號** — 客戶提需求 → 你手機秒收 LINE → 馬上決定要不要進 in_progress 啟動開發。

---

## 🔔 Notification Hub（IM 通知模組）

DealerOS 統一的 IM 通知基礎建設。LINE + Google Chat 雙通路，Next.js 原生（不經 n8n），用 Next 16 `after()` 非阻塞。

- 接新事件 SOP / 架構 / schema → `src/lib/notifications/README.md`、`docs/notifications-architecture.md`、`docs/notifications-schema.sql`
- 後台 `/admin/notifications`（dashboard / subscriptions / targets / templates / deliveries）— 進入需 `NOTIFICATION_ADMIN_EMAILS` allowlist（fallback 吃 `FEEDBACK_ADMIN_EMAILS`）
- 業務模組接點：

```ts
import { after } from "next/server";
import { notifications } from "@/lib/notifications";

after(async () => {
  await notifications.dispatch({ code: "my_event.code", payload: { /* ... */ } });
});
```

- 用戶問「為什麼沒收到通知」/「最近幾筆推送」→ 直接查 `notification_deliveries`：

```sql
SELECT created_at, event_code, channel_code, target_ref, status, attempts,
       substring(last_error from 1 for 100) as error_preview
FROM notification_deliveries
WHERE status = 'failed'   -- 拿掉這行就看全部
ORDER BY created_at DESC LIMIT 20;
```

---

## 當用戶說「看第 X 張許願單」時，直接查 Supabase

**不需要用戶貼資料**。使用 `mcp__plugin_supabase_supabase__execute_sql` 工具，專案 ID 為 `bykvtcptbirpxyqkfwfl`：

```sql
-- 列出所有許願單（最新在前）
SELECT id, title, status, created_at, updated_at
FROM feedback_tickets
ORDER BY updated_at DESC;

-- 看特定張單的完整內容（含留言）
SELECT t.*, 
       array_agg(c.body ORDER BY c.created_at) AS comments
FROM feedback_tickets t
LEFT JOIN feedback_comments c ON c.ticket_id = t.id
WHERE t.id = '<uuid>'   -- 或 WHERE t.title ILIKE '%關鍵字%'
GROUP BY t.id;
```

> 🔑 **操作原則**：用戶說「第幾張單」或「哪個需求」時，先 SELECT 列表讓用戶確認 ID，再拉詳情，不要猜。
