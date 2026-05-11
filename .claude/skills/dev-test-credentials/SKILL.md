---
name: dev-test-credentials
description: 本專案 dev / staging 環境的測試帳密 — 給 sub-agent 在 worktree 跑 Playwright MCP 時用，避免 dev session cookies 過期或全新 worktree 沒 cookie 卡在登入頁。觸發語：「Playwright 登入」「Supabase 登入」「dev session 過期」「login required」「需要登入測試」「沒登入無法跑」「auth 過期」「卡在登入頁」「跳到 /login」「需要帳密」「測試帳號」。**只用於本專案 dev / staging，不准在 prod 使用。**
---

# Dev / Staging Test Credentials（DealerOS for Ducati Taiwan）

## 適用情境

- Sub-agent 在新建的 worktree 裡開 Playwright MCP 跑驗證流程，dev session cookies 沒繼承過來
- 主目錄 dev session cookies 過期（Supabase JWT 預設 1 小時）
- 任何頁面跳到 `/login` 卡住自動化流程

## 帳密

```
帳號：yemming.yu@gmail.com
密碼：yemming.yu@gmail.com
```

兩者都是同一字串（user 故意設成這樣方便記）。

## 使用方式

Playwright MCP 流程：

1. `mcp__playwright__browser_navigate` 到目標頁面
2. 若被 redirect 到 `/login`：
   - `mcp__playwright__browser_fill_form` 填上 email + password
   - `mcp__playwright__browser_click` 提交
   - `mcp__playwright__browser_wait_for` 等到回到目標頁
3. 繼續原本的測試流程

如果你寫獨立 Playwright CLI script（不用 MCP），同樣帳密一起寫死在 `.env.test` 或 script header 即可（這個帳號就是 dev test 用、不會泄漏 prod 資料）。

## 紀律

- ❌ **禁止**用這組帳密登入 production / 線上環境
- ❌ **禁止**把帳密寫進 commit message、PR description、Notion 公開頁
- ❌ **禁止**用這組帳密做寫入動作後不清理（測試 row 結束要刪、清理規範看主任務 prompt）
- ✅ 可以寫進 sub-agent prompt（主 agent spawn sub-agent 時要主動帶上、不要叫 sub-agent 自己摸索）
- ✅ 可以寫進 worktree 內的 `.env.local` / `.env.test`（worktree 結束會被 prune）

## 為什麼放 skill 不放 .env

`.env*` 檔案在 worktree 之間 link 共用、改起來容易污染主目錄。skill 只是 reference document、不會自動寫進任何環境變數，sub-agent 要用的時候 invoke 一次即可。
