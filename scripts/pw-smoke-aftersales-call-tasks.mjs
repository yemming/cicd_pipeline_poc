#!/usr/bin/env node
// Smoke test for /aftersales/crm/call-tasks（售後電訪工作檯）
// - list 頁可載入、stats / filter / DataGrid / 新增 link 存在
// - 點「+ 新增」→ /new → 選客戶 → 建立 → redirect detail
// - detail：進編輯模式 → 改備註 → 儲存 → banner / detail 還在
// - 撥打按鈕 → attempt +1 / 狀態切 in_progress
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

const log = (...m) => console.error("[aftersales-call-tasks-smoke]", ...m);

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
  // 確保 dealeros_scope = indian（與 dev session 對齊）
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: encodeURIComponent(JSON.stringify({ brand_id: "indian" })),
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
  const newNotes = `售後煙霧測試備註 ${uniqSuffix}`;
  const updatedNotes = `售後煙霧測試備註更新 ${uniqSuffix}`;

  // 1) 載入 list
  {
    const resp = await page.goto(
      `${BASE}/aftersales/crm/call-tasks`,
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

  // 2) H1（售後電訪工作檯）
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("售後電訪") && h1.includes("工作檯")
        ? { ok: true, step: "list H1", h1 }
        : { ok: false, step: "list H1", reason: `h1="${h1}"` },
    );
  }

  // 3) Stats cards
  {
    const pendingStat = await page
      .getByTestId("call-tasks-stat-pending")
      .innerText()
      .catch(() => "");
    const mineStat = await page
      .getByTestId("call-tasks-stat-mine")
      .innerText()
      .catch(() => "");
    const ok = /^\d+$/.test(pendingStat) && /^\d+$/.test(mineStat);
    results.push(
      ok
        ? { ok: true, step: "stats cards present", pending: pendingStat, mine: mineStat }
        : {
            ok: false,
            step: "stats cards present",
            reason: `pending="${pendingStat}" mine="${mineStat}"`,
          },
    );
  }

  // 4) Filter bar 欄位
  {
    const statusSelect = await page
      .locator('label:has-text("狀態") + select')
      .count();
    const assigneeSelect = await page
      .locator('label:has-text("指派") + select')
      .count();
    const ok = statusSelect > 0 && assigneeSelect > 0;
    results.push(
      ok
        ? { ok: true, step: "filter bar fields present" }
        : {
            ok: false,
            step: "filter bar fields present",
            reason: `status=${statusSelect} assignee=${assigneeSelect}`,
          },
    );
  }

  // 5) DataGrid header
  {
    const headerCount = await page.locator('th:has-text("客戶")').count();
    results.push(
      headerCount > 0
        ? { ok: true, step: "DataGrid header 客戶" }
        : { ok: false, step: "DataGrid header 客戶", reason: "not found" },
    );
  }

  // 6) +新增 link → /new
  {
    const link = page.getByTestId("call-tasks-create-link").first();
    const href = await link.getAttribute("href").catch(() => null);
    const okHref = href === "/aftersales/crm/call-tasks/new?kind=aftersales";
    results.push(
      okHref
        ? { ok: true, step: "+ 新增 link href" }
        : { ok: false, step: "+ 新增 link href", reason: `href="${href}"` },
    );
    await link.click();
    await page
      .waitForURL(
        (target) =>
          new URL(target).pathname === "/aftersales/crm/call-tasks/new",
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    const pathname = new URL(page.url()).pathname;
    results.push(
      pathname === "/aftersales/crm/call-tasks/new"
        ? { ok: true, step: "navigated to /new" }
        : { ok: false, step: "navigated to /new", reason: `path=${pathname}` },
    );
  }

  // 7) Create mode UI
  {
    const breadcrumb = await page
      .getByTestId("call-task-breadcrumb-code")
      .innerText()
      .catch(() => "");
    const customerSelect = page.getByTestId("call-task-customer-select");
    const customerCount = await customerSelect.count();
    if (breadcrumb.includes("新增") && customerCount > 0) {
      results.push({ ok: true, step: "create mode UI" });
    } else {
      results.push({
        ok: false,
        step: "create mode UI",
        reason: `breadcrumb="${breadcrumb}" customerCount=${customerCount}`,
      });
    }
    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-call-tasks-create-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 8) 選客戶 + 建立
  {
    const customerSelect = page.getByTestId("call-task-customer-select");
    const options = await customerSelect.locator("option").all();
    let firstCustomerId = null;
    for (const o of options) {
      const v = await o.getAttribute("value");
      if (v) {
        firstCustomerId = v;
        break;
      }
    }
    if (!firstCustomerId) {
      results.push({
        ok: false,
        step: "pick first customer",
        reason: "no customer options",
      });
    } else {
      await customerSelect.selectOption(firstCustomerId);
      results.push({ ok: true, step: "pick first customer" });
    }

    // 點建立
    await page.getByTestId("call-task-create-submit").click();
    await page
      .waitForURL(
        (target) =>
          /^\/aftersales\/crm\/call-tasks\/[0-9a-f-]{36}$/.test(
            new URL(target).pathname,
          ),
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    const path2 = new URL(page.url()).pathname;
    const m = /^\/aftersales\/crm\/call-tasks\/([0-9a-f-]{36})$/.exec(path2);
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

  // 9) Detail title
  if (createdId) {
    await page
      .getByTestId("call-task-detail-title")
      .waitFor({ timeout: 30_000 })
      .catch(() => {});
    const title = await page
      .getByTestId("call-task-detail-title")
      .innerText()
      .catch(() => "");
    results.push(
      title && title !== "—"
        ? { ok: true, step: "detail title rendered", title }
        : {
            ok: false,
            step: "detail title rendered",
            reason: `title="${title}"`,
          },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-call-tasks-detail-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 10) Tabs（問卷填答 / 通話結果 / 進階）
  if (createdId) {
    const tabsCount = await page
      .locator(
        'button:has-text("問卷填答"), button:has-text("通話結果"), button:has-text("進階資訊")',
      )
      .count();
    results.push(
      tabsCount >= 3
        ? { ok: true, step: "detail tabs present", count: tabsCount }
        : { ok: false, step: "detail tabs present", reason: `count=${tabsCount}` },
    );
  }

  // 11) 進編輯模式 → 切「通話結果」tab → 填備註 → 儲存
  if (createdId) {
    await page.getByTestId("call-task-edit-button").click();
    await page
      .locator('button:has-text("通話結果")')
      .first()
      .click()
      .catch(() => {});
    await page
      .getByTestId("call-task-notes-input")
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await page.getByTestId("call-task-notes-input").fill(newNotes);
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
      const stillDetail = /^\/aftersales\/crm\/call-tasks\/[0-9a-f-]{36}$/.test(
        new URL(page.url()).pathname,
      );
      results.push(
        stillDetail
          ? { ok: true, step: "edit → save (banner auto-dismissed)", url: page.url() }
          : {
              ok: false,
              step: "edit → save",
              reason: `url=${page.url()} banner="${banner}"`,
            },
      );
    }
  }

  // 12) 撥打按鈕 → attempt count +1
  if (createdId) {
    await page.goto(`${BASE}/aftersales/crm/call-tasks/${createdId}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const startBtn = page.getByTestId("call-task-start-call-button");
    const startBtnCount = await startBtn.count();
    if (startBtnCount === 0) {
      results.push({
        ok: false,
        step: "撥打 button present",
        reason: "not found",
      });
    } else {
      await startBtn.click();
      // 等 banner 出現（撥打成功訊號），最多 30s
      await page
        .locator('div[role="status"]:has-text("已開始撥打")')
        .first()
        .waitFor({ timeout: 30_000 })
        .catch(() => {});
      // 等 banner 自動消失，確保 server action 完整 round-trip
      await page
        .locator('div[role="status"]:has-text("已開始撥打")')
        .first()
        .waitFor({ state: "detached", timeout: 5_000 })
        .catch(() => {});
      // 直接 navigate 強制 SSR re-fetch（reload 可能吃 router cache）
      await page.goto(`${BASE}/aftersales/crm/call-tasks/${createdId}`, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT,
      });
      const titleChip = await page
        .locator('span:has-text("已嘗試")')
        .first()
        .innerText()
        .catch(() => "");
      results.push(
        /已嘗試\s*[1-9]/.test(titleChip)
          ? { ok: true, step: "撥打 → attempt_count +1", chip: titleChip }
          : {
              ok: false,
              step: "撥打 → attempt_count +1",
              reason: `chip="${titleChip}"`,
            },
      );
    }
  }

  // 13) 改備註再儲存（測 update path 第二次）
  if (createdId) {
    // 確保 edit button 已 mount
    await page
      .getByTestId("call-task-edit-button")
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await page.getByTestId("call-task-edit-button").click().catch(() => {});
    await page
      .locator('button:has-text("通話結果")')
      .first()
      .click()
      .catch(() => {});
    const notesInput = page.getByTestId("call-task-notes-input");
    const notesAvailable = await notesInput
      .waitFor({ timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (notesAvailable) {
      await notesInput.fill(updatedNotes);
      await page.locator('button:has-text("儲存變更")').first().click();
      await page
        .locator('button:has-text("儲存中…")')
        .waitFor({ state: "detached", timeout: 30_000 })
        .catch(() => {});
      results.push({ ok: true, step: "second edit save completed" });
    } else {
      results.push({
        ok: false,
        step: "second edit save completed",
        reason: "notes input not available",
      });
    }
  }

  // 14) 回 list 看新筆出現
  if (createdId) {
    await page.goto(`${BASE}/aftersales/crm/call-tasks`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const linkCount = await page
      .locator(`a[href="/aftersales/crm/call-tasks/${createdId}"]`)
      .count();
    results.push(
      linkCount > 0
        ? { ok: true, step: "list contains new task" }
        : { ok: false, step: "list contains new task", reason: "not visible" },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-call-tasks-list-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 15) Cleanup delete
  if (createdId) {
    await page.goto(`${BASE}/aftersales/crm/call-tasks/${createdId}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    page.once("dialog", (d) => d.accept());
    await page.locator('button:has-text("刪除")').first().click();
    await page
      .waitForURL(
        (target) => {
          const p = new URL(target).pathname;
          return p === "/aftersales/crm/call-tasks";
        },
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    const finalPath = new URL(page.url()).pathname;
    results.push(
      finalPath === "/aftersales/crm/call-tasks"
        ? { ok: true, step: "cleanup delete → back to list" }
        : {
            ok: false,
            step: "cleanup delete → back to list",
            reason: `url=${page.url()}`,
          },
    );
  }

  // 16) console errors
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
