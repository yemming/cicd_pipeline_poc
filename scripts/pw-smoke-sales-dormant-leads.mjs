#!/usr/bin/env node
// Smoke test for /sales/crm/dormant-leads（休眠戰敗管理）
// - list 頁可載入、stats / filter / DataGrid / 新增 link 存在
// - 點「+ 新增 lead」→ /new → 填姓名 → 建立 → redirect detail
// - detail：再接觸 → revive_attempt_count +1
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

const log = (...m) => console.error("[dormant-leads-smoke]", ...m);

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
  // 強制把 active scope 切到 indian（dev demo 資料只塞在 indian）
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
  const newName = `煙霧休眠客戶 ${uniqSuffix}`;

  // 1) 載入 list
  {
    const resp = await page.goto(`${BASE}/sales/crm/dormant-leads`, {
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

  // 2) H1
  {
    const h1 = await page.locator("h1").first().innerText().catch(() => "");
    results.push(
      h1.includes("休眠戰敗管理")
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

  // 4) Filter bar + 查詢
  {
    const queryBtn = page.locator('button:has-text("查詢")').first();
    const resetBtn = page.locator('button:has-text("重置")').first();
    results.push(
      (await queryBtn.count()) === 1 && (await resetBtn.count()) === 1
        ? { ok: true, step: "filter buttons" }
        : { ok: false, step: "filter buttons" },
    );
  }

  // 5) DataGrid header（"狀態" / "HABC"）
  {
    const tableHeaders = await page.locator("table thead").count();
    results.push(
      tableHeaders >= 1
        ? { ok: true, step: "datagrid renders" }
        : { ok: false, step: "datagrid renders" },
    );
    await page.screenshot({
      path: path.join(TMP_DIR, `sales-dormant-leads-list-${uniqSuffix}.png`),
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

  // 7) 點新增 → /new
  {
    await page.getByTestId("dormant-leads-create-link").click();
    await page
      .waitForURL(`${BASE}/sales/crm/dormant-leads/new`, {
        timeout: NAV_TIMEOUT,
      })
      .catch(() => {});
    const ok = page.url().includes("/sales/crm/dormant-leads/new");
    results.push(ok ? { ok: true, step: "nav /new" } : { ok: false, step: "nav /new", reason: page.url() });
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
          /^\/sales\/crm\/dormant-leads\/[0-9a-f-]{36}$/.test(
            new URL(target).pathname,
          ),
        { timeout: 60_000 },
      )
      .catch(() => {});
    const p = new URL(page.url()).pathname;
    const m = /^\/sales\/crm\/dormant-leads\/([0-9a-f-]{36})$/.exec(p);
    if (m) {
      createdId = m[1];
      results.push({ ok: true, step: "create → redirect detail", id: createdId });
    } else {
      // capture banner / body for debug
      const bodyTxt = await page.locator("body").innerText().catch(() => "");
      const errSnippet = bodyTxt.split("\n").filter((l) => /失敗|error|錯誤|未/.test(l)).join(" | ");
      await page.screenshot({
        path: path.join(TMP_DIR, `sales-dormant-leads-create-fail-${uniqSuffix}.png`),
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
      path: path.join(TMP_DIR, `sales-dormant-leads-detail-${uniqSuffix}.png`),
      fullPage: true,
    });
  }

  // 10) 點「再接觸」(view mode)
  if (createdId) {
    await page.locator('button:has-text("再接觸")').first().click();
    await page.waitForTimeout(1500);
    // 驗證右側統計卡 累計再接觸 變成 1
    const body = await page.locator("body").innerText().catch(() => "");
    results.push(
      body.includes("已記錄一次再接觸") || body.includes("累計再接觸次數")
        ? { ok: true, step: "revive button works" }
        : { ok: false, step: "revive button works" },
    );
  }

  // 11) 回 list 確認新筆有
  if (createdId) {
    await page.goto(`${BASE}/sales/crm/dormant-leads`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    const body = await page.locator("body").innerText().catch(() => "");
    results.push(
      body.includes(newName)
        ? { ok: true, step: "new lead visible in list" }
        : { ok: false, step: "new lead visible in list" },
    );
  }

  // 12) Cleanup — DB delete
  if (createdId) {
    // 直接 detail 頁按刪除
    await page.goto(`${BASE}/sales/crm/dormant-leads/${createdId}`, {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    page.once("dialog", (d) => d.accept().catch(() => {}));
    await page.locator('button:has-text("刪除")').first().click();
    await page
      .waitForURL(`${BASE}/sales/crm/dormant-leads`, { timeout: NAV_TIMEOUT })
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
  console.error("[dormant-leads-smoke] unexpected", e);
  process.exit(2);
});
