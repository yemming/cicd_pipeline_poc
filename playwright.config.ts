import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

/**
 * 第十一輪 E2E：8 個業務 persona，每個一個 Playwright project，
 * 指向各自的 storageState（由 scripts/e2e-login-all-roles.mjs 產出）。
 *
 * persona key ↔ DB role_id（見 supabase/migrations/*_e2e_role_accounts_rbac.sql）：
 *   rs_manager      → rs_manager（銷售主管）
 *   sales_lead      → sales_lead（銷售人員）
 *   crm_agent       → crm_agent（客服專員）
 *   sa              → service_advisor（服務顧問）
 *   tech            → technician（技師）
 *   aftersales_lead → aftersales_lead（售後主管）
 *   warehouse       → warehouse（倉管）
 *   stock_lead      → stock_lead（庫存主管）
 *
 * 跑單一角色：npx playwright test --project=chromium-sa
 * 某個 spec 要鎖特定角色：import { useRole } from "./helpers/role-fixtures" 並 useRole("sa")
 * （useRole 以 test.use({ storageState }) 覆蓋 project 預設，故跨角色 spec 也能正確切換）
 */
export const E2E_ROLES = [
  "rs_manager",
  "sales_lead",
  "crm_agent",
  "sa",
  "tech",
  "aftersales_lead",
  "warehouse",
  "stock_lead",
] as const;

export type E2ERole = (typeof E2E_ROLES)[number];

/** persona key → storageState 檔路徑（單一事實來源，scripts / fixtures 共用） */
export function authFile(role: E2ERole | string): string {
  return `./tests/e2e/.auth/${role}.json`;
}

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  // 第十一輪鐵律：Phase 2 動態跑 case 時嚴禁多 Chromium 並行（OOM）。
  // 預設序列化；要並行時自行傳 --workers=N。
  fullyParallel: false,
  workers: process.env.CI ? 2 : 1,
  reporter: process.env.CI ? "github" : [["list"]],

  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    // 預設 project：吃舊的 state.json（向後相容既有 parts.spec.ts）
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState:
          process.env.PLAYWRIGHT_STORAGE_STATE ?? "./tests/e2e/.auth/state.json",
      },
    },
    // 8 個 persona project：chromium-{role}，各自 storageState
    ...E2E_ROLES.map((role) => ({
      name: `chromium-${role}`,
      use: {
        ...devices["Desktop Chrome"],
        storageState: authFile(role),
      },
    })),
  ],

  // 不自動 spin up server — 假設使用者已 npm run dev（BRAND_KEY=indian）。
  // 要 CI 跑再把 webServer 打開。
  // webServer: {
  //   command: "BRAND_KEY=indian npm run dev -- -p 3000",
  //   url: baseURL,
  //   reuseExistingServer: !process.env.CI,
  // },
});
