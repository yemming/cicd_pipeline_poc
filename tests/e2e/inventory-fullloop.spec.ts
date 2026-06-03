/**
 * 庫存「完整閉環」驗證 — 對照 docs/20260601/08_庫存管理模組_HTML異動 + I1_庫存_HTML巡檢結果.md
 * 逐步操作驗證本輪實作的庫存 WP。persona: stock_lead（庫存主管，有 parts.alert.view）。
 */
import { test, expect, useRole } from "./helpers/role-fixtures";

test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("庫存閉環 · 告警儀表板（stock_lead）", () => {
  useRole("stock_lead");

  // WP-A / W1：10B 告警儀表板（老闆點名首頁）
  test("WP-A 告警儀表板：4 KPI + 5 Tab + PDC 倒計時", async ({ page }) => {
    await page.goto("/parts/alerts/dashboard");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "庫存告警儀表板" })).toBeVisible();
    // 4 KPI（regex 可能同時命中 KPI 卡與同名 Tab → 取 first）
    await expect(page.getByText(/低於最小庫存/).first()).toBeVisible();
    await expect(page.getByText(/低於再訂購點/).first()).toBeVisible();
    await expect(page.getByText(/工單待備料/).first()).toBeVisible();
    await expect(page.getByText(/批號.*到期/).first()).toBeVisible();
    // PDC 倒計時（DUCATI 截單）
    await expect(page.getByText(/PDC|截單|DUCATI/).first()).toBeVisible();
    // 5 Tab 可切換：點「採購逾期」Tab
    const overdueTab = page.getByRole("button", { name: /採購逾期/ });
    if (await overdueTab.count()) {
      await overdueTab.first().click();
      // 切到後該 Tab 的 DataGrid 應在（空也算渲染成功）
      await expect(page.locator("table").first()).toBeVisible();
    }
    // 批號到期 Tab → Phase 2 提示
    const batchTab = page.getByRole("button", { name: /批號/ });
    if (await batchTab.count()) {
      await batchTab.first().click();
      await expect(page.getByText(/Phase 2|batch|待.*欄位|尚未/).first()).toBeVisible();
    }
  });

  // WP-H / W3：採購頁 PDC 截單倒計時 + 緊急送單
  test("WP-H 採購頁：PDC 倒計時 + 緊急送單 → 緊急採購預設", async ({ page }) => {
    await page.goto("/parts/purchase/orders");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "商品採購" })).toBeVisible();
    // PDC 倒計時（DUCATI 截單時間）
    await expect(page.getByText(/DUCATI|截單|PDC/).first()).toBeVisible();
    // 緊急送單入口
    const urgent = page.getByRole("link", { name: /緊急送單/ });
    await expect(urgent).toBeVisible();
    await urgent.click();
    await page.waitForURL(/\/parts\/purchase\/orders\/new\?urgent=1/);
    // 緊急 banner
    await expect(page.getByText(/緊急送單|緊急採購/).first()).toBeVisible();
  });

  // WP-D / W2：水位設定再訂購點計算器
  test("WP-D 水位設定：再訂購點計算器 + 可用庫存說明", async ({ page }) => {
    await page.goto("/parts/alerts/thresholds");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/再訂購點/).first()).toBeVisible();
    await expect(page.getByText(/可用庫存/).first()).toBeVisible();
  });

  // WP-F / W5：維修領料待備料橫幅
  test("WP-F 維修領料：待備料工單橫幅 + 工單號帶入", async ({ page }) => {
    await page.goto("/parts/issue/repair-pick");
    await page.waitForLoadState("networkidle");
    // 待備料橫幅「共 N 張工單需備料」
    await expect(page.getByText(/張工單需備料/).first()).toBeVisible();
    // 掃描/帶入輸入框
    await expect(page.getByPlaceholder(/掃描|工單號/).first()).toBeVisible();
  });

  // WP-B / W8：供應商績效看板
  test("WP-B 供應商資訊：績效看板（示意資料）", async ({ page }) => {
    await page.goto("/parts/setup/suppliers");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/供應商績效/).first()).toBeVisible();
    await expect(page.getByText(/示意資料/).first()).toBeVisible();
  });

  // WP-C / W4：採購入庫驗收差異三入口
  test("WP-C 採購入庫：驗收差異三入口（短收/拒收/批次匯入）", async ({ page }) => {
    await page.goto("/parts/receipt/po-grn");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: /數量短收/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /損壞拒收/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /批次匯入/ })).toBeVisible();
    // 開短收 Modal
    await page.getByRole("button", { name: /數量短收/ }).click();
    await expect(page.getByText(/差異數|短收/).first()).toBeVisible();
  });

  // WP-E / W7：暫存倉儲位 + RO 舊件入庫
  test("WP-E 暫存倉：儲位設定 + RO 舊件入庫面板", async ({ page }) => {
    await page.goto("/parts/warranty/staging-warehouse");
    await page.waitForLoadState("networkidle");
    await expect(page.getByText(/儲位/).first()).toBeVisible();
    await expect(page.getByText(/舊件入庫|待入庫|確認入庫/).first()).toBeVisible();
  });
});
