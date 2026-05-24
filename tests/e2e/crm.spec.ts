/**
 * 第十一輪 E2E · Batch F — CRM 客服管理模組 ×4（+CRM-05 NPS 金標獨立 describe）
 *
 * 來源：DealerOS_全系統測試腳本_v1.0.docx 第三章。
 * persona：crm_agent（CRM 主管/客服）、rs_manager（店長綜合報表）。
 * 依賴：CRM-01 需 RS-10 成交客戶（陳先生）；CRM-03 需 SA-06 何先生回廠同步；CRM-04 需 RS/SA/INV 數字。
 * route：見 tests/e2e/case-matrix.md「CRM」節。
 */
import { test, expect, useRole } from "./helpers/role-fixtures";
import baselines from "./fixtures/report-baselines.json";

// 金標容差比對 helper（沿用 rs.spec.ts 模式）
const GOLD_TOL = (baselines._meta.tolerance_pct ?? 2) / 100;
function within(actual: number, expected: number): boolean {
  return expected === 0 ? actual === 0 : Math.abs(actual - expected) / expected <= GOLD_TOL;
}
function parseNum(s: string | null): number {
  if (!s) return NaN;
  return Number(s.replace(/[^\d.-]/g, ""));
}

// ──────────────────────────────────────────────────────────
test.describe("CRM-01 銷售 CRM — 客戶基盤查詢與電訪工作排程", () => {
  // persona: crm_agent · deps: RS-10（陳先生成交）
  // route: /crm/sales/customer-base(CRM01A)、/crm/sales/survey-templates(CRM02A)、/crm/sales/call-tasks(CRM03A)
  useRole("crm_agent");

  test("CRM01A 客戶基盤可查 / 篩選（HABC 分級 + 跟進狀態）", async ({ page }) => {
    // Step 1) 進銷售客戶基盤
    await page.goto("/crm/sales/customer-base");
    await expect(page).toHaveURL(/\/crm\/sales\/customer-base/);
    // ✓ gate 通過（crm_agent 有 customer.view）— 標題在、權限拒絕字串不在
    await expect(page.getByRole("heading", { name: "銷售客戶基盤" })).toBeVisible();
    await expect(page.getByText("沒有檢視客戶基盤的權限")).toHaveCount(0);
    // view switcher 常駐（banner 僅在操作後出現，不適合當載入錨）
    await expect(page.getByTestId("view-toggle-kanban")).toBeVisible();

    // ✓ CRM01A 看板（HABC 分級）：切 kanban view 看 A/B/C/H 分桶
    await page.getByTestId("view-toggle-kanban").click();
    await expect(page).toHaveURL(/view=kanban/);
    await expect(page.getByTestId("kanban-wrap")).toBeVisible();
    // Indian seed 45 筆已分級 → 至少一張客戶卡
    await expect(page.locator('[data-testid^="kanban-card-"]').first()).toBeVisible();

    // Step 2) 篩選跟進狀態（follow_status，board filter 走 query string）
    await page.goto("/crm/sales/customer-base?follow_status=pending&view=card");
    await expect(page).toHaveURL(/follow_status=pending/);
    await expect(page.getByRole("heading", { name: "銷售客戶基盤" })).toBeVisible();
  });

  test("CRM03A 電訪工作台可載入 / 任務排程（call_tasks）", async ({ page }) => {
    // Step 5) CRM03A 電訪工作台
    await page.goto("/crm/sales/call-tasks");
    await expect(page).toHaveURL(/\/crm\/sales\/call-tasks/);
    await expect(page.getByText("沒有檢視電訪工作台的權限")).toHaveCount(0);
    // ✓ 工作台核心控制項：日期導覽 + 區間 tabs + 當日總數 + 新增入口
    await expect(page.getByTestId("call-tasks-date-input")).toBeVisible();
    await expect(page.getByTestId("call-tasks-range-tabs")).toBeVisible();
    await expect(page.getByTestId("call-tasks-date-total")).toBeVisible();
    await expect(page.getByTestId("call-tasks-create-link")).toBeVisible();
    // ✓ 切「近 7 天」區間（不寫入，僅查詢）
    await page.getByTestId("call-tasks-range-7d").click();
    await expect(page).toHaveURL(/range=7d/);
  });
});

