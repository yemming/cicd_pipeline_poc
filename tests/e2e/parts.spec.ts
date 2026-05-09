/**
 * Parts 模組 e2e smoke — 三條主線:
 *   1. W2-W6 specific routes 列表能載入,stub button 點下去顯示「下版開放」
 *   2. 11 純設定頁走 catch-all,inline 設計稿渲染成功
 *   3. inline 內 button 的 onclick="alert(...)" 觸發瀏覽器 alert dialog
 *
 * 跑法:見 tests/e2e/README.md
 */

import { expect, test } from "@playwright/test";

// ── 常數 ────────────────────────────────────────────
const STUB_PAGES = [
  { url: "/parts/issue/repair-pick",          actionKey: "issue.repair",          label: "從 RO 一鍵領料",   sprint: "W2" },
  { url: "/parts/issue/transfer-out",         actionKey: "issue.transfer-out",    label: "新增調撥單",       sprint: "W3" },
  { url: "/parts/issue/internal-sale",        actionKey: "issue.internal-sale",   label: "新增內售出庫",     sprint: "W2" },
  { url: "/parts/receipt/transfer-in",        actionKey: "receipt.transfer-in",   label: "確認調撥入庫",     sprint: "W3" },
  { url: "/parts/receipt/internal-sale",      actionKey: "receipt.internal-sale", label: "POS 退貨入庫",     sprint: "W3" },
  { url: "/parts/receipt/return-in",          actionKey: "receipt.return-in",     label: "從工單退料入庫",   sprint: "W3" },
  { url: "/parts/count/plans",                actionKey: "count.create-plan",     label: "新增盤點計畫",     sprint: "W4" },
  { url: "/parts/count/sessions",             actionKey: "count.start-session",   label: "啟動盤點",         sprint: "W4" },
  { url: "/parts/count/adjustments",          actionKey: "count.approve-adjustment", label: "核準報損報溢", sprint: "W4" },
  { url: "/parts/operations/adjust",          actionKey: "stock.adjust",          label: "新增庫存調整",     sprint: "W5" },
  { url: "/parts/operations/exceptions",      actionKey: "stock.exception-move",  label: "處置例外庫存",     sprint: "W5" },
  { url: "/parts/operations/consignment",     actionKey: "stock.consignment",     label: "新增寄存單",       sprint: "W5" },
  { url: "/parts/alerts/thresholds",          actionKey: "alerts.threshold",      label: "新增水位設定",     sprint: "W6" },
  { url: "/parts/alerts/rules",               actionKey: "alerts.rule",           label: "新增告警規則",     sprint: "W6" },
  { url: "/parts/warranty/used-parts",        actionKey: "warranty.used-part",    label: "登記舊件入庫",     sprint: "W6" },
  { url: "/parts/warranty/cost-recovery",     actionKey: "warranty.cost-recovery",label: "新增索賠單",       sprint: "W6" },
];

const CATCH_ALL_DESIGN_PAGES = [
  "/parts/setup/purchase-permissions",
  "/parts/setup/item-permissions",
  "/parts/setup/count-rules",
  "/parts/purchase/flow",
  "/parts/alerts/escalation",
  "/parts/alerts/work-order-loop",
  "/parts/warranty/flow",
  "/parts/warranty/ro-link",
  "/parts/warranty/used-parts-flow",
  "/parts/analytics/abc-structure",
  "/parts/overview/flow",
];

// inline 設計稿內已知有 onclick="alert(...)" 的頁面
const ALERT_INLINE_PAGES = [
  { url: "/parts/setup/purchase-permissions", expectAlerts: 1 },
  { url: "/parts/setup/item-permissions",     expectAlerts: 1 },
  { url: "/parts/setup/count-rules",          expectAlerts: 1 },
  { url: "/parts/alerts/escalation",          expectAlerts: 3 },
  { url: "/parts/alerts/work-order-loop",     expectAlerts: 3 },
  { url: "/parts/warranty/ro-link",           expectAlerts: 4 },
  { url: "/parts/warranty/used-parts-flow",   expectAlerts: 2 },
];

// ── 測試 ────────────────────────────────────────────
test.describe("W2-W6 stub action button", () => {
  for (const page of STUB_PAGES) {
    test(`${page.url} — ${page.label} 顯示「下版開放」`, async ({ page: p }) => {
      await p.goto(page.url);
      const btn = p.locator(`[data-stub-action="${page.actionKey}"]`);
      await expect(btn).toBeVisible();
      await expect(btn).toContainText(page.label);

      await btn.click();
      // 處理中 spinner
      await expect(btn).toBeDisabled();

      // hint 出現
      const hint = p.locator('[role="status"]');
      await expect(hint).toContainText(/下版開放/);
      await expect(hint).toContainText(page.sprint);
    });
  }
});

test.describe("11 純設定頁走 catch-all inline", () => {
  for (const url of CATCH_ALL_DESIGN_PAGES) {
    test(`${url} — Stitch 設計稿 inline 渲染`, async ({ page }) => {
      await page.goto(url);
      // body html 寬度設定固定 1100px(取自 PartsInline component)
      const inlineRoot = page.locator(".min-w-\\[1100px\\]");
      await expect(inlineRoot).toBeVisible();
      // 並注入 helpers
      const helperType = await page.evaluate(() => typeof (window as unknown as { go: unknown }).go);
      expect(helperType).toBe("function");
    });
  }
});

test.describe("inline 內 onclick alert 觸發", () => {
  for (const { url, expectAlerts } of ALERT_INLINE_PAGES) {
    test(`${url} — alert ${expectAlerts} 個都能觸發`, async ({ page }) => {
      await page.goto(url);
      // 攔截所有 alert dialog
      const dialogs: string[] = [];
      page.on("dialog", async (d) => {
        dialogs.push(d.message());
        await d.accept();
      });

      const buttons = page.locator('[onclick*="alert"]');
      const count = await buttons.count();
      expect(count).toBe(expectAlerts);
      for (let i = 0; i < count; i++) {
        await buttons.nth(i).click();
      }
      // 所有 dialog 都被觸發
      expect(dialogs.length).toBe(expectAlerts);
      for (const msg of dialogs) {
        expect(msg.length).toBeGreaterThan(0);
      }
    });
  }
});
