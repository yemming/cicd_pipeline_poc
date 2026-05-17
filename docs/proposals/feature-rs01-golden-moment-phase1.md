# BDN #17 · RS01 黃金時刻 30 分倒數 — Phase 1

## 規格出處

`docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS01_電子手卡_v8.html`

- L876–882「① 黃金時刻：試駕結束當下（RS02 強制提示）」
- L806–814 黃金時刻 banner（在 RS02 段內、`display:none` 等試駕後觸發）

spec 沒明寫 30 分倒數，但 plan 註記：「試駕結束當下（RS02 強制提示）」+ 客戶熱情冷卻時間窗約 30 分鐘 → 用 30 分倒數量化、超時轉灰提示。

## 改動範圍

**唯一檔案**：`src/app/(workspace)/sales/reception/handcard/_components/handcard-form.tsx`

handcard 是 client-only（BDN #15/#16 已確認），無 schema 改動、無 server action。

## 結構分析（Step 5 試乘試駕段現況）

- L588–614：Step 5 試乘試駕段，僅有「前往 RS02」跳轉 button + 靜態提示文字
- 缺：試駕結束時間戳 state、倒數 UI、結束試駕 trigger

## 架構提案（已自動拍板）

### 1. 時間戳記從哪來

- 加 state `testRideEndAt: string | null`
- 在 Step 5 段加一顆「✓ 標記試駕結束」按鈕（次要白底按鈕），點下 `setTestRideEndAt(new Date().toISOString())`
- 已標記後按鈕變成「↻ 重新計時」+ 顯示時間戳；可再點重設

### 2. 倒數精度

- `useEffect` setInterval **60000ms（每分鐘）**
- 用 `Date.now() - new Date(testRideEndAt).getTime()` 換算 elapsed minutes
- 不需要秒精度（30 分鐘黃金窗夠粗）

### 3. Banner 三態（useMemo 推導）

| 狀態 | 條件 | 視覺 | 文案 |
|---|---|---|---|
| hidden | `testRideEndAt === null` | 不渲染 | — |
| active | elapsed < 30 min | `bg-[#FDF3E3] text-[#854F0B] border border-[#F5C97A]` ⚡ amber | 「⚡ 黃金時刻剩 N 分鐘 — 立即開立報價單」+ 「立即報價」CTA |
| expired | elapsed >= 30 min | `bg-[#F2F2F2] text-[#6B6A68] border border-[#D5D3CB]` 灰 | 「⌛ 黃金時刻已過（試駕結束 N 分鐘前）— 仍建議主動跟進」 |

expired banner **保留不消失**（提示 RS 還是要跟進）。

### 4. Banner 位置

緊貼 Step 5 試乘試駕 section 內、`px-4 py-3` 下方、跳轉 button 之上。不擋按鈕、視覺貼著試駕段語境。

### 5. 不做的事

- 不接 server / DB（純前端 state，handcard 整體還沒上 DB）
- 不做 push notification（後續 BDN 輪次）
- 不要分鐘級閃爍特效（純文字更新）
- 不要 Modal 開報價單（CTA 先做 placeholder，後續再串 RS04）

## 驗證（Phase 5）

- `npx tsc --noEmit` 0 errors
- `npx eslint` 該檔 0 errors
- audit `grep "@/lib/supabase" ` Step 5 段 → 0 hit
- Playwright headless：登入 → RS01 → 點「✓ 標記試駕結束」→ 截圖 banner 「⚡ 黃金時刻剩 30 分鐘」→ 截圖存 `tmp/bdn17-*.png`