// ──────────────────────────────────────────────────────────
test.describe("CRM-02 銷售 CRM — 休眠戰敗管理與推播通知", () => {
  // persona: crm_agent · deps: 無
  // route: /crm/sales/dormant-leads(CRM04A)、/crm/sales/nps(CRM05A)、/crm/sales/push-notifications(CRM06A)
  useRole("crm_agent");

  test("CRM04A 休眠 / 戰敗分群（休眠管理 + 戰敗原因分析）", async ({ page }) => {
    // Step 1) CRM04A 休眠戰敗管理
    await page.goto("/crm/sales/dormant-leads");
    await expect(page).toHaveURL(/\/crm\/sales\/dormant-leads/);
    await expect(page.getByText("沒有檢視休眠戰敗管理的權限")).toHaveCount(0);
    // ✓ 兩大分群 tab：休眠客戶管理 / 戰敗原因分析
    await expect(page.getByTestId("dormant-tab-1")).toBeVisible();
    await expect(page.getByTestId("dormant-tab-2")).toBeVisible();
    // ✓ Tab1 KPI 分桶（休眠分桶）
    await expect(page.getByTestId("tab1-kpi-row")).toBeVisible();
    // ✓ 切到 Tab2 戰敗原因分析（Indian seed 有 lost=11 戰敗客戶含 lost_reason）
    await page.getByTestId("dormant-tab-2").click();
    await expect(page.getByText("戰敗原因分析")).toBeVisible();
  });

  test("CRM06A 推播通知範本（LINE bubble 預覽 + 變數代入）", async ({ page }) => {
    // Step 3) CRM06A 推播通知 — 驗 UI / 範本預覽即可，不真送 LINE
    await page.goto("/crm/sales/push-notifications");
    await expect(page).toHaveURL(/\/crm\/sales\/push-notifications/);
    await expect(page.getByText("沒有檢視推播通知的權限")).toHaveCount(0);
    // ✓ 推播頁載入（h1 / 列表模式）— 不觸發任何 dispatch / 寫入
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("CRM05A 銷售 NPS 看板（推薦者 / 中立者 / 批評者占比）", async ({ page }) => {
    // Step 5) CRM05A NPS 看板
    await page.goto("/crm/sales/nps");
    await expect(page).toHaveURL(/\/crm\/sales\/nps/);
    await expect(page.getByText("沒有檢視銷售 NPS 看板的權限")).toHaveCount(0);
    // ✓ NPS hero + 分數 + 推薦/中立/批評 三區段堆疊條
    await expect(page.getByTestId("nps-hero")).toBeVisible();
    await expect(page.getByTestId("nps-kpi-score")).toBeVisible();
    await expect(page.getByTestId("nps-stacked-bar")).toBeVisible();
    // 三區段占比（推薦/中立/批評）— 用 segment testid（文字在 title 屬性內）
    await expect(page.getByTestId("nps-seg-promoter-pct")).toBeVisible();
    await expect(page.getByTestId("nps-seg-detractor-pct")).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────
test.describe("CRM-03 售後 CRM — 客戶基盤、電訪、休眠流失", () => {
  // persona: crm_agent · deps: SA-06（何先生回廠同步）
  // route: /crm/aftersales/customer-base(CRM01B)、/crm/aftersales/call-tasks(CRM03B)、/crm/aftersales/dormant-customers(CRM04B)
  useRole("crm_agent");

  test("CRM01B 售後客戶基盤 + CRM03B 電訪工作台可載入", async ({ page }) => {
    // Step 1) CRM01B 售後客戶基盤
    await page.goto("/crm/aftersales/customer-base");
    await expect(page).toHaveURL(/\/crm\/aftersales\/customer-base/);
    await expect(page.getByText("沒有檢視售後客戶基盤的權限")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "售後客戶基盤" })).toBeVisible();
    await expect(page.getByTestId("aftersales-customer-base-create-link")).toBeVisible();

    // Step 4) CRM03B 售後電訪工作台（共用 call-tasks board，含日期 / 區間 / 總數）
    await page.goto("/crm/aftersales/call-tasks");
    await expect(page).toHaveURL(/\/crm\/aftersales\/call-tasks/);
    await expect(page.getByText("沒有檢視電訪工作台的權限")).toHaveCount(0);
    await expect(page.getByTestId("call-tasks-date-total")).toBeVisible();
  });

  test("CRM04B 售後休眠流失分群（180 天未回廠 + 流失風險分析）", async ({ page }) => {
    // Step 3) CRM04B 休眠流失管理
    await page.goto("/crm/aftersales/dormant-customers");
    await expect(page).toHaveURL(/\/crm\/aftersales\/dormant-customers/);
    await expect(page.getByText("沒有檢視休眠流失管理的權限")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "售後休眠流失管理" })).toBeVisible();
    // ✓ 售後版兩 tab：休眠 / 已流失（Indian seed 有 dormant_180 + lost）
    const dormantTab = page.getByRole("button", { name: /💤 休眠/ });
    const lostTab = page.getByRole("button", { name: /🚫 已流失/ });
    await expect(dormantTab).toBeVisible();
    await expect(lostTab).toBeVisible();
    // 切到已流失 tab → URL 帶 tab=lost、流失原因欄出現
    await lostTab.click();
    await expect(page).toHaveURL(/tab=lost/);
    await expect(page.getByText("流失原因分佈 Top 5")).toBeVisible();
  });

  test("CRM05B 售後 NPS 看板可載入", async ({ page }) => {
    // Step 5) CRM05B 售後 NPS 看板
    await page.goto("/crm/aftersales/nps");
    await expect(page).toHaveURL(/\/crm\/aftersales\/nps/);
    await expect(page.getByText("沒有檢視售後 NPS 看板的權限")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "售後 NPS 看板" })).toBeVisible();
    await expect(page.getByTestId("nps-kpi-row")).toBeVisible();
  });
});

