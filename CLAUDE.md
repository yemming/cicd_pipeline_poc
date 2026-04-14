![alt text](<CleanShot 2026-04-14 at 13.18.07.png>)# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- Inherit Next.js-specific agent rules -->
@AGENTS.md

## Project Overview

**DealerOS for Ducati Taiwan** — 杜卡迪（Ducati）重機經銷商營運管理平台。基於 Next.js 16 App Router，設計稿全部在 Stitch 上完成。

> ⚠️ **Ducati Pivot（2026-04-14）**：本專案原為 Lexus 汽車經銷商 demo，已全面轉為 Ducati 重機。所有「車輛」改稱「機車」，所有車型改用 Ducati 車款（Panigale V4、Monster、Multistrada V4、Diavel V4、Streetfighter V4、Scrambler、Hypermotard、DesertX）。經銷商名稱為「Ducati Taipei / Official Dealer」。

## Dev Server

```bash
npm run dev -- -H 0.0.0.0 -p 3000   # LAN-accessible
```

Desktop browser access: `http://10.7.12.179:3000` or `http://localhost:3000`

## Common Commands

```bash
npm run dev        # Start dev server (localhost only)
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
```

## Architecture

- **Framework**: Next.js 16 with App Router (Turbopack enabled by default)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 (configured via `@tailwindcss/postcss` in `postcss.config.mjs`)
- **Auth**: Supabase Auth (`src/lib/supabase/`)
- **Design System**: Omotenashi Digital Framework (from Stitch) — Ducati Red `#CC0000` 為品牌主色
- **Structure**: `src/app/` — App Router pages and layouts

### Key directories

| Path | Purpose |
|------|---------|
| `src/app/(auth)/` | Auth route group: login (no shell) |
| `src/app/(workspace)/` | Workspace route group: launcher + 所有模組頁面（dual-rail shell） |
| `src/app/api/` | API route handlers (e.g. signout) |
| `src/components/` | 共用 shell：`module-rail.tsx`, `pages-panel.tsx`, `topbar.tsx`, `command-palette.tsx`, `page-header-context.tsx`, `placeholder-page.tsx`, `stitch-viewer.tsx` |
| `src/lib/modules.ts` | **模組註冊表（Single Source of Truth）** — 驅動 launcher、module rail、pages panel、權限、stitch 連結 |
| `src/lib/use-active-module.ts` | 由 pathname 解析當前 module 的 hook |
| `src/lib/supabase/` | Supabase client/server/proxy utilities |
| `public/` | Static assets served at the root path |

### Route Groups

- `(auth)` — 完全不帶 shell 的頁面：`/login`
- `(workspace)` — 所有帶 dual-rail shell 的頁面：
  - `/` — App Launcher（大地圖，選擇模組）
  - `/onboarding` — 新手導覽
  - `/{module-key}/{page}` — 各模組的業務頁面，例：`/sales/showroom`、`/service/appointments`

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

- ✅ **畫面主體內容**：Faithful Clone 照抄
- ❌ **Sidebar / Topbar / Rail**：不照抄，改用共用 shell
- ✅ **新模組 / 新頁面**：只改 `src/lib/modules.ts` + 對應 `page.tsx`

---

## Stitch Design System Integration (CRITICAL)

### Stitch Project

- **Project Name**: Luxury Automotive Design System
- **Project ID**: `4439217217980273986`
- **Total Stitch Screens**: 78（含重複、草稿、多種版本）
- **DealerOS 正式畫面**: 62（見 `DealerOS_畫面總表_Stitch_Mapping.xlsx`）

### Stitch MCP Access

本專案使用 Stitch HTTP MCP，設定於 `~/.claude.json`：

```
stitch: https://stitch.googleapis.com/mcp (HTTP)
Header: X-Goog-Api-Key: <key>
```

可直接呼叫 `mcp__stitch__list_screens` / `mcp__stitch__get_screen` 等工具。

### MANDATORY: Stitch HTML Faithful Clone Rule

> ⚠️ **例外**：Sidebar 與 Topbar 不適用 Faithful Clone — 請見上方「Shared App Shell」章節。

