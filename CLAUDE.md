# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- Inherit Next.js-specific agent rules -->
@AGENTS.md

## Project Overview

A Next.js web platform intended to be hosted on GitHub and deployed via [Zeabur](https://zeabur.com). Uses the App Router, TypeScript, and Tailwind CSS.

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
- **Structure**: `src/app/` — App Router pages and layouts

### Key directories

| Path | Purpose |
|------|---------|
| `src/app/` | App Router: pages, layouts, route handlers |
| `src/app/layout.tsx` | Root layout applied to all routes |
| `src/app/page.tsx` | Home page (`/`) |
| `public/` | Static assets served at the root path |

## Zeabur Deployment

Zeabur auto-detects Next.js — push to GitHub, connect the repo in Zeabur, and it handles `npm run build` + `npm run start` automatically. No extra config file needed.