// ──────────────────────────────────────────────────────────
test.describe("CRM-04 店長綜合報表 — 三大模組 KPI 一頁總覽 ⭐金標", () => {
  // persona: rs_manager（店長）· deps: RS-03 數字、SA 工單、INV 庫存
  // route: /crm/store-report(CRM07)
  // 報表金標：對 fixtures/report-baselines.json 的 crm_04_store_report 容差 ±2%
  useRole("rs_manager");

  test("一頁掌握三模組本月 KPI（預設近 30 天）對 baseline ±2% ⭐金標", async ({ page }) => {
    const b = baselines.crm_04_store_report;
    // Step 1) 店長進 CRM07（預設 range=30d，對應 baseline 近 30 天窗口）
    await page.goto("/crm/store-report");
    await expect(page).toHaveURL(/\/crm\/store-report/);
    await expect(page.getByTestId("store-report-page")).toBeVisible();
    // 載入 < 5 秒：等首屏 KPI 卡 render
    await expect(page.getByTestId("store-report-kpi").first()).toBeVisible({ timeout: 5000 });

    // ── 抓頁面實際顯示數字（KPI 卡共用 store-report-kpi，靠 label 文字定位） ──
    const kpiCard = (label: string) =>
      page.getByTestId("store-report-kpi").filter({ hasText: label }).first();

    // 售後工單台次（value = workOrderCount，sub = 平均單價 NT$X）
    const woCard = kpiCard("售後工單台次");
    const woValueText = await woCard.locator("div").nth(1).innerText();
    const woCount = parseNum(woValueText);
    // 平均單價在 sub：「平均單價 NT$4,291」
    const woSubText = await woCard.locator("div").last().innerText();
    const woAvg = parseNum(woSubText);

    // 整體 NPS（RS+SA）value = combinedNps（含 +/- 號）
    const npsCard = kpiCard("整體 NPS（RS+SA）");
    const combinedNps = parseNum(await npsCard.locator("div").nth(1).innerText());

    // 逾期未回廠客戶（售後區塊 warn KPI）value = overdueCount
    const overdueCard = kpiCard("逾期未回廠客戶");
    const overdueCount = parseNum(await overdueCard.locator("div").nth(1).innerText());

    // active leads：銷售區塊「D+3 回訪完成率」sub 顯示「{active}/{active+dormant} 件」
    const d3Card = kpiCard("D+3 回訪完成率").first();
    const d3SubText = await d3Card.locator("div").last().innerText(); // 例「43/60 件」
    const activeLeads = parseNum((d3SubText.split("/")[0] ?? "").trim());

    // ── 逐項對 baseline ±2% ──
    console.log(
      `[CRM-04 金標] workOrderCount actual=${woCount} expected=${b.kpi.work_order_count} | ` +
        `workOrderAvg actual=${woAvg} expected=${b.kpi.work_order_avg_amount} | ` +
        `combinedNps actual=${combinedNps} expected=${b.kpi.combined_nps} | ` +
        `overdue actual=${overdueCount} expected=${b.service_kpi.overdue_count} | ` +
        `activeLeads actual=${activeLeads} expected=${b.sales_lead_kpi.active}`,
    );
    expect(within(woCount, b.kpi.work_order_count), `工單台次 ${woCount} vs ${b.kpi.work_order_count}`).toBe(true);
    expect(within(woAvg, b.kpi.work_order_avg_amount), `平均單價 ${woAvg} vs ${b.kpi.work_order_avg_amount}`).toBe(true);
    expect(within(combinedNps, b.kpi.combined_nps), `整體NPS ${combinedNps} vs ${b.kpi.combined_nps}`).toBe(true);
    expect(within(overdueCount, b.service_kpi.overdue_count), `逾期 ${overdueCount} vs ${b.service_kpi.overdue_count}`).toBe(true);
    expect(within(activeLeads, b.sales_lead_kpi.active), `activeLeads ${activeLeads} vs ${b.sales_lead_kpi.active}`).toBe(true);

    await page.screenshot({ path: "docs/test-evidence/round-11/CRM-04.png", fullPage: true });
  });
});

