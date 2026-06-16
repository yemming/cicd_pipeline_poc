/**
 * 庫存 Gap 修補（6/16）— 倉管角色截圖佐證（打部署正式站 dealeros.zeabur.app）。
 * persona: warehouse（真倉管、非 admin）, scope=Indian。
 * 跑法：PLAYWRIGHT_BASE_URL=https://dealeros.zeabur.app npx playwright test inv-gaps-evidence --project=chromium
 */
import { test, expect, useRole } from "./helpers/role-fixtures";

const SHOT = "docs/20260616_3/inv-evidence";

test.describe("庫存 Gap 修補佐證 — 倉管角色", () => {
  useRole("warehouse");

  test("報廢審批頁 + 新增報廢三級審批層", async ({ page }) => {
    const body = page.locator("body");
    await page.goto("/parts/count/writeoffs");
    await expect(page).toHaveURL(/\/parts\/count\/writeoffs/);
    await expect(body).not.toContainText("Application error");
    await expect(body).not.toContainText("無權限");
    await expect(page.locator("main").last()).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOT}/01_writeoffs_list.png`, fullPage: true });

    // 開「新增報廢」modal 顯示三級審批層提示
    const addBtn = page.getByRole("button", { name: /新增報廢/ });
    if (await addBtn.count()) {
      await addBtn.first().click().catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOT}/02_writeoff_create_modal.png`, fullPage: true });
    }
  });

  test("採購進貨成本記錄（唯讀帳）", async ({ page }) => {
    const body = page.locator("body");
    await page.goto("/parts/operations/purchases-ledger");
    await expect(page).toHaveURL(/purchases-ledger/);
    await expect(body).not.toContainText("Application error");
    await expect(body).not.toContainText("無權限");
    await expect(page.locator("main").last()).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOT}/03_purchases_ledger.png`, fullPage: true });
  });

  test("保固索賠應收款（唯讀帳）", async ({ page }) => {
    const body = page.locator("body");
    await page.goto("/parts/warranty/receivables");
    await expect(page).toHaveURL(/receivables/);
    await expect(body).not.toContainText("Application error");
    await expect(body).not.toContainText("無權限");
    await expect(page.locator("main").last()).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOT}/04_warranty_receivables.png`, fullPage: true });
  });

  test("商品主檔 + 原廠 Price Book 匯入入口", async ({ page }) => {
    const body = page.locator("body");
    await page.goto("/parts/setup/items");
    await expect(page).toHaveURL(/\/parts\/setup\/items/);
    await expect(body).not.toContainText("Application error");
    await expect(page.locator("main").last()).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOT}/05_items_board.png`, fullPage: true });

    const pbBtn = page.getByRole("button", { name: /Price Book|原廠/ });
    if (await pbBtn.count()) {
      await pbBtn.first().click().catch(() => {});
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOT}/06_pricebook_import_modal.png`, fullPage: true });
    }
  });
});
