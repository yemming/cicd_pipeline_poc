#!/usr/bin/env node
// Smoke test for /aftersales/crm/dormant-customers（休眠流失管理 售後 · CSAT05A）
// - list 頁可載入、H1 是「休眠流失管理」、stats / filter / DataGrid / 新增 link 存在
// - 點「+ 新增流失客戶」→ /new → 填姓名 → 建立 → redirect detail
// - detail：點「喚回」→ +1
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

const log = (...m) => console.error("[aftersales-dormant-smoke]", ...m);

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
  // 強制 active scope = indian（demo 資料只塞在 indian）
  await ctx.addCookies([
    {
      name: "dealeros_scope",
      value: JSON.stringify({ brand_id: "indian", store_id: null }),
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
  const newName = `煙霧售後流失 ${uniqSuffix}`;

  // 1) 載入 list
  {
    const resp = await page.goto(`${BASE}/aftersales/crm/dormant-customers`, {
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

  // 2) H1 = 休眠流失管理
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("休眠流失管理")
        ? { ok: true, step: "list H1" }
        : { ok: false, step: "list H1", reason: `h1="${h1}"` },
    );
  }

  // 3) Stats cards
  {
    const totalStat = await page
      .getByTestId("dormant-leads-stat-total")
      .innerText()
      .catch(() => "");
    const dormantStat = await page
      .getByTestId("dormant-leads-stat-dormant")
      .innerText()
      .catch(() => "");
    const lostStat = await page
      .getByTestId("dormant-leads-stat-lost")
      .innerText()
      .catch(() => "");
    results.push(
      totalStat !== "" && dormantStat !== "" && lostStat !== ""
        ? {
            ok: true,
            step: "stats rendered",
            stats: { total: totalStat, dormant: dormantStat, lost: lostStat },
          }
        : {
            ok: false,
            step: "stats rendered",
            reason: `total=${totalStat} dormant=${dormantStat} lost=${lostStat}`,
          },
    );
  }

  // 4) Filter bar 含「流失原因」標籤（aftersales 專屬）
  {
    const body = await page.locator("body").innerText().catch(() => "");
    results.push(
      body.includes("流失原因") || body.includes("流失對象")
        ? { ok: true, step: "aftersales copy applied" }
        : { ok: false, step: "aftersales copy applied" },
    );
  }

  // 5) DataGrid header 渲染
  {
    const tableHeaders = await page.locator("table thead").count();
    results.push(
      tableHeaders >= 1
        ? { ok: true, step: "datagrid renders" }
        : { ok: false, step: "datagrid renders" },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-dormant-list-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 6) 新增 link
  {
    const createLink = page.getByTestId("dormant-leads-create-link");
    results.push(
      (await createLink.count()) === 1
        ? { ok: true, step: "create link present" }
        : { ok: false, step: "create link present" },
    );
  }

  // 7) 點新增 → /new（先 warm up [id] route 避免後續 create step 卡在 dev compile）
  {
    // Pre-warm [id] route — 點 list 第一筆 lead 進 detail（任何已有 row）
    const firstDetailLink = page
      .locator('a[href^="/aftersales/crm/dormant-customers/"]')
      .first();
    if ((await firstDetailLink.count()) > 0) {
      const href = await firstDetailLink.getAttribute("href");
      if (href && /\/[0-9a-f-]{36}$/.test(href)) {
        await page
          .goto(`${BASE}${href}`, {
            waitUntil: "domcontentloaded",
            timeout: NAV_TIMEOUT,
          })
          .catch(() => {});
      }
    }
    // 真的去 /new
    await page
      .goto(`${BASE}/aftersales/crm/dormant-customers/new`, {
        waitUntil: "domcontentloaded",
        timeout: NAV_TIMEOUT,
      })
      .catch(() => {});
    const ok = page.url().includes("/aftersales/crm/dormant-customers/new");
    results.push(
      ok
        ? { ok: true, step: "nav /new" }
        : { ok: false, step: "nav /new", reason: page.url() },
    );
  }

  // 8) 填姓名 → 建立並開啟
  {
    await page
      .getByTestId("dormant-lead-name-input")
      .waitFor({ timeout: 60_000 })
      .catch(() => {});
    await page.getByTestId("dormant-lead-name-input").fill(newName);
    await page.waitForTimeout(300);
    await page.getByTestId("dormant-lead-create-submit").click();
    await page
      .waitForURL(
        (target) =>
          /^\/aftersales\/crm\/dormant-customers\/[0-9a-f-]{36}$/.test(
            new URL(target).pathname,
          ),
        { timeout: NAV_TIMEOUT },
      )
      .catch(() => {});
    const p = new URL(page.url()).pathname;
    const m = /^\/aftersales\/crm\/dormant-customers\/([0-9a-f-]{36})$/.exec(p);
    if (m) {
      createdId = m[1];
      results.push({
        ok: true,
        step: "create → redirect detail",
        id: createdId,
      });
    } else {
      const bodyTxt = await page.locator("body").innerText().catch(() => "");
      const errSnippet = bodyTxt
        .split("\n")
        .filter((l) => /失敗|error|錯誤|未/.test(l))
        .join(" | ");
      await page.screenshot({
        path: path.join(
          TMP_DIR,
          `aftersales-dormant-create-fail-${uniqSuffix}.png`,
        ),
        fullPage: true,
      });
      results.push({
        ok: false,
        step: "create → redirect detail",
        reason: `path=${p} | err=${errSnippet.slice(0, 300)}`,
      });
    }
  }

  // 9) Detail H1 含姓名
  if (createdId) {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes(newName)
        ? { ok: true, step: "detail H1 has name" }
        : { ok: false, step: "detail H1 has name", reason: `h1="${h1}"` },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `aftersales-dormant-detail-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 10) breadcrumb 顯示「休眠流失管理」
  if (createdId) {
    const body = await page.locator("body").innerText().catch(() => "");
    results.push(
      body.includes("休眠流失管理")
        ? { ok: true, step: "detail breadcrumb shows listLabel" }
        : { ok: false, step: "detail breadcrumb shows listLabel" },
    );
  }

  // 11) 點「喚回」(view mode 按鈕)
  if (createdId) {
    await page.locator('button:has-text("喚回")').first().click();
    await page.waitForTimeout(1500);
    const body = await page.locator("body").innerText().catch(() => "");
    results.push(
      body.includes("已記錄一次喚回") || body.includes("累計喚回次數")
        ? { ok: true, step: "revive button works" }
        : { ok: false, step: "revive button works" },
    );
  }

  // 12) 回 list 確認新筆有
  if (createdId) {
    await page.goto(`${BASE}/aftersales/crm/dormant-customers`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const body = await page.locator("body").innerText().catch(() => "");
    results.push(
      body.includes(newName)
        ? { ok: true, step: "new row visible in list" }
        : { ok: false, step: "new row visible in list" },
    );
  }

  // 13) Cleanup — DB delete
  if (createdId) {
    await page.goto(`${BASE}/aftersales/crm/dormant-customers/${createdId}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await page.locator('button:has-text("刪除")').first().click();
    await page
      .waitForURL(`${BASE}/aftersales/crm/dormant-customers`, {
        timeout: NAV_TIMEOUT,
      })
      .catch(() => {});
    results.push({ ok: true, step: "cleanup delete" });
  }

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(JSON.stringify({ results, consoleErrors, failed }, null, 2));
  if (failed.length > 0 || consoleErrors.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[aftersales-dormant-smoke] unexpected", e);
  process.exit(2);
});
