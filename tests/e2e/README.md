# Parts Module e2e Smoke

## 測什麼

| 測試組 | 數量 | 驗證點 |
|--------|------|--------|
| W2-W6 stub action button | 16 頁 | 點按鈕 → server action stub 回 ok:false → UI 顯示「下版開放 — XX 將於 W{2-6} sprint 開放編輯」 |
| 11 純設定頁 catch-all inline | 11 頁 | `[...slug]/page.tsx` 抓到 path → 載 `public/parts-stitch/{file}.body.html` → `PartsInline` 渲染進 `.min-w-[1100px]` 容器 + 注入 `window.go` helper |
| inline alert(...) onclick | 7 頁 | 設計稿內 button 的 inline `onclick="alert('...')"` 在 React `dangerouslySetInnerHTML` 後仍能被瀏覽器執行 |

## 跑步驟

### 1. 安裝（首次）

```bash
npm i -D @playwright/test
npx playwright install chromium
```

### 2. 準備 auth storageState

e2e 需要登入過的 cookie。最簡做法:跑一次 dev server 在瀏覽器登入,然後把 cookie 存出來。

```bash
# 1) 啟 dev
BRAND_KEY=indian npm run dev -- -p 3000

# 2) 在瀏覽器登入後,把 cookie 存成 storageState
mkdir -p tests/e2e/.auth
node -e '
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("http://localhost:3000/login");
  console.log("登入後按 Enter 繼續...");
  await new Promise(r => process.stdin.once("data", r));
  await ctx.storageState({ path: "tests/e2e/.auth/state.json" });
  await browser.close();
  process.exit(0);
})();
'
```

### 3. 跑

```bash
# 全部
npx playwright test

# 單一組
npx playwright test --grep "stub action button"
npx playwright test --grep "catch-all inline"
npx playwright test --grep "alert"

# UI 模式 debug
npx playwright test --ui
```

## 已驗證(用 Playwright MCP 跑過)

| 案例 | 結果 |
|------|------|
| `/parts/issue/repair-pick` 點「從 RO 一鍵領料」 | t=100ms `disabled=true btnText="處理中⋯"` → t=1.1s hint=「💡 下版開放 — 從 RO 工單一鍵領料 將於 W2 sprint 開放編輯」 |
| `/parts/setup/purchase-permissions` inline render | innerHTML 8424 字 + `window.go` 為 function + 1 個 `[onclick*="alert"]` 按鈕 |
| `/parts/setup/purchase-permissions` 點「儲存」 | alert text=「儲存權限設定」 ✓ |
| `/parts/warranty/ro-link` 點 4 個 button | alert texts=「測試連線 / 儲存串接設定 / 查看全部 / 手動觸發驗證」 4/4 ✓ |

## 為何不裝 @playwright/test 進 package.json devDependency

裝會抓 ~200MB chromium binary,平常 dev 不需要。等真的要進 CI 再裝;`playwright.config.ts` + spec 已寫好,要跑時 `npm i -D @playwright/test && npx playwright install chromium` 即可。

## storageState 存哪

`tests/e2e/.auth/state.json` — 已加進 `.gitignore`(下面),不會被 commit。
