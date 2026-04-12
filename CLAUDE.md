# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- Inherit Next.js-specific agent rules -->
@AGENTS.md

## Project Overview

DealerOS — 豪華汽車經銷商營運管理平台。基於 Next.js 16 App Router，設計稿全部在 Stitch 上完成。

## Dev Server

Start the development server (accessible from external machines on the LAN):

```bash
npm run dev -- -H 0.0.0.0 -p 3000
```

Desktop browser access: `http://10.7.12.179:3000`

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
- **Design System**: Omotenashi Digital Framework (from Stitch)
- **Structure**: `src/app/` — App Router pages and layouts

### Key directories

| Path | Purpose |
|------|---------|
| `src/app/(auth)/` | Auth route group: login, onboarding (no sidebar) |
| `src/app/(dashboard)/` | Dashboard route group: all business pages (with sidebar + topbar) |
| `src/app/api/` | API route handlers (e.g. signout) |
| `src/components/` | Shared components: sidebar, topbar, command-palette |
| `src/lib/supabase/` | Supabase client/server/proxy utilities |
| `public/` | Static assets served at the root path |

### Route Groups

- `(auth)` — 不帶 Sidebar 的頁面：`/login`, `/onboarding`
- `(dashboard)` — 帶 Sidebar + Topbar 的業務頁面：`/`, `/showroom`, `/orders`, etc.

## Stitch Design System Integration (CRITICAL)

### Stitch Project

- **Project Name**: Luxury Automotive Design System
- **Project ID**: `4439217217980273986`
- **Total Screens**: 71

### Stitch MCP Access

```bash
# List all screens
STITCH_API_KEY="<key>" npx @_davideast/stitch-mcp tool list_screens \
  -d '{"projectId":"4439217217980273986"}' -o json

# Get screen HTML (use projectId and screenId separately)
STITCH_API_KEY="<key>" npx @_davideast/stitch-mcp tool get_screen_code \
  -d '{"projectId":"4439217217980273986","screenId":"<screenId>"}' -o json
```

### MANDATORY: Stitch HTML Faithful Clone Rule

**這是本專案最重要的工作規範，不可省略。**

當從 Stitch 設計稿建立或更新任何頁面時，必須嚴格遵守以下流程：

1. **先取得 Stitch HTML** — 使用 `get_screen_code` 從 Stitch MCP 抓取該畫面的完整 HTML
2. **逐行轉譯為 React** — 將 Stitch 吐出的 HTML 逐行轉換成 JSX，保留所有：
   - Tailwind CSS class（每一個 class 都要保留，不可省略或「簡化」）
   - 元素結構與巢狀關係
   - 間距、圓角、陰影、透明度等視覺細節
   - Material Symbols icon 名稱與 `fontVariationSettings`
   - 漸層、背景裝飾、hover/active 動畫效果
3. **禁止「憑印象重寫」** — 絕對不可以看了 Stitch 一眼就自己重新設計。Stitch 的 HTML 就是最終設計稿，不需要「重新詮釋」
4. **只做必要的 React 化改動**：
   - `class` → `className`
   - `style="..."` → `style={{ ... }}`
   - `<a href="#">` → `<Link href="...">` 或 `<button onClick={...}>`
   - 加入 React state/event handlers 實現互動邏輯
   - 圖片 `src` 如使用 Stitch 的 placeholder，保留或替換為適當的 fallback
5. **字型 class 映射**：Stitch 使用 `font-manrope`，本專案使用 `font-display`（兩者都指向 Manrope）

### Sprint & Screen Mapping

畫面總表在 `DealerOS_畫面總表_Stitch_Mapping.xlsx`，包含：
- 62 個畫面的編號、Sprint、名稱、類型、裝置、Stitch 畫面名稱
- 串接流程地圖（頁面間的導航關係）
- 各 Sprint 的路由前綴

## Zeabur Deployment

Zeabur auto-detects Next.js — push to GitHub, connect the repo in Zeabur, and it handles `npm run build` + `npm run start` automatically. No extra config file needed.