1. **先取得 Stitch HTML** — 使用 `mcp__stitch__get_screen` 抓取該畫面 HTML
2. **逐行轉譯為 React** — 扣除 Sidebar / Topbar，保留所有 Tailwind class、結構、icon、動畫
3. **禁止「憑印象重寫」**
4. **只做必要的 React 化改動**：`class` → `className`、`style="..."` → `style={{...}}` 等
5. **字型**：Stitch 用 `font-manrope`，本專案用 `font-display`（都指向 Manrope）
6. **Ducati Pivot**：所有 Stitch 輸出中的 Lexus/Toyota/汽車 相關字樣，替換為 Ducati/機車 對應用語

### Sprint & Screen Mapping

畫面總表在 `DealerOS_畫面總表_Stitch_Mapping.xlsx`，含 S0~S10 共 62 畫面，以及 35 條串接流程。所有 Stitch screenId 綁在 `src/lib/modules.ts` 的 `stitchScreenId` 欄位。

---

## Execution Strategy — Strategy C：先蓋殼後填肉（MANDATORY）

### 為什麼採用此策略

Stitch 上 62 個畫面每個都獨立生成、缺乏一致性 → 這正是為什麼要**共用 shell 統一導覽** + **每頁先用 Stitch iframe 當臨時內容**。

客戶 demo 期：shell 一致 + 所有頁面都打得開（即使內容是 Stitch 原稿嵌入），客戶邊看邊刪；接著按 Sprint 優先序替換成 Faithful Clone 的 React 頁面。

### Phase 1：Registry 對齊（✅ 已完成於 2026-04-14）

- `src/lib/modules.ts` 擴充至 8-9 模組涵蓋全 62 頁
- 每個 page 帶 `stitchScreenId` 欄位
- 所有模組改為 Ducati 品牌色/命名

### Phase 2：StitchViewer + 批次建頁（✅ 已完成於 2026-04-14）

- `src/components/stitch-viewer.tsx` 用 iframe 嵌 Stitch 畫面，含 loading + 「原稿」badge + 外連 Stitch
- 62 個 `page.tsx` 全數建立，每頁一行 `<StitchViewer screenId={...} />`
- **此時 demo 100% 可用**：客戶可走 35 條流程

> ⚠️ **Stitch HTML 套娃防呆**：Stitch 產出的每個畫面都自帶 Sidebar + Topbar；直接 iframe 會和我們的 shell 疊成雙層 sidebar。**所有 `public/stitch/*.html` 都必須先跑過 `scripts/strip-stitch-chrome.py` 剝殼**（僅保留 body 主內容）。
>
> ```bash
> python3 scripts/strip-stitch-chrome.py       # 剝掉 Stitch 自帶 sidebar/topbar (idempotent)
> python3 scripts/extract-stitch-bodies.py     # 抽 body innerHTML + Lexus→Ducati 字串替換 (idempotent)
> ```
>
> 重新下載 Stitch HTML 後**一定要**依序重跑這兩支 script，否則 demo 畫面會出現雙層 sidebar 套娃 或 iframe 內容沒 Ducati 化。

### Phase 3 · 內嵌模式（Inline）vs. 完整轉譯（Faithful Clone）

兩種升級路徑，由「demo 可展示」到「可自由 edit」：

| 模式 | 元件 | 檔案數 | 可編輯性 |
|------|------|-------|---------|
| Inline（現況） | `<StitchInline html={...} />` | server 讀 `public/stitch/{id}.body.html` → `dangerouslySetInnerHTML` | 直接改 .body.html 或 page.tsx，與我們 Tailwind token 共用 |
| Faithful Clone | 手寫 JSX | 單檔含子元件 | 完全 React 化，可接真資料（如 `/sales/showroom`） |

**升級策略**：每次要「對資料、加互動、接 API」之前，把該頁從 Inline 升級成 Faithful Clone。其他頁面停留在 Inline 直到被需要時再升級。

### RWD 側邊欄

- `SidebarContext` 提供 `collapsed` state（`src/components/sidebar-context.tsx`）
- 初始值依 `matchMedia("(max-width: 768px)")`：桌機展開、行動裝置預設收合
- Topbar 左側有 hamburger toggle（menu ↔ menu_open）
- PagesPanel 收合時 `-translate-x-full` 滑出畫面，`<main>` `ml-14` 只留 ModuleRail
- 行動裝置展開時顯示 backdrop（md: 以下），點擊收回

### Phase 3：Sprint-by-Sprint Faithful Clone（進行中）

