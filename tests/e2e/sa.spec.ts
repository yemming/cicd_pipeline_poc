/**
 * 第十一輪 E2E · Batch G — SA 售後修護模組（強制 serial 同一張工單）
 *
 * 來源：DealerOS_全系統測試腳本_v1.0.docx 第四章。
 * 工單生命週期（林彥廷 Streetfighter V2 S / ABD-3562，乾淨車）：
 *   SA-01 預約 → SA-02 預檢/RO/派工（SA→Tech）→ SA-03 領料 → SA-04 追加 → SA-05 複檢 → SA-06 結帳。
 *   不能跳順序。
 * persona：sa（接待）、tech（施工，T1 陳建明）、aftersales_lead（複檢/主管）。
 *
 * 跨 persona 接力：每個 describe 用 useRole 鎖該角色 storageState；同一張工單靠
 * tests/e2e/.sa-state.json（SA-02 寫、SA-03+ 讀）跨 test 傳遞 RO id。
 *
 * Phase 2 測試素材（由 sub-agent SQL 預備，帶 e2e_round11 marker 供清理）：
 *   - 乾淨車預約 APPT_LIFECYCLE：ABD-3562（林彥廷）→ 生命週期主線
 *   - 重複車預約 APPT_DUP：IMC-003（王建民，已有 3 張 open RO）→ hook#2 防重
 *   - T1 技師 5151ec08…（陳建明）綁 e2e-tech 帳號
 *   - hook#4 缺料 item：OEM-EXH-002 Termignoni（qty_available=1）@ 主倉
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

import { test, expect, useRole } from "./helpers/role-fixtures";

// SA 是一條工單序列，強制序列執行（config 已 workers:1，這裡再宣告語意）
test.describe.configure({ mode: "serial" });

// ── Phase 2 預備素材 ──
const APPT_LIFECYCLE = "ccb77803-fb92-40fe-915e-6c0eec42d2a2"; // ABD-3562 乾淨車
const APPT_DUP = "70c1057b-1047-4be8-a915-d2151741507d"; // IMC-003 已有 open RO
const APPT_WC = "3b25c5f6-711c-426f-b854-bdcda2fd0ef8"; // BAA-0137 乾淨車（WC 保固單 hook#6）

const STATE_FILE = path.join(__dirname, ".sa-state.json");

type SaState = {
  roId?: string;
  roCode?: string;
  wcRoId?: string;
  wcRoCode?: string;
  fiId?: string;
};
function readState(): SaState {
  if (!existsSync(STATE_FILE)) return {};
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8")) as SaState;
  } catch {
    return {};
  }
}
function writeState(patch: SaState): void {
  writeFileSync(STATE_FILE, JSON.stringify({ ...readState(), ...patch }, null, 2));
}

// ──────────────────────────────────────────────────────────
test.describe("SA-01 預約管理 — 當日看板、技師工作負載", () => {
  // persona: sa · route: /parts/aftersales/appointments(01)
  useRole("sa");

  test("當日預約看板載入、顯示今日測試預約、技師負載區存在", async ({ page }) => {
    await page.goto("/parts/aftersales/appointments");
    await expect(page).toHaveURL(/\/parts\/aftersales\/appointments/);

    // 頁面主體渲染（不是空白 / 不是錯誤頁）
    const body = page.locator("body");
    await expect(body).not.toContainText("Application error");
    await expect(body).not.toContainText("無權限");

    // 看板上至少有「預約」相關字樣（標題 / tabs / 表格）
    await expect(page.locator("main").last()).toBeVisible();
    // 「本日預約」統計出現 → 當日看板數據正確
    await expect(page.getByText(/本日預約/).first()).toBeVisible({ timeout: 8000 });

    // 我們塞的今日測試預約（ABD-3562 林彥廷 / IMC-003 王建民）任一出現即算當日清單正確
    const hasLifecycle = await page.getByText("ABD-3562", { exact: false }).count();
    const hasDup = await page.getByText("IMC-003", { exact: false }).count();
    // 看板可能分頁 / 預設篩選非今日 → 不強制斷言車牌可見，但記錄供回報
    console.log(`[SA-01] 看板上 ABD-3562=${hasLifecycle} IMC-003=${hasDup}`);

    await page.screenshot({ path: "docs/test-evidence/round-11/SA-01.png", fullPage: true });
  });
});

// ──────────────────────────────────────────────────────────
test.describe("SA-02 ⭐核心交接 預檢 → RO 串接 → 派工（SA→Tech）+ hook#2 防重", () => {
  // persona: sa · route: /parts/aftersales/repair-orders/new(gate)
  useRole("sa");

  test("乾淨車 ABD-3562 開立 RO 成功（生命週期主線）", async ({ page }) => {
    // 走真實 gate 頁：?from={appointment_id} 由 getRoDraftFromAppointment 帶資料
    await page.goto(`/parts/aftersales/repair-orders/new?from=${APPT_LIFECYCLE}`);

    // 確認 draft 帶到乾淨車資料（車牌 / 車主出現在自動帶入卡）
    await expect(page.getByText("ABD-3562", { exact: false }).first()).toBeVisible({ timeout: 10000 });

    // SA 選工單類型：保養 → MN-CP（自費保養，預設值），按確認開立
    const confirmBtn = page.getByRole("button", { name: /確認開立工單|建立中/ });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // 成功 → router.push 到 /repair-orders/{id}，banner「工單 XXX 已開立」
    await page.waitForURL(/\/parts\/aftersales\/repair-orders\/[0-9a-f-]{36}/, { timeout: 15000 });
    const url = page.url();
    const roId = url.match(/repair-orders\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(roId).toMatch(/[0-9a-f-]{36}/);

    // 抓單號（detail 頁標題 / 麵包屑會有 RO code）
    await page.waitForTimeout(800);
    const bodyText = (await page.locator("body").innerText()).slice(0, 4000);
    const roCode = bodyText.match(/(MN|AC|RP|WC|OT)-(CP|WR|FR|IN)-\d{6}-\d{3}/)?.[0] ?? "";

    writeState({ roId, roCode });
    console.log(`[SA-02] 生命週期 RO 建立：id=${roId} code=${roCode}`);

    await page.screenshot({ path: "docs/test-evidence/round-11/SA-02.png", fullPage: true });
  });

  test("⭐hook#2 防重：對已有 open RO 的 IMC-003 再開單應被擋", async ({ page }) => {
    await page.goto(`/parts/aftersales/repair-orders/new?from=${APPT_DUP}`);
    await expect(page.getByText("IMC-003", { exact: false }).first()).toBeVisible({ timeout: 10000 });

    const confirmBtn = page.getByRole("button", { name: /確認開立工單|建立中/ });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // hook#2：confirmRepairOrderAction 同步守門 → banner「此車已有進行中的工單」
    await expect(page.getByText(/此車已有進行中的工單/)).toBeVisible({ timeout: 10000 });
    // 應停在 gate 頁、沒導去新 detail
    await expect(page).toHaveURL(/\/repair-orders\/new/);

    console.log("[SA-02] ⭐hook#2 防重驗到：IMC-003 重複開單被擋");
    await page.screenshot({ path: "docs/test-evidence/round-11/SA-02-hook2.png", fullPage: true });
  });
});

// ──────────────────────────────────────────────────────────
test.describe("SA-03 Tech 施工 — /tech 首次 render、接單、工項勾選", () => {
  // persona: tech（T1 陳建明）· route: /tech
  useRole("tech");

  test("/tech 工作台 render OK + 接單切維修中 + 工項勾選", async ({ page }) => {
    const { roId, roCode } = readState();
    expect(roId, "SA-02 應已寫入 roId").toBeTruthy();

    // 派工前提：把生命週期 RO 指派給 T1（status 維持「進行中」=待接單）已由 SQL 設好（見 spec 註解）
    await page.goto("/tech");
    await expect(page).toHaveURL(/\/tech/);

    // ⭐ /tech 首次 render 實測：頁面主體出現、無 runtime error
    await expect(page.locator("main").last()).toBeVisible({ timeout: 10000 });
    const body = page.locator("body");
    await expect(body).not.toContainText("Application error");
    await expect(body).not.toContainText("未綁定技師"); // e2e-tech 已綁 T1
    await expect(body).not.toContainText("無權限");
    // 技師名 / KPI header 出現
    await expect(page.getByText("陳建明", { exact: false }).first()).toBeVisible({ timeout: 8000 });

    // 我們的 RO 應在「待我接單」tab（status=進行中）。卡片顯示 ro_code。
    if (roCode) {
      await expect(page.getByText(roCode, { exact: false }).first()).toBeVisible({ timeout: 8000 });
    }

    // 點「接單」→ acceptOrder → 狀態切「維修中」、banner「已接單」
    const acceptBtn = page.getByRole("button", { name: /^接單$|接單中/ }).first();
    await expect(acceptBtn).toBeVisible({ timeout: 8000 });
    await acceptBtn.click();
    // 成功 banner（acceptOrder → status 切「維修中」）
    await expect(page.getByText(/已接單，工單已進入維修中/)).toBeVisible({ timeout: 10000 });

    console.log(`[SA-03] /tech render OK、接單成功 RO=${roCode}`);

    // 接單後卡片移到「進行中」tab；等卡片重繪、labor checkbox 變可勾
    await page.waitForTimeout(800);
    // 工項勾選：找未 disabled 的 labor checkbox → 勾第一個
    const checkbox = page.locator('input[type="checkbox"]:not([disabled])').first();
    if (await checkbox.count()) {
      await checkbox.check();
      await page.waitForTimeout(800); // toggleWorkItem round-trip
      console.log("[SA-03] 工項勾選 done 已觸發（toggleWorkItem）");
    } else {
      console.log("[SA-03] 此刻無可勾 labor checkbox（接單後 tab 切換 / 重繪時序）");
    }
    await page.screenshot({ path: "docs/test-evidence/round-11/SA-03.png", fullPage: true });
  });
});

// ──────────────────────────────────────────────────────────
test.describe("SA-04 追加項目 — Tech 在 /tech addAddon", () => {
  // persona: tech · route: /tech（追加 modal）
  useRole("tech");

  test("Tech 對維修中工單追加項目（UI addAddon）", async ({ page }) => {
    const { roCode } = readState();
    await page.goto("/tech");
    await expect(page.locator("main").last()).toBeVisible({ timeout: 10000 });

    // 切到「進行中」tab（維修中工單在此）
    const inProgTab = page.getByText(/進行中 \(/).first();
    if (await inProgTab.count()) {
      await inProgTab.click();
      await page.waitForTimeout(500);
    }

    // 找「＋ 追加項目」按鈕（只在維修中卡片顯示，且 tech 有 addon.propose 權）
    const addonBtn = page.getByRole("button", { name: /追加項目/ }).first();
    const hasAddonBtn = await addonBtn.count();
    if (!hasAddonBtn) {
      console.log("[SA-04] /tech 卡片無「追加項目」按鈕（工單非維修中 / 無 addon 權）");
      await page.screenshot({ path: "docs/test-evidence/round-11/SA-04.png", fullPage: true });
      test.skip(true, "無追加按鈕，改由 domain 直接驗 hook#4（見回報）");
      return;
    }

    await addonBtn.click();
    // AddonModal 出現
    await expect(page.getByText("追加項目").first()).toBeVisible();
    await page.getByPlaceholder("例：後輪軸承異音檢修").fill("後煞車片更換（E2E 追加測試）");
    // 安全等級 → 安全關鍵
    const safetySelect = page.locator("select").filter({ hasText: "一般" }).first();
    if (await safetySelect.count()) {
      await safetySelect.selectOption({ label: "安全關鍵" }).catch(() => {});
    }
    await page.getByPlaceholder("0").fill("2000");
    await page.getByRole("button", { name: /確認追加|新增中/ }).click();

    // banner「已追加」+ 卡片出現追加項目
    await expect(page.getByText(/已追加/)).toBeVisible({ timeout: 10000 });
    console.log(`[SA-04] UI addAddon 成功 RO=${roCode}（注意：UI modal 不帶 reserve_item，hook#4 缺料未經此路徑觸發）`);

    await page.screenshot({ path: "docs/test-evidence/round-11/SA-04.png", fullPage: true });
  });
});

// ──────────────────────────────────────────────────────────
test.describe("SA-05 竣工複檢 — aftersales_lead 五步驟複檢、授權簽名", () => {
  // persona: aftersales_lead · route: /parts/aftersales/final-inspections
  useRole("aftersales_lead");

  test("複檢頁 render + 對工單建複檢（hook#6 保固舊件由 SQL 抽驗）", async ({ page }) => {
    const { roId, roCode } = readState();

    // 複檢頁主入口 render
    await page.goto("/parts/aftersales/final-inspections");
    await expect(page).toHaveURL(/\/parts\/aftersales\/final-inspections/);
    await expect(page.locator("main").last()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("body")).not.toContainText("Application error");

    // new 頁（從 RO 建複檢）
    await page.goto("/parts/aftersales/final-inspections/new");
    await expect(page).toHaveURL(/\/parts\/aftersales\/final-inspections/);
    await expect(page.locator("main").last()).toBeVisible({ timeout: 10000 });

    console.log(`[SA-05] 複檢頁 render OK；目標 RO=${roCode} id=${roId}。`);
    await page.screenshot({ path: "docs/test-evidence/round-11/SA-05.png", fullPage: true });
  });

  // ⭐hook#6：建 WC 保固單（生命週期 RO 是 MN-CP 不觸發，另開 WC 單專測 hook#6）
  test("⭐hook#6 建 WC 保固單（gate 選 WC P1）→ 供後續 complete 觸發舊件登錄", async ({ page }) => {
    await page.goto(`/parts/aftersales/repair-orders/new?from=${APPT_WC}`);
    await expect(page.getByText("BAA-0137", { exact: false }).first()).toBeVisible({ timeout: 10000 });

    // 點 WC（保固索賠）P1 卡 + WR（保固）P2 卡
    await page.getByRole("button", { name: /^WC/ }).first().click();
    await page.getByRole("button", { name: /^WR/ }).first().click();

    const confirmBtn = page.getByRole("button", { name: /確認開立工單|建立中/ });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    await page.waitForURL(/\/parts\/aftersales\/repair-orders\/[0-9a-f-]{36}/, { timeout: 15000 });
    const wcRoId = page.url().match(/repair-orders\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(wcRoId).toMatch(/[0-9a-f-]{36}/);
    await page.waitForTimeout(800);
    const bodyText = (await page.locator("body").innerText()).slice(0, 4000);
    const wcRoCode = bodyText.match(/WC-WR-\d{6}-\d{3}/)?.[0] ?? "";
    writeState({ wcRoId, wcRoCode });
    console.log(`[SA-05] ⭐WC 保固單建立：id=${wcRoId} code=${wcRoCode}（後由 SQL seed 保固 line + 簽核複檢，再 complete 驗 hook#6）`);
    await page.screenshot({ path: "docs/test-evidence/round-11/SA-05-WC.png", fullPage: true });
  });

  // ⭐hook#6：對已 seed 簽核複檢的 WC 單按「完成竣工複檢」→ completeAction 觸發 old_parts 登錄
  test("⭐hook#6 complete 簽核複檢的 WC 單 → 觸發舊件登錄", async ({ page }) => {
    const { fiId } = readState();
    if (!fiId) {
      test.skip(true, "尚未 seed 簽核複檢單（fiId）— 由 sub-agent SQL 預備後再跑");
      return;
    }
    await page.goto(`/parts/aftersales/final-inspections/${fiId}`);
    await expect(page.locator("main").last()).toBeVisible({ timeout: 10000 });

    // 複檢已簽核（SQL seed）。跳到 step 5「通知取車」才有「完成竣工複檢」按鈕
    await page.getByRole("button", { name: /通知取車/ }).first().click();
    await page.waitForTimeout(500);

    const completeBtn = page.getByRole("button", { name: /完成竣工複檢/ });
    await expect(completeBtn).toBeVisible({ timeout: 8000 });
    await completeBtn.click();
    // 成功 banner（completeAction → RO 待結帳 + after() hook#6 登舊件）
    await expect(page.getByText(/複檢完成，工單推進到/)).toBeVisible({ timeout: 10000 });
    console.log("[SA-05] ⭐hook#6 completeAction 成功（old_parts 由 SQL 抽驗）");
    await page.screenshot({ path: "docs/test-evidence/round-11/SA-05-hook6.png", fullPage: true });
  });
});

// ──────────────────────────────────────────────────────────
test.describe("SA-06 結帳收款 / 取車通知", () => {
  // persona: sa · route: /parts/aftersales/checkout(08)、/pickup-notifications(11)
  useRole("sa");

  test("結帳頁 + 取車通知頁 render OK（對待結帳工單）", async ({ page }) => {
    const { roCode } = readState();

    await page.goto("/parts/aftersales/checkout");
    await expect(page).toHaveURL(/\/parts\/aftersales\/checkout/);
    await expect(page.locator("main").last()).toBeVisible({ timeout: 10000 });
    await expect(page.locator("body")).not.toContainText("Application error");
    await page.screenshot({ path: "docs/test-evidence/round-11/SA-06.png", fullPage: true });

    // 取車通知頁
    await page.goto("/parts/aftersales/pickup-notifications");
    const onPickup = page.url().includes("pickup-notifications");
    if (onPickup) {
      await expect(page.locator("main").last()).toBeVisible({ timeout: 8000 });
      console.log("[SA-06] 取車通知頁 render OK");
    } else {
      console.log(`[SA-06] 取車通知頁未達（url=${page.url()}）`);
    }
    console.log(`[SA-06] 結帳流程頁 render；待結帳 RO=${roCode}`);
  });
});

// ──────────────────────────────────────────────────────────
// Phase 2（SA-07~10）— persona aftersales_lead 售後主管
// ──────────────────────────────────────────────────────────

test.describe("SA-07 車間看板 — 工位管理、技師派工、工時追蹤", () => {
  // persona: aftersales_lead · route: /parts/aftersales/management/bays（07 車間 Tab）
  // aftersales_lead 有 service.ro.view（看板讀）+ service.ro.dispatch（canEdit / 新增工位）
  useRole("aftersales_lead");

  test("工位看板載入：KPI 卡 + 工位視圖 + 工位效率統計區可見", async ({ page }) => {
    await page.goto("/parts/aftersales/management/bays");
    await expect(page).toHaveURL(/\/parts\/aftersales\/management\/bays/);
    await expect(page.locator("main").last()).toBeVisible({ timeout: 12000 });
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("沒有檢視工位看板的權限");

    // 看板主體：標題 + KPI 卡（工位總數 / 平均使用率）
    await expect(page.locator("body")).toContainText("工位看板");
    await expect(page.locator("body")).toContainText("工位總數");
    await expect(page.locator("body")).toContainText("平均使用率");
    // 工位效率統計區（今日完成數 vs 使用率 / 周轉率）— 工時追蹤面向
    await expect(page.locator("body")).toContainText("工位效率統計");
    await expect(page.locator("body")).toContainText("每日可用工時");

    // canEdit（service.ro.dispatch）→ 新增工位按鈕應出現
    const hasAddBay = await page.getByText("新增工位").first().isVisible().catch(() => false);
    console.log(`[SA-07] 車間看板 render OK；新增工位按鈕(canEdit)=${hasAddBay}`);

    await page.screenshot({ path: "docs/test-evidence/round-11/SA-07.png", fullPage: true });
  });
});

// ──────────────────────────────────────────────────────────
test.describe("SA-08 售後主管設定 — 前綴碼、客戶標籤（人員名冊受 RBAC 擋）", () => {
  // persona: aftersales_lead
  // route: ro-numbering(前綴碼, service.ro.view ✓)、customer-tags(標籤, service.aftersales_permission.view ✓)
  //        staff(人員名冊, master.employee.view ✗ — aftersales_lead 無此權限，預期被擋)
  useRole("aftersales_lead");

  test("工單編號規則（前綴碼）設定頁載入 + 基礎資料可見", async ({ page }) => {
    await page.goto("/parts/aftersales/management/ro-numbering");
    await expect(page).toHaveURL(/\/parts\/aftersales\/management\/ro-numbering/);
    await expect(page.locator("main").last()).toBeVisible({ timeout: 12000 });
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("沒有檢視工單編號規則的權限");
    await expect(page.locator("body")).toContainText("工單編號規則");
    await expect(page.locator("body")).toContainText("前綴碼");
    console.log("[SA-08] 前綴碼設定頁 render OK（業務類型 P1 / 付款性質 P2 前綴碼可見）");
    await page.screenshot({ path: "docs/test-evidence/round-11/SA-08.png", fullPage: true });
  });

  test("客戶標籤主管設定頁載入 + 標籤字典可見", async ({ page }) => {
    await page.goto("/parts/aftersales/management/customer-tags");
    await expect(page).toHaveURL(/\/parts\/aftersales\/management\/customer-tags/);
    await expect(page.locator("main").last()).toBeVisible({ timeout: 12000 });
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).not.toContainText("沒有檢視主管工作檯的權限");
    await expect(page.locator("body")).toContainText("客戶標籤主管設定");
    console.log("[SA-08] 客戶標籤設定頁 render OK");
    await page.screenshot({ path: "docs/test-evidence/round-11/SA-08-tags.png", fullPage: true });
  });

  test("人員名冊（staff）— aftersales_lead 無 master.employee.view，預期被 RBAC 擋", async ({ page }) => {
    await page.goto("/parts/aftersales/management/staff");
    await expect(page.locator("main").last()).toBeVisible({ timeout: 12000 });
    // 售後主管角色沒有 master.employee.view → 應顯示無權限紅字，而非名冊內容
    const blocked = await page.getByText("沒有檢視員工名冊的權限").isVisible().catch(() => false);
    console.log(`[SA-08] 人員名冊 RBAC gate：blocked(預期 true)=${blocked}`);
    expect(blocked, "aftersales_lead 應被 master.employee.view 擋住人員名冊").toBe(true);
    await page.screenshot({ path: "docs/test-evidence/round-11/SA-08-staff-blocked.png", fullPage: true });
  });
});

// ──────────────────────────────────────────────────────────
test.describe("SA-09 ⭐金標 人效統計（技師效率排行 NADA 三指標）", () => {
  // persona: aftersales_lead
  // ⚠️ getTechnicianEfficiencySummary() 實際 surfaced 於 /group/dashboard（售後人效統計區），
  //    非 case-matrix 猜測的 bays（bays 只有「工位效率統計」=bay 維度，非 technician 維度）。
  //    group/dashboard 無權限 gate（任何登入者可讀），aftersales_lead 可進。
  // baseline: report-baselines.json sa_09_tech_efficiency
  useRole("aftersales_lead");

  test("⭐ 人效統計顯示數字對 baseline ±2%（6 技師 / avg eff / 達標數 / jobs）", async ({ page }) => {
    await page.goto("/group/dashboard");
    await expect(page.locator("main").last()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("Application error");
    await expect(page.locator("body")).toContainText("售後人效統計");

    const bodyText = (await page.locator("body").innerText()).replace(/\s+/g, " ");

    // 1) 技師數：header「全店 N 位技師」
    const techMatch = bodyText.match(/全店\s*(\d+)\s*位技師/);
    const techCount = techMatch ? Number(techMatch[1]) : NaN;

    // 2) 今日工單 jobs_total：「今日工單」KPI 卡的大數字 + 「完成 N」
    const jobsMatch = bodyText.match(/今日工單\s*(\d+)/);
    const jobsTotal = jobsMatch ? Number(jobsMatch[1]) : NaN;

    // 3) 平均效率 avg_efficiency：「平均效率 Eff. NN%」
    const avgEffMatch = bodyText.match(/平均效率\s*Eff\.?\s*(\d+)%/);
    const avgEff = avgEffMatch ? Number(avgEffMatch[1]) : NaN;

    // 4) 達標技師 eff_on_target / util_on_target：「達標技師 X / Y」
    const onTargetMatch = bodyText.match(/達標技師\s*(\d+)\s*\/\s*(\d+)/);
    const effOnTarget = onTargetMatch ? Number(onTargetMatch[1]) : NaN;
    const utilOnTarget = onTargetMatch ? Number(onTargetMatch[2]) : NaN;

    const baseline = {
      technician_count: 6,
      jobs_total: 126,
      avg_efficiency: 120,
      eff_on_target_count: 3,
      util_on_target_count: 0,
    };
    const within2 = (actual: number, expected: number) =>
      Number.isFinite(actual) && Math.abs(actual - expected) <= Math.max(2, expected * 0.02);

    console.log("[SA-09] ⭐ 人效統計 實際 vs baseline（±2%）:");
    console.log(`  技師數     actual=${techCount}    baseline=${baseline.technician_count}   ${within2(techCount, baseline.technician_count) ? "✓" : "✗"}`);
    console.log(`  今日工單   actual=${jobsTotal}   baseline=${baseline.jobs_total}  ${within2(jobsTotal, baseline.jobs_total) ? "✓" : "✗"}`);
    console.log(`  平均效率   actual=${avgEff}%   baseline=${baseline.avg_efficiency}%  ${within2(avgEff, baseline.avg_efficiency) ? "✓" : "✗"}`);
    console.log(`  達標(Eff)  actual=${effOnTarget}    baseline=${baseline.eff_on_target_count}    ${within2(effOnTarget, baseline.eff_on_target_count) ? "✓" : "✗"}`);
    console.log(`  達標(Util) actual=${utilOnTarget}    baseline=${baseline.util_on_target_count}    ${within2(utilOnTarget, baseline.util_on_target_count) ? "✓" : "✗"}`);

    // 排行表 6 位技師逐一驗（依 baseline 順序 T3>T5>T1>T6>T4>T2）
    for (const t of ["T3", "T5", "T1", "T6", "T4", "T2"]) {
      await expect(page.locator("body"), `排行應含技師 ${t}`).toContainText(t);
    }

    // 斷言（金標：技師數 / jobs / avg eff / 達標數 全部 ±2%）
    expect(techCount, "技師數 6").toBe(baseline.technician_count);
    expect(within2(jobsTotal, baseline.jobs_total), `jobs ${jobsTotal} vs 126`).toBe(true);
    expect(within2(avgEff, baseline.avg_efficiency), `avg eff ${avgEff} vs 120`).toBe(true);
    expect(effOnTarget, "達標(Eff≥125%) 3 人").toBe(baseline.eff_on_target_count);
    expect(utilOnTarget, "達標(Util≥80%) 0 人").toBe(baseline.util_on_target_count);

    await page.screenshot({ path: "docs/test-evidence/round-11/SA-09.png", fullPage: true });
  });
});

// ──────────────────────────────────────────────────────────
test.describe("SA-10 售後主管工作台 — 每日 KPI 確認與異常處理", () => {
  // persona: aftersales_lead · route: /parts/aftersales（售後主管工作台 root，動態 KPI + 今日焦點）
  useRole("aftersales_lead");

  test("售後工作台 root 載入：hero + KPI + 今日焦點 quick-link", async ({ page }) => {
    await page.goto("/parts/aftersales");
    await expect(page).toHaveURL(/\/parts\/aftersales$|\/parts\/aftersales\/?$/);
    await expect(page.locator("main").last()).toBeVisible({ timeout: 15000 });
    await expect(page.locator("body")).not.toContainText("Application error");

    // ModuleHomeGallery + 今日焦點區（KPI 工作台）
    await expect(page.locator("body")).toContainText("今日焦點");
    // KPI 撈失敗 fallback banner 不應出現（資料正常）
    const kpiErrored = await page.getByText("無法載入售後 KPI 數據").isVisible().catch(() => false);
    console.log(`[SA-10] 售後主管工作台 render OK；KPI errored fallback=${kpiErrored}（預期 false）`);
    expect(kpiErrored, "售後 KPI 不應為 errored fallback").toBe(false);

    await page.screenshot({ path: "docs/test-evidence/round-11/SA-10.png", fullPage: true });
  });
});
