/**
 * 第十一輪 E2E — 角色 fixture helper。
 *
 * 讓單一 spec 鎖定用某個 persona 的 storageState 登入，不必依賴 `--project=chromium-{role}`。
 * storageState 路徑來自 playwright.config.ts 的 authFile()（單一事實來源），
 * 由 scripts/e2e-login-all-roles.mjs 產出。
 *
 * 用法：
 *   import { test, expect, useRole } from "./helpers/role-fixtures";
 *
 *   test.describe("RS-03 業績報表", () => {
 *     useRole("rs_manager");        // 這個 describe 內的所有 test 都用 rs_manager 登入
 *     test("本月新車彙整", async ({ page }) => {
 *       await page.goto("/...");
 *       // ...
 *     });
 *   });
 *
 * 跨角色的 case（例如 CROSS 串接點先 SA 開單、再 warehouse 出庫）：
 *   不要在 describe 用 useRole；改在 test 內用 browser.newContext({ storageState: authFile("warehouse") })
 *   各別開 context，模擬不同人接力。
 */
import { test, expect } from "@playwright/test";

import { authFile, type E2ERole } from "../../../playwright.config";

/**
 * 在 describe（或檔案頂層）呼叫，鎖定該 scope 內的 test 用指定 persona 的 storageState。
 * 底層就是 Playwright 的 test.use({ storageState })，作用域 = 呼叫所在的 describe。
 */
export function useRole(role: E2ERole): void {
  test.use({ storageState: authFile(role) });
}

export { test, expect, authFile };
export type { E2ERole };
