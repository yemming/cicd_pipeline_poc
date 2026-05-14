#!/usr/bin/env node
// Smoke test for /aftersales/crm/survey-templates （售後電訪問卷）
// - list 頁可載入、filter / DataGrid / 新增 link 存在
// - 點「+ 新增」→ /new → 填表 → 建立 → redirect detail（路徑仍在 /aftersales/...）
// - detail：修改適用客戶區段 → 儲存
// - 回 list 確認新筆出現 → cleanup delete
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, ".pw-state.json");
const TMP_DIR = path.join(__dirname, "..", "tmp");
const BASE = process.env.APP_BASE_URL || "http://localhost:3000";
const NAV_TIMEOUT = Number(process.env.SMOKE_NAV_TIMEOUT_MS ?? 180_000);

const log = (...m) => console.error("[aftersales-survey-templates-smoke]", ...m);

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
  // dev scope cookie：強制 brand_id=indian，否則 dev session 可能 scope 不對 → list 撈不到
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian" }),
      url: BASE,
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
  const newName = `售後煙霧測試問卷 ${uniqSuffix}`;
  const newSegment = `售後測試區段 ${uniqSuffix}`;
  const updatedSegment = `售後測試區段更新 ${uniqSuffix}`;

  // 1) 載入 list
  {
    const resp = await page.goto(
      `${BASE}/aftersales/crm/survey-templates`,
      { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT },
    );
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

  // 2) H1
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("售後電訪") && h1.includes("問卷")
        ? { ok: true, step: "list H1" }
        : { ok: false, step: "list H1", reason: `h1="${h1}"` },
    );
  }

  // 3) Filter bar 欄位
  {
    const statusSelect = await page
      .locator('label:has-text("狀態") + select')
      .count();
    const queryInput = await page.locator('label:has-text("代碼") + input').count();
    const ok = statusSelect > 0 && queryInput > 0;
    results.push(
      ok
        ? { ok: true, step: "filter bar fields present" }
        : {
            ok: false,
            step: "filter bar fields present",
            reason: `status=${statusSelect} q=${queryInput}`,
          },
    );
  }

  // 4) DataGrid header 問卷代碼
  {
    const headerCount = await page.locator('th:has-text("問卷代碼")').count();
    results.push(
      headerCount > 0
        ? { ok: true, step: "DataGrid header 問卷代碼" }
        : { ok: false, step: "DataGrid header 問卷代碼", reason: "not found" },
    );
  }

  // 4b) 預期至少看到 AST001 / AST002 / AST003 demo 資料其中之一
  {
    const seed = await page.locator('td:has-text("AST001"), a:has-text("AST001")').count();
    results.push(
      seed > 0
        ? { ok: true, step: "demo seed AST001 visible" }
        : { ok: false, step: "demo seed AST001 visible", reason: "not found" },
    );
  }

  // 5) +新增 link → /new
  {
    const link = page.getByTestId("survey-templates-create-link").first();
    const href = await link.getAttribute("href").catch(() => null);
    const okHref = href === "/aftersales/crm/survey-templates/new?kind=aftersales";
    results.push(
      okHref
        ? { ok: true, step: "+ 新增 link href" }
        : { ok: false, step: "+ 新增 link href", reason: `href="${href}"` },
    );
    await link.click();
    await page
      .waitForURL(
        (target) =>
          new URL(target).pathname === "/aftersales/crm/survey-templates/new",
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    const pathname = new URL(page.url()).pathname;
    results.push(
      pathname === "/aftersales/crm/survey-templates/new"
        ? { ok: true, step: "navigated to /new" }
        : { ok: false, step: "navigated to /new", reason: `path=${pathname}` },
    );
  }

  // 6) Create mode UI 驗證
  {
    const breadcrumb = await page
      .getByTestId("survey-template-breadcrumb-code")
      .innerText()
      .catch(() => "");
    const nameInput = page.getByTestId("survey-template-name-input");
    const inputCount = await nameInput.count();
    if (breadcrumb.includes("新增問卷") && inputCount > 0) {
      results.push({ ok: true, step: "create mode UI" });
    } else {
      results.push({
        ok: false,
        step: "create mode UI",
        reason: `breadcrumb="${breadcrumb}" inputCount=${inputCount}`,
      });
    }
    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-survey-create-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 7) 填表 + 建立
  {
    await page.getByTestId("survey-template-name-input").fill(newName);
    await page.getByTestId("survey-template-segment-input").fill(newSegment);
    await page
      .locator('button:has-text("＋ 新增題目")')
      .first()
      .click()
      .catch(() => {});
    await page.getByTestId("survey-template-create-submit").click();
    await page
      .waitForURL(
        (target) =>
          /^\/aftersales\/crm\/survey-templates\/[0-9a-f-]{36}$/.test(
            new URL(target).pathname,
          ),
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    const path2 = new URL(page.url()).pathname;
    const m = /^\/aftersales\/crm\/survey-templates\/([0-9a-f-]{36})$/.exec(path2);
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

  // 8) Detail title
  if (createdId) {
    await page
      .getByTestId("survey-template-detail-title")
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
    const title = await page
      .getByTestId("survey-template-detail-title")
      .innerText()
      .catch(() => "");
    results.push(
      title.includes(newName)
        ? { ok: true, step: "detail title shows new survey name" }
        : {
            ok: false,
            step: "detail title shows new survey name",
            reason: `title="${title}"`,
          },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-survey-detail-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 9) Tabs（題目編輯、進階設定）
  if (createdId) {
    const tabsCount = await page
      .locator('button:has-text("題目編輯"), button:has-text("進階設定")')
      .count();
    results.push(
      tabsCount >= 2
        ? { ok: true, step: "detail tabs present", count: tabsCount }
        : { ok: false, step: "detail tabs present", reason: `count=${tabsCount}` },
    );
  }

  // 10) 進編輯模式 → 改 target_segment → 儲存
  if (createdId) {
    await page.getByTestId("survey-template-edit-button").click();
    await page
      .getByTestId("survey-template-segment-input")
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await page.getByTestId("survey-template-segment-input").fill(updatedSegment);
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
      const stillDetail = /^\/aftersales\/crm\/survey-templates\/[0-9a-f-]{36}$/.test(
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

  // 11) 回 list → 看新筆出現
  if (createdId) {
    await page.goto(
      `${BASE}/aftersales/crm/survey-templates?q=${uniqSuffix}`,
      { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT },
    );
    const matchCount = await page
      .locator(`td:has-text("${newName}"), a:has-text("${newName}")`)
      .count();
    results.push(
      matchCount > 0
        ? { ok: true, step: "list contains new survey", matches: matchCount }
        : { ok: false, step: "list contains new survey", reason: "not visible" },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-survey-list-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 12) Cleanup delete
  if (createdId) {
    await page.goto(`${BASE}/aftersales/crm/survey-templates/${createdId}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    page.once("dialog", (d) => d.accept());
    await page.locator('button:has-text("刪除")').first().click();
    await page
      .waitForURL(
        (target) =>
          new URL(target).pathname === "/aftersales/crm/survey-templates",
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    results.push(
      new URL(page.url()).pathname === "/aftersales/crm/survey-templates"
        ? { ok: true, step: "cleanup delete → back to list" }
        : {
            ok: false,
            step: "cleanup delete → back to list",
            reason: `url=${page.url()}`,
          },
    );
  }

  // 13) console errors（忽略 hydration / caret-color noise）
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("caret-color") && !e.includes("hydration"),
  );
  if (realErrors.length > 0) {
    results.push({ ok: false, step: "browser console errors", errors: realErrors });
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
    log(r.ok ? `✓ ${r.step}` : `✗ ${r.step} — ${r.reason || JSON.stringify(r)}`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