優先序：
1. **S2 售前核心**（展廳+手卡三段+客戶+漏斗）← demo 黃金路徑，最先做
2. **S3 銷售閉環**（線索+報價+訂單+CRM）
3. **S4 售後** + **S7 交車流程**
4. **S1 審批** + **S6 集團看板**
5. **S5** + **S8** + **S9** + **S10** 收尾

每 clone 完一頁，把該 page.tsx 從 `<StitchViewer>` 換成實際 React 頁面。其餘頁面持續走 Stitch iframe。

### Resume Checkpoint（session 中斷時從這裡繼續）

**最新 session 進度**（更新於 2026-04-14，Phase 3 inline 完成）：

- [x] CLAUDE.md 寫入策略 + Ducati pivot 說明
- [x] `src/lib/modules.ts` Ducati 化 + 61 頁 registry + stitchScreenId + section 分組
- [x] `src/components/stitch-viewer.tsx` 建立（iframe + loading + 原稿 badge + 到 Stitch 編輯連結）
- [x] `public/stitch/` 下載 77 個 Stitch HTML（自包含 Tailwind CDN）
- [x] 61 頁 page.tsx 全部指向 StitchViewer
- [x] Shell 品牌切換（Lexus → Ducati）：
  - topbar search placeholder (搜尋... 機車) + 主色 `#CC0000`
  - pages-panel footer（Ducati Taipei / Official Dealer）
  - pages-panel 支援 section 分組（Sales/Admin 多 section）
  - pages-panel 顯示 device 標籤（iPad/Tab/Mob）
  - launcher 加 Ducati subtitle + StatChip 儀表
  - command-palette 改吃 registry `allPages()`
  - login 頁標題 → 「Ducati 重機經銷商智慧營運平台」
- [x] `src/proxy.ts` 放行 `/stitch/*` 靜態路徑
- [x] Smoke test：所有路由 307 auth-redirect 正確；公開路徑 200；tsc 無錯
- [x] **Phase 3 S2-1 展廳看板 Faithful Clone** — 5 段漏斗、Ducati 車款庫存卡
- [x] **scripts/strip-stitch-chrome.py** 剝掉 Stitch 自帶 sidebar/topbar（套娃 bug 防呆）
- [x] **scripts/extract-stitch-bodies.py** 抽 body innerHTML + Lexus→Ducati 文字替換
- [x] **StitchInline** 元件 — 以 server component fs-read + `dangerouslySetInnerHTML` 內嵌到 React，共用專案 Tailwind tokens，不再用 iframe
- [x] 60 個 page.tsx 重生為 server component 讀 `*.body.html`（showroom 保留為 Faithful Clone）
- [x] **SidebarContext + RWD 收合**：Topbar 加 hamburger toggle、PagesPanel `-translate-x-full`、`<main>` 隨狀態切 `ml-14` / `md:ml-[296px]`、行動裝置預設收合 + overlay backdrop

**下一步（Faithful Clone 優先序，需要接資料或調互動才升級）**：

- [ ] **S2-2 ~ S2-7** 售前黃金動線（手卡三段、客戶標籤、漏斗、客戶列表）
- [ ] **S3-5** 訂單詳情（有金融/保險/精品三個子流程，complex）
- [ ] **S4-1 / S4-2** 預約看板 + 維修工單
- [ ] **S1-5** 審批中心（接 RBAC）
- 其他 Inline 夠用，等客戶指明再升級

**若 session 中斷，下次繼續點**：

1. `npm run dev`，登入後 `/` 看 launcher，點任何模組 → 確認 shell + inline Stitch 內容正常
2. 想改某頁的 Stitch 內容：編輯 `public/stitch/{screenId}.html` → 跑 `python3 scripts/strip-stitch-chrome.py && python3 scripts/extract-stitch-bodies.py`，自動熱更新
3. 想升級成 Faithful Clone：參考 `src/app/(workspace)/sales/showroom/page.tsx` 寫法，把該頁 `page.tsx` 換成手寫 JSX
4. 每升級一頁 commit 一次：`git commit -m "feat: S2-2 reception counter faithful clone"`

---

## Zeabur Deployment

Zeabur auto-detects Next.js — push to GitHub, connect the repo in Zeabur, and it handles `npm run build` + `npm run start` automatically. No extra config file needed.
