import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? "github" : [["list"]],

  use: {
    baseURL,
    trace: "on-first-retry",
    storageState: process.env.PLAYWRIGHT_STORAGE_STATE ?? "./tests/e2e/.auth/state.json",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // 不自動 spin up server — 假設使用者已 npm run dev,讓 e2e 跑在現有的 BRAND_KEY=indian session 上
  // 如要 CI 跑,把下面打開:
  // webServer: {
  //   command: "BRAND_KEY=indian npm run dev -- -p 3000",
  //   url: baseURL,
  //   reuseExistingServer: !process.env.CI,
  // },
});
