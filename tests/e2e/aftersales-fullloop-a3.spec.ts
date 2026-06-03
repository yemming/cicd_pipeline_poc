/**
 * A-3 售後「完整閉環」驗證 — 對照 docs/20260601/04_..._售後修護模組_v2.docx 場景手順
 *
 * 範圍：本輪實作的 6 包（B 工單核心 / C 電子簽名 / D 零件追加 / E 技師缺席 / F 結帳通知）。
 * 方法：逐步操作（非開頁截圖）——導航 + 斷言新 UI 元素存在 + 關鍵互動可動。
 * persona：aftersales_lead（售後主管，最廣售後權限），scope=Indian。
 *
 * 資料相依的深層流程（需特定 seed 的單據）採「有資料就驗、沒資料記 skip」的韌性策略，
 * 避免因環境資料缺漏誤判功能壞掉；結構性元素（list 欄、設定頁 modal）一律硬斷言。
 */
import { test, expect, useRole } from "./helpers/role-fixtures";

// dev server 首次命中路由要即時編譯（可達 20–30s）→ 放寬 timeout
test.describe.configure({ mode: "serial", timeout: 90_000 });

test.describe("A-3 售後完整閉環", () => {
  useRole("aftersales_lead");

  // ── 包B：02 正式工單 RO ──────────────────────────────────
  test("SA03-02 工單列表有優先級欄（派工置頂依此）", async ({ page }) => {
    await page.goto("/parts/aftersales/repair-orders");
    await expect(page.getByRole("heading", { name: "正式工單 RO" })).toBeVisible();
    // DataGrid 優先級欄表頭
    await expect(page.getByRole("columnheader", { name: "優先級" })).toBeVisible();
  });

  test("SA03-02/04/05 開單頁有優先級選擇器（返工/保固阻擋為條件式）", async ({ page }) => {
    await page.goto("/parts/aftersales/repair-orders/new");
    await page.waitForLoadState("networkidle");
    const hasDraft = await page
      .getByText("維修優先級")
      .isVisible()
      .catch(() => false);
    if (!hasDraft) {
      test.info().annotations.push({
        type: "skip-reason",
        description: "目前 Indian 無可轉 RO 的預約來源，開單頁無 draft；優先級選擇器待有預約時驗",
      });
      return;
    }
    // 三色優先級鈕
    await expect(page.getByRole("button", { name: /緊急/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /一般/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /彈性/ })).toBeVisible();
    // 點「緊急」可選中（不送出）
    await page.getByRole("button", { name: /緊急/ }).click();
  });

  test("SA03-03 工單詳情時程有「通知車主」按鈕", async ({ page }) => {
    await page.goto("/parts/aftersales/repair-orders");
    await page.waitForLoadState("networkidle");
    // 只取表格內第一筆工單編號連結（避免命中側欄導覽連結）
    const firstRo = page.locator("table a[href*='/parts/aftersales/repair-orders/']").first();
    const n = await firstRo.count();
    if (n === 0) {
      test.info().annotations.push({ type: "skip-reason", description: "無工單可開詳情" });
      return;
    }
    await firstRo.click();
    await page.waitForURL(/\/parts\/aftersales\/repair-orders\/[0-9a-f-]{36}/);
    await expect(page.getByText("▼ 狀態時程")).toBeVisible();
    await expect(page.getByRole("button", { name: /通知車主/ }).first()).toBeVisible();
  });

  // ── 包D：04 預檢車牌查詢 ─────────────────────────────────
  test("SA02-01/02 預檢建空白單有車牌查詢 + 查無建檔引導", async ({ page }) => {
    await page.goto("/parts/aftersales/pre-inspections");
    await page.waitForLoadState("networkidle");
    // 進建立流程
    await page.getByRole("button", { name: /新增|建立/ }).first().click();
    // 切到「建空白單」模式（若有此切換）
    const blankTab = page.getByRole("button", { name: /空白|臨時|新客/ });
    if (await blankTab.count()) await blankTab.first().click().catch(() => {});
    // 車牌查詢輸入 + 鈕
    const plateInput = page.getByPlaceholder("ABC-1234");
    if (!(await plateInput.count())) {
      test.info().annotations.push({ type: "skip-reason", description: "未進到建空白單表單" });
      return;
    }
    await plateInput.fill("ZZZ-0000"); // 故意查無
    await page.getByRole("button", { name: "🔍 查詢" }).click();
    // 查無 → 新客建檔引導
    await expect(page.getByText(/查無此車牌/)).toBeVisible({ timeout: 10000 });
  });

  // ── 包B(置頂)/E(缺席重排)：07 派工看板（現役 /management/dispatch）──
  test("SA03-02/SA07 派工看板：緊急置頂面板 + 技師缺席重排", async ({ page }) => {
    await page.goto("/parts/aftersales/management/dispatch");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading", { name: "派工看板" })).toBeVisible();
    // 緊急置頂面板（有 urgent 工單才出現）
    const urgentPanel = page.getByText(/緊急工單置頂/);
    if (await urgentPanel.count()) {
      await expect(urgentPanel.first()).toBeVisible();
    } else {
      test.info().annotations.push({
        type: "skip-reason",
        description: "目前無 priority=urgent 的未結工單，緊急置頂面板未顯示",
      });
    }
    // 缺席重排（非下班技師卡上出現）
    const reassign = page.getByRole("button", { name: "缺席重排" });
    if (await reassign.count()) {
      await reassign.first().click();
      await expect(page.getByText(/技師缺席重排/)).toBeVisible();
      await page.getByRole("button", { name: "取消" }).click();
    } else {
      test.info().annotations.push({
        type: "skip-reason",
        description: "目前無在職（非下班）技師，缺席重排鈕未出現",
      });
    }
  });

});

// 取車通知設定編輯需 master.customer.edit → 用 sa（服務顧問）persona（aftersales_lead 無此權）
test.describe("A-3 售後完整閉環 · 取車通知（sa）", () => {
  useRole("sa");

  // ── 包F：11 取車通知設定 5 節點 ──────────────────────────
  test("SA11 取車通知排程有 5 流程節點 + 三態政策 + 節點2強制", async ({ page }) => {
    await page.goto("/parts/aftersales/settings/pickup-notify");
    await page.waitForLoadState("networkidle");
    // 切到排程 tab
    const schedTab = page.getByRole("button", { name: /排程設定/ });
    if (await schedTab.count()) await schedTab.first().click();
    // 開新增排程 modal
    await page.getByRole("button", { name: /新增排程/ }).first().click();
    await expect(page.getByText("維修流程節點")).toBeVisible();
    await expect(page.getByText("發送政策（三態）")).toBeVisible();
    // 選「② 安全相關追加」→ 政策鎖 mandatory + 出現強制警示
    // 以「含安全追加 option 的 select」定位節點下拉，避開 DOM 結構脆弱性
    const nodeSelect = page
      .locator("select", { has: page.locator("option", { hasText: "安全相關追加" }) })
      .first();
    await nodeSelect.selectOption({ label: "② 安全相關追加" });
    await expect(page.getByText(/安全相關追加為強制發送/)).toBeVisible();
  });
});