// ──────────────────────────────────────────────────────────
test.describe("CRM-05 NPS 看板 ⭐金標（銷售 + 售後）", () => {
  // persona: crm_agent · deps: CRM-01/02（銷售 NPS）、CRM-03（售後 NPS）
  // route: /crm/sales/nps(CRM05A)、/crm/aftersales/nps(CRM05B)
  // 報表金標：crm_05_nps_dashboard（銷售）+ crm_05_nps_aftersales（售後）容差 ±2%
  useRole("crm_agent");

  test("銷售 NPS 看板：NPS 分數 + 三群人數 對 baseline ±2% ⭐金標", async ({ page }) => {
    const b = baselines.crm_05_nps_dashboard;
    // Step 1) 進 CRM05A 銷售 NPS 看板（預設 range=6m，對應 baseline 窗口）
    await page.goto("/crm/sales/nps");
    await expect(page).toHaveURL(/\/crm\/sales\/nps/);
    await expect(page.getByTestId("nps-hero")).toBeVisible({ timeout: 5000 });

    const npsScore = parseNum(await page.getByTestId("nps-kpi-score").innerText());
    const promoter = parseNum(await page.getByTestId("nps-seg-promoter-n").innerText());
    const passive = parseNum(await page.getByTestId("nps-seg-passive-n").innerText());
    const detractor = parseNum(await page.getByTestId("nps-seg-detractor-n").innerText());

    console.log(
      `[CRM-05 銷售 金標] npsScore actual=${npsScore} expected=${b.nps_score} | ` +
        `P actual=${promoter} expected=${b.promoter} | Pa actual=${passive} expected=${b.passive} | ` +
        `D actual=${detractor} expected=${b.detractor}`,
    );
    expect(within(npsScore, b.nps_score), `銷售NPS ${npsScore} vs ${b.nps_score}`).toBe(true);
    expect(within(promoter, b.promoter), `promoter ${promoter} vs ${b.promoter}`).toBe(true);
    expect(within(passive, b.passive), `passive ${passive} vs ${b.passive}`).toBe(true);
    expect(within(detractor, b.detractor), `detractor ${detractor} vs ${b.detractor}`).toBe(true);

    await page.screenshot({ path: "docs/test-evidence/round-11/CRM-05-sales.png", fullPage: true });
  });

  test("售後 NPS 看板：NPS 分數 + 三群人數 對 baseline ±2% ⭐金標", async ({ page }) => {
    const b = baselines.crm_05_nps_aftersales;
    // Step 1) 進 CRM05B 售後 NPS 看板（預設 range=6m）
    await page.goto("/crm/aftersales/nps");
    await expect(page).toHaveURL(/\/crm\/aftersales\/nps/);
    await expect(page.getByTestId("nps-kpi-row")).toBeVisible({ timeout: 5000 });

    // NPS 指數在 nps-kpi-row 第一張卡（label 含「NPS 指數」）
    const npsScore = parseNum(
      await page.getByTestId("nps-kpi-row").locator("text=/^[+-]?\\d+$/").first().innerText(),
    );
    // 三群人數：donut 下方明細（純顯示，board 補的 testid）
    const promoter = parseNum(await page.getByTestId("nps-seg-promoter-n").innerText());
    const passive = parseNum(await page.getByTestId("nps-seg-passive-n").innerText());
    const detractor = parseNum(await page.getByTestId("nps-seg-detractor-n").innerText());

    console.log(
      `[CRM-05 售後 金標] npsScore actual=${npsScore} expected=${b.nps_score} | ` +
        `P actual=${promoter} expected=${b.promoter} | Pa actual=${passive} expected=${b.passive} | ` +
        `D actual=${detractor} expected=${b.detractor}`,
    );
    expect(within(npsScore, b.nps_score), `售後NPS ${npsScore} vs ${b.nps_score}`).toBe(true);
    expect(within(promoter, b.promoter), `promoter ${promoter} vs ${b.promoter}`).toBe(true);
    expect(within(passive, b.passive), `passive ${passive} vs ${b.passive}`).toBe(true);
    expect(within(detractor, b.detractor), `detractor ${detractor} vs ${b.detractor}`).toBe(true);

    await page.screenshot({ path: "docs/test-evidence/round-11/CRM-05-aftersales.png", fullPage: true });
  });
});
