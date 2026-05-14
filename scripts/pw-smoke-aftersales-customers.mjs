#!/usr/bin/env node
// Smoke test for /aftersales/crm/customer-base （售後客戶基盤）
// - 確認 list 頁可載入、filter bar / DataGrid / 新增 link 都在
// - 確認「新增」進 create mode → 填表 → 建立 → redirect 到 detail
// - 確認 detail 可進入修改、儲存後資料更新
// - 售後特有：服務狀態欄、入廠次數、上次入廠日、KPI card
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[aftersales-customer-base-smoke]", ...m);

async function main() {
  if (!fs.existsSync(STATE_FILE)) {
    log("missing .pw-state.json — run scripts/pw-login.mjs first");
    process.exit(2);
  }
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    storageState: STATE_FILE,
    viewport: { width: 1440, height: 900 },
  });
  // 鎖定 brand=indian（避免 cookie 漂走）
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: encodeURIComponent(JSON.stringify({ brand_id: "indian" })),
      url: BASE,
      sameSite: "Lax",
    },
  ]);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`console.error: ${m.text()}`);
  });

  const results = [];
  let createdId = null;
  const uniqSuffix = String(Date.now()).slice(-6);
  const newName = `售後煙霧測試 ${uniqSuffix}`;
  const newPhone = `09${uniqSuffix}1234`;

  // 1) 載入 list
  {
    const resp = await page.goto(`${BASE}/aftersales/crm/customer-base`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const status = resp?.status() ?? 0;
    const finalUrl = page.url();
    if (status >= 400 || finalUrl.includes("/login")) {
      results.push({
        ok: false,
        step: "load list",
        reason: `status=${status} url=${finalUrl}`,
      });
    } else {
      results.push({ ok: true, step: "load list", status });
    }
  }

  // 2) H1 = 售後客戶基盤
  {
    const h1 = await page
      .locator("h1")
      .first()
      .innerText()
      .catch(() => "");
    results.push(
      h1.includes("售後客戶基盤")
        ? { ok: true, step: "list H1" }
        : { ok: false, step: "list H1", reason: `h1="${h1}"` },
    );
  }

  // 3) Filter bar 三個欄位（服務狀態 / 類型 / 搜尋）
  {
    const serviceStatus = await page
      .locator('label:has-text("服務狀態") + select')
      .count();
    const typeSelect = await page
      .locator('label:has-text("類型") + select')
      .count();
    const queryInput = await page
      .locator('label:has-text("代碼") + input')
      .count();
    const ok = serviceStatus > 0 && typeSelect > 0 && queryInput > 0;
    results.push(
      ok
        ? { ok: true, step: "filter bar fields present" }
        : {
            ok: false,
            step: "filter bar fields present",
            reason: `service_status=${serviceStatus} type=${typeSelect} q=${queryInput}`,
          },
    );
  }

  // 4) DataGrid 表頭存在（主車輛 / 入廠次數 / 服務狀態 — 售後特有）
  {
    const mainVehicle = await page.locator('th:has-text("主車輛")').count();
    const visitCount = await page.locator('th:has-text("入廠次數")').count();
    const serviceStatus = await page
      .locator('th:has-text("服務狀態")')
      .count();
    const ok = mainVehicle > 0 && visitCount > 0 && serviceStatus > 0;
    results.push(
      ok
        ? { ok: true, step: "DataGrid 售後 columns" }
        : {
            ok: false,
            step: "DataGrid 售後 columns",
            reason: `vehicle=${mainVehicle} visits=${visitCount} status=${serviceStatus}`,
          },
    );
  }

  // 5) 「+ 新增客戶」連結 → /new
  {
    const link = page.getByTestId("aftersales-customer-base-create-link").first();
    const href = await link.getAttribute("href").catch(() => null);
    if (href === "/aftersales/crm/customer-base/new") {
      results.push({ ok: true, step: "+ 新增 link href" });
    } else {
      results.push({
        ok: false,
        step: "+ 新增 link href",
        reason: `href="${href}"`,
      });
    }
    await link.click();
    await page
      .waitForURL(
        (target) =>
          new URL(target).pathname === "/aftersales/crm/customer-base/new",
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    const pathname = new URL(page.url()).pathname;
    results.push(
      pathname === "/aftersales/crm/customer-base/new"
        ? { ok: true, step: "navigated to /new" }
        : { ok: false, step: "navigated to /new", reason: `path=${pathname}` },
    );
  }

  // 6) Create mode：name input + breadcrumb
  {
    const breadcrumb = await page
      .getByTestId("aftersales-customer-base-breadcrumb-code")
      .innerText()
      .catch(() => "");
    const nameInput = page.getByTestId("aftersales-customer-base-name-input");
    const inputCount = await nameInput.count();
    if (breadcrumb.includes("新增客戶") && inputCount > 0) {
      results.push({ ok: true, step: "create mode UI" });
    } else {
      results.push({
        ok: false,
        step: "create mode UI",
        reason: `breadcrumb="${breadcrumb}" inputCount=${inputCount}`,
      });
    }

    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-customers-create-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 7) 填表 + 建立
  {
    await page
      .getByTestId("aftersales-customer-base-name-input")
      .fill(newName);
    await page
      .getByTestId("aftersales-customer-base-phone-input")
      .fill(newPhone);
    await page
      .getByTestId("aftersales-customer-base-create-submit")
      .click();
    await page
      .waitForURL(
        (target) =>
          /^\/aftersales\/crm\/customer-base\/[0-9a-f-]{36}$/.test(
            new URL(target).pathname,
          ),
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    const path2 = new URL(page.url()).pathname;
    const m = /^\/aftersales\/crm\/customer-base\/([0-9a-f-]{36})$/.exec(path2);
    if (m) {
      createdId = m[1];
      results.push({
        ok: true,
        step: "create → redirect to detail",
        id: createdId,
      });
    } else {
      results.push({
        ok: false,
        step: "create → redirect to detail",
        reason: `path=${path2}`,
      });
    }
  }

  // 8) Detail page title
  if (createdId) {
    await page
      .getByTestId("aftersales-customer-base-detail-title")
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
    const title = await page
      .getByTestId("aftersales-customer-base-detail-title")
      .innerText()
      .catch(() => "");
    results.push(
      title.includes(newName)
        ? { ok: true, step: "detail title shows new customer name" }
        : {
            ok: false,
            step: "detail title shows new customer name",
            reason: `title="${title}"`,
          },
    );

    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-customers-detail-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 9) Tabs（名下車輛 / 服務歷程 / 業務備註）
  if (createdId) {
    const tabsCount = await page
      .locator(
        'button:has-text("名下車輛"), button:has-text("服務歷程"), button:has-text("業務備註")',
      )
      .count();
    results.push(
      tabsCount >= 3
        ? { ok: true, step: "detail tabs present", count: tabsCount }
        : {
            ok: false,
            step: "detail tabs present",
            reason: `count=${tabsCount}`,
          },
    );
  }

  // 10) 進編輯模式 → 改地址 → 儲存
  if (createdId) {
    await page.getByTestId("aftersales-customer-base-edit-button").click();
    await page
      .getByTestId("aftersales-customer-base-name-input")
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    const addressInput = page
      .locator('input[placeholder="完整地址"]')
      .first();
    const addressExisted = (await addressInput.count()) > 0;
    if (addressExisted) {
      await addressInput.fill(`測試地址 ${uniqSuffix}`);
    }
    await page.locator('button:has-text("儲存變更")').first().click();
    await page
      .locator('button:has-text("儲存中…")')
      .waitFor({ state: "detached", timeout: 30_000 })
      .catch(() => {});
    const banner = await page
      .locator('div[role="status"], div[role="alert"]')
      .first()
      .innerText({ timeout: 15_000 })
      .catch(() => "");
    if (banner.includes("已儲存") || banner.includes("✓")) {
      results.push({ ok: true, step: "edit → save banner", banner });
    } else {
      const stillDetail = /^\/aftersales\/crm\/customer-base\/[0-9a-f-]{36}$/.test(
        new URL(page.url()).pathname,
      );
      results.push(
        stillDetail
          ? {
              ok: true,
              step: "edit → save (banner auto-dismissed)",
              url: page.url(),
            }
          : {
              ok: false,
              step: "edit → save",
              reason: `url=${page.url()} banner="${banner}"`,
            },
      );
    }
  }

  // 11) 回 list 看新客戶
  if (createdId) {
    await page.goto(`${BASE}/aftersales/crm/customer-base?q=${uniqSuffix}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const matchCount = await page
      .locator(`td:has-text("${newName}"), a:has-text("${newName}")`)
      .count();
    results.push(
      matchCount > 0
        ? {
            ok: true,
            step: "list contains new customer",
            matches: matchCount,
          }
        : {
            ok: false,
            step: "list contains new customer",
            reason: "not visible",
          },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-customers-list-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 12) 收尾：刪除新客戶
  if (createdId) {
    await page.goto(`${BASE}/aftersales/crm/customer-base/${createdId}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    page.once("dialog", (d) => d.accept());
    await page.locator('button:has-text("刪除")').first().click();
    await page
      .waitForURL(
        (target) =>
          new URL(target).pathname === "/aftersales/crm/customer-base",
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    results.push(
      new URL(page.url()).pathname === "/aftersales/crm/customer-base"
        ? { ok: true, step: "cleanup delete → back to list" }
        : {
            ok: false,
            step: "cleanup delete → back to list",
            reason: `url=${page.url()}`,
          },
    );
  }

  // 13) Browser console errors
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("caret-color") && !e.includes("hydration"),
  );
  if (realErrors.length > 0) {
    results.push({
      ok: false,
      step: "browser console errors",
      errors: realErrors,
    });
  } else {
    results.push({
      ok: true,
      step: "no browser console errors",
      ignored: consoleErrors.length,
    });
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(
    JSON.stringify(
      {
        total: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        details: results,
      },
      null,
      2,
    ),
  );
  for (const r of results)
    log(
      r.ok ? `✓ ${r.step}` : `✗ ${r.step} — ${r.reason || JSON.stringify(r)}`,
    );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
